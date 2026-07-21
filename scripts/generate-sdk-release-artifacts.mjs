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
const reactPackage = await readJson("packages/reservation-react/package.json");
const uiPackage = await readJson("packages/reservation-ui/package.json");
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
        "Run `pnpm run sdk:release-artifacts:generate` to refresh them.",
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
    ["React package version", `\`${reactPackage.version}\``],
    ["UI package version", `\`${uiPackage.version}\``],
    ["Supported API version", `\`${apiVersion}\` preview`],
    ["OpenAPI artifact", `OpenAPI \`${openapiVersion}\`, contract artifact version \`${contractArtifactVersion}\``],
    ["Backend minimum", "Standalone backend `/v1` implementation from this backend modules branch; no hosted release tag has been cut."],
    ["Backend current status", "Local release-candidate readiness only; `sdk:live-parity` uses the exported and unit-tested `readLiveBackendParityConfig` parser for env trim/normalization, strict readiness, malformed config reporting, and mutation opt-in decisions, then skips safely without live env. When configured, it compares SDK/direct HTTP metadata, service, resource, availability, and reservation list/summary reads against the same `/v1` backend. Strict live seeded backend proof remains unproven until `sdk:live-parity:strict` passes with mutation opt-in against a disposable seeded backend, including reservation SDK create, direct HTTP idempotency replay, reservation read/list parity, and resource-maintenance list/create/end idempotency replay parity."],
    ["Optional modules/chat status", "Disabled-chat errors and enabled-chat SDK/direct HTTP JSON, stream, and confirm response parity are smoke-tested with fixture-local `/v1/chat` backends. Hybrid knowledge contracts, citations, local embedding, indexing, and scoped retrieval are verified separately; real BYOK provider delivery remains environment-dependent."],
    ["Install modes covered", "Local package packing and boundary verification cover the public SDK, contract-types, React, and UI packages plus backend-owned artifacts. The published self-hosted release bundle includes all four matching frontend toolkit tarballs under `packages/`."],
    ["Frontend consumer status", "The repository contains appointment booking and owner-console frontends. Independent package-consumer proof installs only the four released frontend toolkit artifacts; clean Docker live parity proves their booking operations against the standalone `/v1` backend."],
    ["Registry install status", `Disposable strict proof serves exact \`${sdkPackage.name}@${sdkPackage.version}\`, \`${contractPackage.name}@${contractPackage.version}\`, \`${reactPackage.name}@${reactPackage.version}\`, and \`${uiPackage.name}@${uiPackage.version}\` artifacts from a temporary local npm-compatible registry, installs them without overrides into an external temp consumer, and typechecks SDK, contract, React, and visual-preset imports. Private registry and public npm publication are not required for the bundled self-hosted release path.`],
    ["Extracted backend install/build/test status", "`backend-platform:extracted-install-proof` is wired as a CI-safe prepared-root env contract harness. In default mode it validates the configured prepared extracted backend root metadata when present, reports `SKIPPED` or `READY`, and never installs dependencies, calls the network, publishes packages, or executes generated backend commands. Actual clean extracted install/build/test proof is gated by `backend-platform:extracted-install-proof:strict`, which requires `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT` to point at a prepared extracted backend workspace outside the current repo plus `RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL=1`; strict mode runs only `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm run phase-11:verify-generated-backend-workspace`. Install lifecycle scripts are disabled, and the generated backend workspace verifier still runs after install. This strict proof has passed once against the external prepared backend root `C:\\tmp\\reservation-separation-proofs\\standalone-backend-extraction-yBf9oq`."],
    ["Known gaps", "Strict live seeded backend parity proof, real enabled-chat provider/workflow parity, public/private registry install verification if required by release, live provider configuration/operational key rotation, hosted backend deployment, and final public release tagging remain open. The backend extraction manifest explicitly tracks `apps/api`, backend packages, database package assets, and the optional `packages/ai-chat` package. These guardrails and passed local proofs do not configure a live auth provider, prove provider operational rotation, publish packages, or prove public/private registry installation."],
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
    "- This matrix is generated for local release-candidate validation only and must not be treated as evidence of private registry, public npm, or live backend readiness until the matching strict configured proof commands pass.",
    "",
  ].join("\n");
}

