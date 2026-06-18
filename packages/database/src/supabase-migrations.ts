export type MigrationModule = "core" | "ai-retrieval" | "development-seed";

export type MigrationScope =
  | "reservation-platform"
  | "optional-ai-retrieval"
  | "project-play-compatibility";

export type SupabaseMigrationKind = "core" | "optional" | "development-seed";

export interface SupabaseMigrationIndexEntry {
  readonly kind: SupabaseMigrationKind;
  readonly order?: number;
  readonly path: string;
  readonly module: MigrationModule;
  readonly scope: MigrationScope;
  readonly sha256: string;
  readonly bytes: number;
}

export interface SupabaseMigrationIndex {
  readonly schemaVersion: number;
  readonly artifact: string;
  readonly coreMigrations: readonly SupabaseMigrationIndexEntry[];
  readonly optionalMigrations: readonly SupabaseMigrationIndexEntry[];
  readonly developmentSeeds: readonly SupabaseMigrationIndexEntry[];
}

export interface MigrationPlanOptions {
  readonly includeAiRetrieval?: boolean;
  readonly includeDevelopmentSeeds?: boolean;
}

export interface MigrationPlanResult {
  readonly migrations: readonly SupabaseMigrationIndexEntry[];
  readonly seeds: readonly SupabaseMigrationIndexEntry[];
  readonly entries: readonly SupabaseMigrationIndexEntry[];
}

export interface MigrationSqlSource {
  readonly entry: SupabaseMigrationIndexEntry;
  readonly sql: string;
}

export interface MigrationExecutionPlan {
  readonly migrations: readonly MigrationSqlSource[];
  readonly seeds: readonly MigrationSqlSource[];
}

export interface MigrationPlanEntry extends MigrationSqlSource {}

export interface MigrationExecutor<TResult = unknown> {
  execute(plan: MigrationExecutionPlan): Promise<TResult>;
}

const expectedArtifact = "@reservation-platform/database/supabase-migration-index";
const requiredEntryFields = ["path", "module", "scope", "sha256", "bytes"] as const;

export function loadSupabaseMigrationIndex(input: unknown): SupabaseMigrationIndex {
  const value = expectRecord(input, "migration index");

  if (value.schemaVersion !== 1) {
    throw new Error("migration index schemaVersion must be 1");
  }

  if (value.artifact !== expectedArtifact) {
    throw new Error(`migration index artifact must be ${expectedArtifact}`);
  }

  const coreMigrations = normalizeEntries(value.coreMigrations, "coreMigrations", "core");
  const optionalMigrations = normalizeEntries(value.optionalMigrations, "optionalMigrations", "optional");
  const developmentSeeds = normalizeEntries(value.developmentSeeds, "developmentSeeds", "development-seed");

  assertUniquePaths([...coreMigrations, ...optionalMigrations, ...developmentSeeds]);
  assertContiguousCoreOrders(coreMigrations);
  assertContiguousOptionalPathOrder(optionalMigrations);

  return {
    schemaVersion: value.schemaVersion,
    artifact: value.artifact,
    coreMigrations: Object.freeze([...coreMigrations]),
    optionalMigrations: Object.freeze([...optionalMigrations]),
    developmentSeeds: Object.freeze([...developmentSeeds]),
  };
}

export function buildSupabaseMigrationPlan(
  index: SupabaseMigrationIndex,
  options: MigrationPlanOptions = {},
): MigrationPlanResult {
  const migrations = Object.freeze([
    ...index.coreMigrations,
    ...(options.includeAiRetrieval ? index.optionalMigrations : []),
  ]);
  const seeds = Object.freeze(options.includeDevelopmentSeeds ? [...index.developmentSeeds] : []);

  return {
    migrations,
    seeds,
    entries: Object.freeze([...migrations, ...seeds]),
  };
}

function normalizeEntries(
  input: unknown,
  fieldName: string,
  kind: SupabaseMigrationKind,
): SupabaseMigrationIndexEntry[] {
  if (!Array.isArray(input)) {
    throw new Error(`migration index ${fieldName} must be an array`);
  }

  return input.map((entry, index) => normalizeEntry(entry, `${fieldName}[${index}]`, kind));
}

