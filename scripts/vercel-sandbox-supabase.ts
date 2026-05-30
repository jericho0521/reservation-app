import { Sandbox } from "@vercel/sandbox";
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runShell, stopSandbox, waitForEnter } from "./vercel-sandbox-utils";

const SUPABASE_REPO = process.env.SANDBOX_SUPABASE_REPO || "https://github.com/supabase/supabase";
const SUPABASE_REF = process.env.SANDBOX_SUPABASE_REF || "master";
const PROJECT_DIR = "/vercel/sandbox/supabase-project";
const SQL_DIR = "/vercel/sandbox/reservation-app-sql";
const API_PORT = 8000;
const STUDIO_PORT = 3000;
const POSTGRES_PORT = 5432;
const COMPOSE_FILES = "-f docker-compose.yml -f docker-compose.sandbox.yml";
const DEFAULT_SQL_FILES = [
  "base-schema.sql",
  "blogs.sql",
  "knowledge.sql",
  "langchain.sql",
  "sales-reports.sql",
  "reservations-rls.sql",
  "security-hardening.sql",
];
const DEFAULT_SECRET_VALUES = new Set([
  "supabase",
  "this_password_is_insecure_and_should_be_updated",
  "your-super-secret-and-long-postgres-password",
  "super-secret-jwt-token-with-at-least-32-characters-long",
  "your-super-secret-jwt-token-with-at-least-32-characters-long",
  "your-super-secret-and-long-jwt-secret",
  "your-secret-key-base-at-least-64-characters-long",
  "your-encryption-key-32-chars-min",
  "your-super-secret-logflare-token",
  "your-super-secret-logflare-public-token",
  "your-super-secret-logflare-private-token",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q",
]);