function renderReleaseNotes() {
  return [
    "# SDK Release Notes",
    "",
    "<!-- Generated by scripts/generate-sdk-release-artifacts.mjs. Do not edit by hand. -->",
    "",
    `Release candidate: \`${sdkPackage.name}@${sdkPackage.version}\`, \`${contractPackage.name}@${contractPackage.version}\`, \`${reactPackage.name}@${reactPackage.version}\`, and \`${uiPackage.name}@${uiPackage.version}\``,
    "",
    "## Generated Evidence",
    "",
    "- Package boundary checks are wired through `packages:verify-boundaries` and inspect packed tarballs for expected files, exports, dependency metadata, forbidden imports, server-only APIs, app internals, provider SDKs, storage adapters, and secrets, including backend-owned `@reservation-platform/ai-chat` and SQL-only `@reservation-platform/database` artifacts.",
    "- Local tarball fixtures are wired through `sdk:fixtures:check-tarballs`, `sdk:smoke:install`, and `sdk:smoke` for plain TypeScript, server-to-server, Vite/React, separate Next.js, disabled-chat, and enabled-chat consumer shapes.",
    "- Contract artifact drift is checked before packing with `@reservation-platform/contract-types` `contracts:check` against package-owned OpenAPI and JSON Schema artifacts.",
    "- Standalone backend extraction readiness is checked with `backend-platform:verify-extraction-manifest`, which validates move/copy candidates, compatibility shims, exclusions, target repo areas, frontend/current-app exclusion guardrails, exact required backend package entries for `packages/ai-chat` and `packages/database`, and blocks extra move/copy entries from targeting at or under those package roots unless every source already comes from that same package subtree.",
    "- Standalone backend extraction dry-run planning is checked with `backend-platform:verify-extraction-dry-run`, which enumerates move/copy candidate files, excludes generated/install/cache artifacts, treats compatibility shims as reimplementation references only, verifies exclusions are not planned, fails on ambiguous targets, collisions, invalid paths, frontend targets, or generated artifact inclusion, and directly plans the `packages/ai-chat` and `packages/database` packages without copying legacy chat or SQL reconciliation inputs into extra package files.",
    "- Extracted backend workspace readiness is checked with `backend-platform:verify-extracted-workspace-readiness`, which validates the extracted workspace/package metadata model from the manifest and package manifests, including planned package root renames, required root/package scripts, local workspace dependency resolution, frontend/current-app source exclusion, and SDK consumer-safety. This is local model proof only; it does not create a repository, install dependencies, run an extracted build, publish packages, deploy a backend, or connect to live services.",
    "- Extracted backend install/build/test proof is wired through `backend-platform:extracted-install-proof`; it is a CI-safe prepared-root harness that validates the env contract and generated root metadata shape when configured, then reports `SKIPPED` or `READY` by default without install, network, publish, or generated backend command execution. Actual clean extracted install/build/test execution is gated by `backend-platform:extracted-install-proof:strict`, which requires `RESERVATION_EXTRACTED_BACKEND_PROOF_ROOT` to point at a prepared extracted backend workspace outside the current repository and `RESERVATION_EXTRACTED_BACKEND_PROOF_ALLOW_INSTALL=1` before it may run the allowlisted `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm run phase-11:verify-generated-backend-workspace` commands in that workspace. Install lifecycle scripts are disabled, and the generated backend workspace verifier still runs after install. The strict proof passed once against `C:\\tmp\\reservation-separation-proofs\\standalone-backend-extraction-yBf9oq`.",
    "- Database migration bundle planning is checked with `database:verify-migration-bundle`, which validates the generated package-owned migration index for exact core order through `000040_ai_knowledge_retrieval.sql`, obsolete optional AI retrieval compatibility-artifact classification, development seed classification, repo-relative paths, sha256 checksums, and byte sizes; then validates the migration manifest mapping from current SQL inventory assets to ordered core migration targets, compatibility targets, development seed/compat targets, duplicate-only atomic RPC evidence, non-platform exclusions, and critical concrete schema and security semantics in the package-owned migration files.",
    "- Disposable database behavior proof is wired through `database:live-proof:strict`; it passed once against a named Docker Postgres container by applying all backend-owned package migrations, then verifying booking RLS, public booking insert policy, anon catalog reads, anon booking insert, non-admin authenticated booking invisibility, admin authenticated booking visibility, and durable idempotency claim/store/replay through database RPCs.",
    "- Standalone API skeleton auth readiness is checked with `backend-platform:verify-standalone-api-skeleton`, covering provider-neutral JWT/JWKS bearer verification, bounded in-memory JWKS cache behavior, unknown-`kid` refresh, decoded-claim principal mapping, service-token bypass, tenant/venue authorization plumbing, and fail-closed verifier errors without provider SDK imports.",
    "- Standalone backend health proof is wired through `backend-platform:live-proof:strict`; it passed once against a local `apps/api` Node process outside any frontend runtime and validated the `/v1/health` response contract. This is health-only evidence, not DB-backed API parity.",
    "- Live backend parity readiness is wired through `sdk:live-parity`; it uses the exported and unit-tested `readLiveBackendParityConfig` parser for env trim/normalization, strict readiness, malformed config reporting, and mutation opt-in decisions, then skips safely when required live env is absent. When configured, it compares SDK/direct HTTP metadata, service, resource, availability, and reservation list/summary reads against the same live `/v1` backend. Strict seeded backend parity remains readiness-only and unproven until `sdk:live-parity:strict` passes against disposable seeded backend data with `RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1`; strict mode creates a reservation through the SDK, replays the same idempotency key through direct HTTP, compares reservation reads through both paths, compares reservation list/summary responses for the created reservation context, and then proves resource-maintenance list/create/end SDK/direct HTTP parity with idempotency replay for create and end.",
    "- Registry install readiness is wired through `sdk:registry-install-proof`; it uses the exported and unit-tested `readSdkRegistryInstallConfig` parser for private/public/disposable mode selection, exact package version specs, private registry URL/token shape, package-manager validation, strict readiness, and explicit install opt-in. Default CI validates the contract and skips without installing or publishing when registry proof env is absent or incomplete. Disposable strict proof starts a temporary local npm-compatible registry, serves packed SDK, contract-types, React, and UI artifacts plus local dependency tarballs, installs exact package specs into an external temp consumer, and typechecks the complete frontend toolkit. Public/private registry proof remains separate and never publishes without explicit approval.",
    "- Publish/pilot readiness requires strict live backend proof, strict database live proof, strict SDK/direct live backend parity, and strict registry install proof. The packaged consumer proof must install only the matching release artifacts and must not reference monorepo source.",
    "- Disabled-chat behavior is covered by the disabled-chat external fixture. Enabled-chat local contract parity is covered by the enabled-chat external fixture for metadata module reporting, chat session creation, JSON message actions, NDJSON stream chunks, confirmation payloads, header/idempotency forwarding, and SDK/direct HTTP response parity.",
    "",
    "## Compatibility",
    "",
    `- Supported API version for this release candidate: \`${apiVersion}\` preview.`,
    `- Contract artifact source: OpenAPI \`${openapiVersion}\` with artifact version \`${contractArtifactVersion}\`.`,
    "- Backend support is limited to the local standalone `/v1` implementation in this backend branch until a hosted backend release tag exists.",
    "",
    "## Remaining Non-Release Gaps",
    "",
    `- Strict disposable registry installation has passed with exact \`${sdkPackage.name}@${sdkPackage.version}\` and \`${contractPackage.name}@${contractPackage.version}\` artifacts and no consumer overrides. Live booking behavior remains a separate Docker-backed proof and is not implied by package installation alone.`,
    "- Strict live seeded backend parity is not complete until `sdk:live-parity:strict` passes with `RESERVATION_PLATFORM_LIVE_BASE_URL`, `RESERVATION_PLATFORM_LIVE_TENANT_ID`, `RESERVATION_PLATFORM_LIVE_API_KEY`, `RESERVATION_PLATFORM_LIVE_SERVICE_ID`, `RESERVATION_PLATFORM_LIVE_RESOURCE_ID`, `RESERVATION_PLATFORM_LIVE_START_AT`, `RESERVATION_PLATFORM_LIVE_END_AT`, and `RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS=1` configured against a disposable seeded backend. The strict verifier is ready to cover reservation create/read/list replay plus resource-maintenance list/create/end replay, but DB-backed standalone backend API behavior, provider configuration, provider operational key rotation, registry install verification, and final standalone backend extraction remain unproven until those strict proof runs pass.",
    "- Real provider-backed chat delivery remains credential-dependent. Fixture chat parity does not use a live provider credential, while the active local hybrid-retrieval path is covered separately by migration, ingestion, indexing, multilingual retrieval, citation, isolation, fallback, worker-image, and offline-model verification.",
    "- Private registry and public npm install verification are not complete until `sdk:registry-install-proof:strict` passes in `RESERVATION_SDK_REGISTRY_PROOF_MODE=private` or `public` with exact package version specs and `RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1`, if that release path is selected. Private mode also requires `RESERVATION_SDK_REGISTRY_PRIVATE_URL` and `RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN`. The verifier never publishes.",
    "- Final release tagging is not complete. The package and extraction guardrails do not configure a live auth provider, prove provider key rotation, publish to a public/private registry, or prove live parity; those claims require their dedicated configured gates.",
    "- Public support, deprecation, security contact, provenance, and post-publish verification docs remain outside this local release-candidate artifact.",
    "",
  ].join("\n");
}