function normalizeEntry(
  input: unknown,
  label: string,
  kind: SupabaseMigrationKind,
): SupabaseMigrationIndexEntry {
  const entry = expectRecord(input, label);

  for (const field of requiredEntryFields) {
    if (!(field in entry)) {
      throw new Error(`${label}.${field} is required`);
    }
  }

  const order = entry.order;

  let normalizedOrder: number | undefined;
  if (kind === "core") {
    if (!isNonNegativeInteger(order)) {
      throw new Error(`${label}.order is required for core migrations`);
    }
    normalizedOrder = order;
  } else if ("order" in entry && order !== undefined) {
    throw new Error(`${label}.order is only supported for core migrations`);
  }

  assertString(entry.path, `${label}.path`);
  assertString(entry.module, `${label}.module`);
  assertString(entry.scope, `${label}.scope`);
  assertString(entry.sha256, `${label}.sha256`);
  assertPackageSqlPath(entry.path, kind, `${label}.path`);
  assertSha256(entry.sha256, `${label}.sha256`);

  if (!isNonNegativeInteger(entry.bytes)) {
    throw new Error(`${label}.bytes must be a non-negative integer`);
  }

  assertModule(entry.module, `${label}.module`);
  assertScope(entry.scope, `${label}.scope`);
  assertKindMatchesEntry(kind, entry, label);

  return Object.freeze({
    kind,
    order: normalizedOrder,
    path: entry.path,
    module: entry.module,
    scope: entry.scope,
    sha256: entry.sha256,
    bytes: entry.bytes,
  });
}

function assertUniquePaths(entries: readonly SupabaseMigrationIndexEntry[]): void {
  const paths = new Set<string>();

  for (const entry of entries) {
    if (paths.has(entry.path)) {
      throw new Error(`duplicate migration index path: ${entry.path}`);
    }
    paths.add(entry.path);
  }
}

function assertContiguousCoreOrders(entries: readonly SupabaseMigrationIndexEntry[]): void {
  const orders = new Set<number>();

  for (const [index, entry] of entries.entries()) {
    if (entry.order === undefined) {
      continue;
    }
    if (orders.has(entry.order)) {
      throw new Error(`duplicate core migration order: ${entry.order}`);
    }
    if (entry.order !== index + 1) {
      throw new Error(`core migration order must be contiguous and sorted from 1; expected ${index + 1}, received ${entry.order}`);
    }
    orders.add(entry.order);
  }
}

function assertContiguousOptionalPathOrder(entries: readonly SupabaseMigrationIndexEntry[]): void {
  for (const [index, entry] of entries.entries()) {
    const expectedOrder = String(index + 1).padStart(6, "0");
    const actualOrder = entry.path.match(/\/(\d{6})_[^/]+\.sql$/)?.[1];

    if (actualOrder !== expectedOrder) {
      throw new Error(
        `optional migration paths must be contiguous and sorted from 000001; expected ${expectedOrder}, received ${actualOrder ?? "none"}`,
      );
    }
  }
}

function assertPackageSqlPath(pathValue: string, kind: SupabaseMigrationKind, label: string): void {
  if (
    isAbsolutePath(pathValue) ||
    pathValue.includes("\\") ||
    pathValue.split("/").includes("..") ||
    !pathValue.endsWith(".sql")
  ) {
    throw new Error(`${label} must be a package-relative SQL path`);
  }

  if (kind === "core" && !/^packages\/database\/migrations\/supabase\/\d{6}_[^/]+\.sql$/.test(pathValue)) {
    throw new Error(`${label} must point to a core Supabase migration`);
  }

  if (
    kind === "optional" &&
    !/^packages\/database\/migrations\/supabase\/optional\/ai-retrieval\/\d{6}_[^/]+\.sql$/.test(pathValue)
  ) {
    throw new Error(`${label} must point to an optional AI retrieval migration`);
  }

  if (
    kind === "development-seed" &&
    !/^packages\/database\/seeds\/development\/[^/]+\.sql$/.test(pathValue)
  ) {
    throw new Error(`${label} must point to a development seed SQL file`);
  }
}

function isAbsolutePath(pathValue: string): boolean {
  return pathValue.startsWith("/") || /^[A-Za-z]:/.test(pathValue);
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 64-character sha256 hex digest`);
  }
}

function assertKindMatchesEntry(
  kind: SupabaseMigrationKind,
  entry: Record<string, unknown>,
  label: string,
): void {
  if (kind === "core" && (entry.module !== "core" || entry.scope !== "reservation-platform")) {
    throw new Error(`${label} must be a core reservation-platform migration`);
  }

  if (kind === "optional" && (entry.module !== "ai-retrieval" || entry.scope !== "optional-ai-retrieval")) {
    throw new Error(`${label} must be an optional AI retrieval migration`);
  }

  if (
    kind === "development-seed" &&
    (entry.module !== "development-seed" || entry.scope !== "project-play-compatibility")
  ) {
    throw new Error(`${label} must be a development seed entry`);
  }
}

function assertModule(value: string, label: string): asserts value is MigrationModule {
  if (value !== "core" && value !== "ai-retrieval" && value !== "development-seed") {
    throw new Error(`${label} is not a supported migration module`);
  }
}

function assertScope(value: string, label: string): asserts value is MigrationScope {
  if (
    value !== "reservation-platform" &&
    value !== "optional-ai-retrieval" &&
    value !== "project-play-compatibility"
  ) {
    throw new Error(`${label} is not a supported migration scope`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}
