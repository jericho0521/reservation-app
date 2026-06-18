import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkMode = process.argv.includes("--check");

const artifactDir = path.join(
  repoRoot,
  "docs/package-refactor/backend-platform-extraction/sdk-readiness/release-artifacts",
);

const compatibilityMatrixPath = path.join(artifactDir, "compatibility-matrix.md");
const releaseNotesPath = path.join(artifactDir, "release-notes.md");

const sdkPackage = await readJson("packages/sdk/package.json");
const contractPackage = await readJson("packages/contract-types/package.json");
const openapi = await readJson("packages/contract-types/contracts/openapi.json");

const apiVersion = detectApiVersion(openapi);
const openapiVersion = openapi.openapi ?? "unknown";
const contractArtifactVersion = openapi.info?.version ?? "unknown";

const generatedFiles = new Map([
  [compatibilityMatrixPath, renderCompatibilityMatrix()],
  [releaseNotesPath, renderReleaseNotes()],
]);

if (checkMode) {
  const stale = [];

  for (const [filePath, expectedContent] of generatedFiles) {
    let currentContent = "";
    try {
      currentContent = await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      stale.push(`${path.relative(repoRoot, filePath)} is missing`);
      continue;
    }

    if (currentContent !== expectedContent) {
      stale.push(`${path.relative(repoRoot, filePath)} is stale`);
    }
  }

  if (stale.length > 0) {
    throw new Error(
      [
        "SDK release artifacts are missing or stale:",
        ...stale.map((issue) => `- ${issue}`),
        "Run `corepack pnpm run sdk:release-artifacts:generate` to refresh them.",
      ].join("\n"),
    );
  }

  console.log("SDK release artifacts are current.");
} else {
  await mkdir(artifactDir, { recursive: true });
  for (const [filePath, content] of generatedFiles) {
    await writeFile(filePath, content, "utf8");
  }
  console.log("Generated SDK release artifacts.");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

function detectApiVersion(openapiDocument) {
  const paths = Object.keys(openapiDocument.paths ?? {});
  const versionedPath = paths.find((routePath) => /^\/v\d+(?:\/|$)/.test(routePath));
  const apiVersion = versionedPath?.match(/^\/v\d+/)?.[0];

  if (!apiVersion) {
    throw new Error(
      "Unable to detect a supported API version from OpenAPI paths. Expected at least one path beginning with `/vN`, such as `/v1`.",
    );
  }

  return apiVersion;
}

function renderCompatibilityMatrix() {
  const rows = [
    ["SDK version", `\`${sdkPackage.version}\``],
    ["Contract types version", `\`${contractPackage.version}\``],
    ["Supported API version", `\`${apiVersion}\` preview`],
    ["OpenAPI artifact", `OpenAPI \`${openapiVersion}\`, contract artifact version \`${contractArtifactVersion}\``],
    ["Backend minimum", "Current local backend `/api/v1` implementation from this repository; no standalone backend tag has been cut."],
    ["Backend current status", "Local release-candidate only; `sdk:live-parity` checks live parity readiness and skips safely without live env. When configured, it compares SDK/direct HTTP metadata, service, resource, availability, and reservation list/summary reads against the same `/v1` backend. Strict live seeded backend proof is still pending until `sdk:live-parity:strict` passes with mutation opt-in against a disposable seeded backend, including reservation SDK create, direct HTTP idempotency replay, reservation read/list parity, and resource-maintenance list/create/end idempotency replay parity."],
    ["Optional modules/chat status", "Disabled-chat errors and enabled-chat SDK/direct HTTP JSON, stream, and confirm response parity are smoke-tested with fixture-local `/v1/chat` backends. Real provider workflow, retrieval, checkpoint, and live enabled-chat backend parity remain pending."],
    ["Install modes covered", "Local tarball fixtures for plain TypeScript, server-to-server, Vite/React, separate Next.js, disabled-chat, and enabled-chat consumers; local package packing and boundary verification also cover backend-owned `@reservation-platform/ai-chat` and `@reservation-platform/database` tarballs."],
    ["Registry install status", "Private registry and public npm install checks are not complete."],
    ["Known gaps", "Strict live seeded backend parity proof, real enabled-chat provider/workflow parity, public/private registry verification, executed database migrations, RLS/tenant isolation proof, durable database-backed idempotency proof, live provider configuration/operational key rotation, and final standalone backend extraction remain open. The standalone backend extraction manifest now explicitly plans the `packages/database` package plus the optional `packages/ai-chat` package, while current/root/package SQL stays reconciliation/reference input mapped by the SQL ownership inventory and migration bundle manifest. The database package now carries concrete verified extensions, tenant/auth, catalog, resources, bookings, resource-maintenance, availability-rule, atomic reservation RPC, RLS, core security hardening, platform idempotency migration assets, and a generated migration-index checksum/apply-plan artifact; local tarball boundary proof now also packs and inspects the backend-owned database and ai-chat artifacts. These guardrails do not populate a standalone repo, create or migrate a database, prove live RLS/tenant behavior, prove live durable idempotency, configure a live auth provider, prove provider operational rotation, deploy a backend, or publish packages."],
  ];

  return [
    "# SDK Compatibility Matrix",
    "",
    "<!-- Generated by scripts/generate-sdk-release-artifacts.mjs. Do not edit by hand. -->",
    "",
    "| Field | Current release candidate |",
    "| --- | --- |",
    ...rows.map(([field, value]) => `| ${field} | ${value} |`),
    "",
    "## Compatibility Notes",
    "",
    "- The SDK remains an HTTP client for the backend platform API and supports modern browsers and Node runtimes with global `fetch` or a caller-provided fetch implementation.",
    "- Callers must provide tenant, venue, auth, correlation, and idempotency context according to the Phase 5 contract docs.",
    "- `ReservationResponse` remains the canonical reservation DTO for this release-candidate track.",
    "- `rescheduleReservation` covers movement changes; `updateReservation` covers non-slot patches.",
    "- This matrix is generated for local release-candidate validation only and must not be treated as evidence of private registry, public npm, or live backend readiness.",
    "",
  ].join("\n");
}

function renderReleaseNotes() {
  return [
    "# SDK Release Notes",
    "",
    "<!-- Generated by scripts/generate-sdk-release-artifacts.mjs. Do not edit by hand. -->",
    "",
    `Release candidate: \`${sdkPackage.name}@${sdkPackage.version}\` with \`${contractPackage.name}@${contractPackage.version}\``,
    "",
    "## Generated Evidence",
    "",
    "- Package boundary checks are wired through `packages:verify-boundaries` and inspect packed tarballs for expected files, exports, dependency metadata, forbidden imports, server-only APIs, app internals, provider SDKs, storage adapters, and secrets, including backend-owned `@reservation-platform/ai-chat` and SQL-only `@reservation-platform/database` artifacts.",
    "- Local tarball fixtures are wired through `sdk:fixtures:check-tarballs`, `sdk:smoke:install`, and `sdk:smoke` for plain TypeScript, server-to-server, Vite/React, separate Next.js, disabled-chat, and enabled-chat consumer shapes.",
    "- Contract artifact drift is checked before packing with `@reservation-platform/contract-types` `contracts:check` against package-owned OpenAPI and JSON Schema artifacts.",
    "- Standalone backend extraction readiness is checked with `backend-platform:verify-extraction-manifest`, which validates move/copy candidates, compatibility shims, exclusions, target repo areas, frontend/current-app exclusion guardrails, exact required backend package entries for `packages/ai-chat` and `packages/database`, and blocks extra move/copy entries from targeting at or under those package roots unless every source already comes from that same package subtree.",
    "- Standalone backend extraction dry-run planning is checked with `backend-platform:verify-extraction-dry-run`, which enumerates move/copy candidate files, excludes generated/install/cache artifacts, treats compatibility shims as reimplementation references only, verifies exclusions are not planned, fails on ambiguous targets, collisions, invalid paths, frontend targets, or generated artifact inclusion, and directly plans the `packages/ai-chat` and `packages/database` packages without copying legacy chat or SQL reconciliation inputs into extra package files.",
    "- Database migration bundle planning is checked with `database:verify-migration-bundle`, which validates the generated package-owned migration index for exact core order, optional AI retrieval classification, development seed classification, repo-relative paths, sha256 checksums, and byte sizes; then validates the Phase 5 manifest mapping from current SQL inventory assets to ordered core migration targets, optional AI retrieval targets, development seed/compat targets, duplicate-only atomic RPC evidence, non-platform exclusions, and critical concrete extensions, tenant/auth, catalog, resource, booking, resource-maintenance, availability-rule, atomic reservation RPC, RLS, core security hardening, and idempotency SQL semantics in the package-owned migration files.",
    "- Standalone API skeleton auth readiness is checked with `backend-platform:verify-standalone-api-skeleton`, covering provider-neutral JWT/JWKS bearer verification, bounded in-memory JWKS cache behavior, unknown-`kid` refresh, decoded-claim principal mapping, service-token bypass, tenant/venue authorization plumbing, and fail-closed verifier errors without provider SDK imports.",
    "- Current frontend booking platform smoke is wired through `current-frontend:platform-smoke` using mocked platform-mode browser wiring.",
    "- Current frontend admin platform smoke is wired through `current-frontend:admin-platform-smoke` using mocked platform-mode browser wiring.",
    "- Live backend parity readiness is wired through `sdk:live-parity`; it validates the live env contract and skips safely when the required live env is absent. When configured, it compares SDK/direct HTTP metadata, service, resource, availability, and reservation list/summary reads against the same live `/v1` backend. Strict live proof is run with `sdk:live-parity:strict` after seeding a disposable backend fixture and setting `RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1`; strict mode creates a reservation through the SDK, replays the same idempotency key through direct HTTP, compares reservation reads through both paths, compares reservation list/summary responses for the created reservation context, and then proves resource-maintenance list/create/end SDK/direct HTTP parity with idempotency replay for create and end.",
    "- Publish/pilot readiness is separated from the local gate through `sdk:release-gate:strict`, which runs `sdk:release-gate` and then requires strict live backend parity. A skipped live parity check is therefore not considered a completed plug-and-play backend proof.",
    "- Disabled-chat behavior is covered by the disabled-chat external fixture. Enabled-chat local contract parity is covered by the enabled-chat external fixture for metadata module reporting, chat session creation, JSON message actions, NDJSON stream chunks, confirmation payloads, header/idempotency forwarding, and SDK/direct HTTP response parity.",
    "",
    "## Compatibility",
    "",
    `- Supported API version for this release candidate: \`${apiVersion}\` preview.`,
    `- Contract artifact source: OpenAPI \`${openapiVersion}\` with artifact version \`${contractArtifactVersion}\`.`,
    "- Backend support is limited to the current local `/api/v1` implementation in this repository until a standalone backend release tag exists.",
    "",
    "## Remaining Non-Release Gaps",
    "",
    "- Strict live seeded backend parity is not complete until `sdk:live-parity:strict` passes with `RESERVATION_PLATFORM_LIVE_BASE_URL`, `RESERVATION_PLATFORM_LIVE_TENANT_ID`, `RESERVATION_PLATFORM_LIVE_API_KEY`, `RESERVATION_PLATFORM_LIVE_SERVICE_ID`, `RESERVATION_PLATFORM_LIVE_RESOURCE_ID`, `RESERVATION_PLATFORM_LIVE_START_AT`, `RESERVATION_PLATFORM_LIVE_END_AT`, and `RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1` configured against a disposable seeded backend. The strict verifier is ready to cover reservation create/read/list replay plus resource-maintenance list/create/end replay, but migration execution, tenant/RLS proof, live durable idempotency, live provider configuration, provider operational key rotation, registry install verification, deployment, and final standalone backend extraction remain unproven until that live run passes.",
    "- Real enabled-chat backend/provider workflow parity is not complete; the current enabled-chat proof uses a fixture-local fake `/v1/chat` backend and does not run LangChain, retrieval, checkpoint persistence, provider adapters, or live backend chat configuration.",
    "- Private registry and public npm publish/install verification are not complete.",
    "- Final standalone backend extraction and backend release tagging are not complete. The extraction manifest, dry-run extraction plan, SQL ownership inventory, migration bundle manifest, migration index, standalone JWT/JWKS verifier, and bounded JWKS cache tests are checked guardrails only; they do not create or populate the future backend repository, execute SQL, create a database, prove RLS/tenant isolation, prove durable idempotency behavior against a database, configure a live auth provider, prove provider operational key rotation, deploy a backend, publish packages, or prove live parity.",
    "- Public support, deprecation, security contact, provenance, and post-publish verification docs remain outside this local release-candidate artifact.",
    "",
  ].join("\n");
}