async function main() {
  let sandbox: Sandbox | undefined;

  try {
    sandbox = await Sandbox.create({
      runtime: "node24",
      resources: { vcpus: Number(process.env.SANDBOX_VCPUS || 4) },
      ports: [API_PORT, STUDIO_PORT, POSTGRES_PORT],
      timeout: Number(process.env.SANDBOX_TIMEOUT_MS || 45 * 60_000),
    });

    const apiUrl = sandbox.domain(API_PORT);
    const studioUrl = sandbox.domain(STUDIO_PORT);
    const postgresHost = sandbox.domain(POSTGRES_PORT).replace(/^https?:\/\//, "");

    console.log("Sandbox created.");
    console.log("Installing Docker and Docker Compose...");
    await runShell(
      sandbox,
      "dnf install -y git docker docker-compose-plugin || dnf install -y git docker",
      { sudo: true },
    );

    console.log("Starting Docker daemon...");
    await sandbox.runCommand({ cmd: "dockerd", sudo: true, detached: true });

    console.log("Waiting for Docker...");
    await runShell(sandbox, "until sudo docker info >/dev/null 2>&1; do sleep 1; done");

    console.log("Checking Docker Compose...");
    await runShell(
      sandbox,
      [
        "if ! sudo docker compose version >/dev/null 2>&1; then",
        "  mkdir -p /usr/local/lib/docker/cli-plugins;",
        "  arch=$(uname -m);",
        "  case \"$arch\" in x86_64) compose_arch=x86_64 ;; aarch64|arm64) compose_arch=aarch64 ;; *) echo \"Unsupported arch: $arch\"; exit 1 ;; esac;",
        "  curl -fsSL \"https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-${compose_arch}\" -o /usr/local/lib/docker/cli-plugins/docker-compose;",
        "  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose;",
        "fi;",
        "sudo docker compose version",
      ].join(" "),
      { sudo: true },
    );

    console.log(`Cloning Supabase self-hosted Docker files from ${SUPABASE_REPO}#${SUPABASE_REF}...`);
    await runShell(
      sandbox,
      [
        "rm -rf /vercel/sandbox/supabase /vercel/sandbox/supabase-project",
        `git clone --depth 1 --branch ${quoteShell(SUPABASE_REF)} ${quoteShell(SUPABASE_REPO)} /vercel/sandbox/supabase`,
        "mkdir -p /vercel/sandbox/supabase-project",
        "cp -a /vercel/sandbox/supabase/docker/. /vercel/sandbox/supabase-project/",
        "cp /vercel/sandbox/supabase/docker/.env.example /vercel/sandbox/supabase-project/.env",
      ].join(" && "),
    );

    console.log("Generating Supabase JWT secrets and patching public URLs...");
    const secrets = createSupabaseSandboxSecrets();

    await runShell(
      sandbox,
      [
        `cat > ${PROJECT_DIR}/.sandbox-env-helpers <<'EOF'`,
        "set_env() {",
        "  key=\"$1\";",
        "  value=\"$2\";",
        "  if grep -q \"^${key}=\" .env; then",
        "    sed -i \"s|^${key}=.*|${key}=${value}|\" .env;",
        "  else",
        "    printf '\\n%s=%s\\n' \"$key\" \"$value\" >> .env;",
        "  fi",
        "}",
        "EOF",
      ].join("\n"),
    );

    await runShell(
      sandbox,
      [
        `cd ${PROJECT_DIR}`,
        "&& if [ -f ./utils/generate-keys.sh ]; then sh ./utils/generate-keys.sh; fi",
        "&& . ./.sandbox-env-helpers",
        `&& set_env POSTGRES_PASSWORD ${quoteShell(secrets.postgresPassword)}`,
        `&& set_env JWT_SECRET ${quoteShell(secrets.jwtSecret)}`,
        `&& set_env ANON_KEY ${quoteShell(secrets.anonKey)}`,
        `&& set_env SERVICE_ROLE_KEY ${quoteShell(secrets.serviceRoleKey)}`,
        `&& set_env DASHBOARD_USERNAME ${quoteShell(secrets.dashboardUsername)}`,
        `&& set_env DASHBOARD_PASSWORD ${quoteShell(secrets.dashboardPassword)}`,
        `&& set_env SECRET_KEY_BASE ${quoteShell(secrets.secretKeyBase)}`,
        `&& set_env VAULT_ENC_KEY ${quoteShell(secrets.vaultEncryptionKey)}`,
        `&& set_env LOGFLARE_PUBLIC_ACCESS_TOKEN ${quoteShell(secrets.logflarePublicAccessToken)}`,
        `&& set_env LOGFLARE_PRIVATE_ACCESS_TOKEN ${quoteShell(secrets.logflarePrivateAccessToken)}`,
        `&& set_env POOLER_TENANT_ID ${quoteShell(secrets.poolerTenantId)}`,
        `&& set_env API_EXTERNAL_URL ${quoteShell(apiUrl)}`,
        `&& set_env SUPABASE_PUBLIC_URL ${quoteShell(apiUrl)}`,
        `&& set_env SITE_URL ${quoteShell(apiUrl)}`,
        `&& set_env STUDIO_PORT ${quoteShell(String(STUDIO_PORT))}`,
        `&& set_env STUDIO_DEFAULT_ORGANIZATION ${quoteShell("Reservation App")}`,
        `&& set_env STUDIO_DEFAULT_PROJECT ${quoteShell("Sandbox Supabase")}`,
      ].join(" "),
      { sudo: true },
    );
    await assertNoDefaultSupabaseSecrets(sandbox);

    console.log("Ensuring Supabase Studio is published on the sandbox host...");
    await runShell(
      sandbox,
      [
        `cd ${PROJECT_DIR}`,
        "cat > docker-compose.sandbox.yml <<'YAML'",
        "services:",
        "  studio:",
        "    ports:",
        `      - "127.0.0.1:${STUDIO_PORT}:3000"`,
        "YAML",
      ].join("\n"),
    );

    console.log("Pulling Supabase Docker images. This can take several minutes...");
    await runShell(
      sandbox,
      [
        `cd ${PROJECT_DIR};`,
        "for attempt in 1 2 3; do",
        `  if sudo docker compose ${COMPOSE_FILES} pull; then exit 0; fi;`,
        "  echo \"Docker image pull failed on attempt ${attempt}; retrying...\";",
        "  sleep $((attempt * 20));",
        "done;",
        `sudo docker compose ${COMPOSE_FILES} pull`,
      ].join(" "),
    );

    console.log("Starting Supabase containers...");
    await runShell(sandbox, `cd ${PROJECT_DIR} && sudo docker compose ${COMPOSE_FILES} up -d --pull missing`);

    console.log("Waiting for Supabase API...");
    await runShell(
      sandbox,
      [
        `for i in $(seq 1 90); do`,
        `  unhealthy=$(cd ${PROJECT_DIR} && sudo docker compose ${COMPOSE_FILES} ps --format json | grep -E '\"Health\":\"(unhealthy|starting)\"' || true);`,
        `  code=$(curl -s -o /dev/null -w "%{http_code}" ${quoteShell(`http://127.0.0.1:${API_PORT}/`)} || true);`,
        "  if [ -z \"$unhealthy\" ] && [ \"$code\" != \"000\" ]; then exit 0; fi;",
        "  sleep 2;",
        "done;",
        `cd ${PROJECT_DIR} && sudo docker compose ${COMPOSE_FILES} ps;`,
        "exit 1",
      ].join(" "),
    );

    const sqlFiles = getSqlFilesToRun();

    if (sqlFiles.length > 0) {
      console.log("Uploading reservation app SQL files...");
      await uploadSqlFiles(sandbox, sqlFiles);

      console.log("Applying reservation app SQL files...");
      for (const fileName of sqlFiles) {
        console.log(`Applying ${fileName}...`);
        await runShell(
          sandbox,
          `sudo docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < ${quoteShell(`${SQL_DIR}/${fileName}`)}`,
        );
      }

      console.log("Reloading Supabase API schema cache...");
      await runShell(
        sandbox,
        [
          `sudo docker exec supabase-db psql -U postgres -d postgres -c ${quoteShell("notify pgrst, 'reload schema';")}`,
          `cd ${PROJECT_DIR} && sudo docker compose ${COMPOSE_FILES} restart rest`,
          `for i in $(seq 1 30); do code=$(curl -s -o /dev/null -w "%{http_code}" ${quoteShell(`http://127.0.0.1:${API_PORT}/rest/v1/`)} || true); if [ "$code" != "000" ]; then exit 0; fi; sleep 1; done; exit 1`,
        ].join(" && "),
      );
    } else {
      console.log("Skipping reservation app SQL bootstrap because SANDBOX_SQL_FILES=none.");
    }

    const envOutput = await runShell(
      sandbox,
      `cd ${PROJECT_DIR} && grep -E '^(ANON_KEY|SERVICE_ROLE_KEY|POSTGRES_PASSWORD|DASHBOARD_USERNAME|DASHBOARD_PASSWORD)=' .env`,
    );

    console.log("\nSupabase is running in Vercel Sandbox.");
    console.log(`API URL: ${apiUrl}`);
    console.log(`Studio URL: ${studioUrl}`);
    console.log(`Postgres host: ${postgresHost}`);
    console.log("\nUse these local app values while the script is running:");
    console.log(`NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`);
    console.log(envOutput
      .replace(/^ANON_KEY=/m, "NEXT_PUBLIC_SUPABASE_ANON_KEY=")
      .replace(/^SERVICE_ROLE_KEY=/m, "SUPABASE_SERVICE_ROLE_KEY="));
    console.log("\nUse DASHBOARD_USERNAME and DASHBOARD_PASSWORD to sign in to Supabase Studio.");
    console.log("\nThe sandbox and containers will stop when you press Enter.");

    await waitForEnter();
  } finally {
    await stopSandbox(sandbox);
  }
}

function createSupabaseSandboxSecrets() {
  const jwtSecret = randomToken(48);

  return {
    anonKey: createSupabaseJwt("anon", jwtSecret),
    dashboardPassword: randomToken(24),
    dashboardUsername: `sandbox-admin-${randomToken(6)}`,
    jwtSecret,
    logflarePrivateAccessToken: randomToken(32),
    logflarePublicAccessToken: randomToken(32),
    poolerTenantId: `tenant${randomBytes(8).toString("hex")}`,
    postgresPassword: randomToken(32),
    secretKeyBase: randomBytes(64).toString("hex"),
    serviceRoleKey: createSupabaseJwt("service_role", jwtSecret),
    vaultEncryptionKey: randomToken(24).slice(0, 32),
  };
}

function createSupabaseJwt(role: "anon" | "service_role", jwtSecret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtPart({ alg: "HS256", typ: "JWT" });
  const payload = encodeJwtPart({
    role,
    iss: "supabase-demo",
    iat: now,
    exp: now + 10 * 365 * 24 * 60 * 60,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret)
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

function encodeJwtPart(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function randomToken(byteLength: number) {
  return randomBytes(byteLength).toString("base64url");
}

async function assertNoDefaultSupabaseSecrets(sandbox: Sandbox) {
  const secretOutput = await runShell(
    sandbox,
    `cd ${PROJECT_DIR} && grep -E '^(POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|DASHBOARD_USERNAME|DASHBOARD_PASSWORD|SECRET_KEY_BASE|VAULT_ENC_KEY|LOGFLARE_PUBLIC_ACCESS_TOKEN|LOGFLARE_PRIVATE_ACCESS_TOKEN)=' .env`,
  );
  const defaultLines = secretOutput
    .split("\n")
    .filter((line) => DEFAULT_SECRET_VALUES.has(line.slice(line.indexOf("=") + 1).trim()));

  if (defaultLines.length > 0) {
    throw new Error(`Refusing to start Supabase with default credentials: ${defaultLines.join(", ")}`);
  }
}

function getSqlFilesToRun() {
  const configuredFiles = process.env.SANDBOX_SQL_FILES?.trim();

  if (!configuredFiles) {
    return DEFAULT_SQL_FILES;
  }

  if (configuredFiles.toLowerCase() === "none") {
    return [];
  }

  return configuredFiles
    .split(",")
    .map((fileName) => fileName.trim())
    .filter(Boolean);
}

async function uploadSqlFiles(sandbox: Sandbox, fileNames: string[]) {
  await runShell(sandbox, `rm -rf ${quoteShell(SQL_DIR)} && mkdir -p ${quoteShell(SQL_DIR)}`);

  await sandbox.writeFiles(
    await Promise.all(
      fileNames.map(async (fileName) => ({
        path: `reservation-app-sql/${fileName}`,
        content: await readFile(`supabase/${fileName}`),
      })),
    ),
  );
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
