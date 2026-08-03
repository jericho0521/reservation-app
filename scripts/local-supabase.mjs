import { spawnSync } from "node:child_process";
import { accessSync, constants, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const action = process.argv[2];
const supportedActions = new Set(["start", "stop", "status"]);

if (!supportedActions.has(action)) {
  console.error("Usage: node scripts/local-supabase.mjs <start|stop|status>");
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function succeeds(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "ignore",
    ...options,
  });

  return !result.error && result.status === 0;
}

function startColimaForward(colimaSshConfig, forward) {
  run("ssh", [
    "-F",
    colimaSshConfig,
    "-o",
    "ControlMaster=no",
    "-o",
    "ControlPath=none",
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=3",
    "-Nf",
    "-L",
    forward,
    "colima",
  ]);
}

function repairColimaDockerSocket(colimaSshConfig, dockerSocket) {
  const dockerOptions = {
    env: {
      ...process.env,
      DOCKER_CONTEXT: "colima",
    },
  };

  if (succeeds("docker", ["info"], dockerOptions)) {
    return;
  }

  console.log("Repairing the Colima Docker socket...");
  rmSync(dockerSocket, { force: true });
  startColimaForward(
    colimaSshConfig,
    `${dockerSocket}:/var/run/docker.sock`,
  );

  if (!succeeds("docker", ["info"], dockerOptions)) {
    console.error("Colima is running, but its Docker socket is unavailable.");
    console.error("Restart Colima with: colima restart");
    process.exit(1);
  }
}

function ensureColimaTcpForward(
  colimaSshConfig,
  port,
  healthPath = "/",
) {
  const url = `http://127.0.0.1:${port}${healthPath}`;
  const curlArgs = [
    "-sS",
    "--max-time",
    "3",
    "-o",
    "/dev/null",
    url,
  ];

  if (succeeds("curl", curlArgs)) {
    return;
  }

  console.log(`Repairing the Colima loopback forward for port ${port}...`);
  startColimaForward(
    colimaSshConfig,
    `127.0.0.1:${port}:127.0.0.1:${port}`,
  );

  if (!succeeds("curl", curlArgs)) {
    console.error(`Colima port ${port} is forwarded but did not respond.`);
    process.exit(1);
  }
}

if (process.platform === "win32") {
  if (action === "status") {
    run("docker", [
      "ps",
      "--filter",
      "name=supabase",
      "--format",
      "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}",
    ]);
    process.exit(0);
  }

  const scriptName =
    action === "start"
      ? "start-local-supabase.ps1"
      : "stop-local-supabase.ps1";

  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve("scripts", scriptName),
  ]);
  process.exit(0);
}

const stackPath =
  process.env.RESERVATION_SUPABASE_DOCKER_PATH ||
  join(homedir(), "self-hosted", "reservation-supabase", "docker");
const runScript = join(stackPath, "run.sh");

try {
  accessSync(runScript, constants.R_OK);
} catch {
  console.error(`Supabase run script not found: ${runScript}`);
  console.error(
    "Set RESERVATION_SUPABASE_DOCKER_PATH if the secured stack is elsewhere.",
  );
  process.exit(1);
}

const stackAction = action === "status" ? "status" : action;
const stackOptions = { cwd: stackPath };

if (process.platform === "darwin") {
  if (!succeeds("colima", ["version"])) {
    console.error("Colima is required for the macOS Supabase stack.");
    console.error("Install it with: brew install colima");
    process.exit(1);
  }

  if (!succeeds("colima", ["status"])) {
    if (action !== "start") {
      console.error("The headless Colima Docker engine is not running.");
      console.error("Start it with: pnpm local:supabase:start");
      process.exit(1);
    }

    console.log("Starting the headless Colima Docker engine...");
    run("colima", ["start"]);
  }

  const colimaPath = join(homedir(), ".colima");
  const colimaSshConfig = join(colimaPath, "ssh_config");
  const colimaDockerSocket = join(colimaPath, "default", "docker.sock");

  if (action !== "status") {
    repairColimaDockerSocket(
      colimaSshConfig,
      colimaDockerSocket,
    );
  }

  stackOptions.env = {
    ...process.env,
    DOCKER_CONTEXT: "colima",
  };

  run("sh", [runScript, stackAction], stackOptions);

  if (action === "start") {
    ensureColimaTcpForward(
      colimaSshConfig,
      8000,
      "/auth/v1/health",
    );
    ensureColimaTcpForward(
      colimaSshConfig,
      3000,
    );

    console.log("Local API: http://127.0.0.1:8000");
    console.log("Local Studio: http://127.0.0.1:3000");
    console.log("Public API: https://supabase.jerichofoong.com");
    console.log(
      "The public API also requires the reservation-supabase-mac cloudflared service.",
    );
  }

  process.exit(0);
}

run("sh", [runScript, stackAction], stackOptions);

if (action === "start") {
  console.log("Local API: http://127.0.0.1:8000");
  console.log("Public API: https://supabase.jerichofoong.com");
  console.log(
    "The public API also requires the reservation-supabase-mac cloudflared service.",
  );
}
