import { spawn } from "node:child_process";

const safeHost = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/u;
const safeUser = /^[a-z_][a-z0-9_-]{0,31}$/u;
const safeAbsolutePath = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u;

export function createSshRemoteHost(options) {
  if (!safeHost.test(options.host ?? "")) throw new Error("Remote proof host is invalid.");
  if (!safeUser.test(options.user ?? "")) throw new Error("Remote proof SSH user is invalid.");
  if (!safeAbsolutePath.test(options.identityFile ?? "")) throw new Error("Remote proof identity file path is invalid.");

  return {
    async execute(argv, execution = {}) {
      if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== "string" || value.includes("\0"))) {
        throw new Error("Remote proof command is invalid.");
      }
      const command = argv.map(shellQuote).join(" ");
      return await spawnBounded(options.sshBin ?? "ssh", [
        "-o", "BatchMode=yes",
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=yes",
        "-i", options.identityFile,
        "--",
        `${options.user}@${options.host}`,
        command,
      ], {
        stdin: execution.stdin,
        timeoutMs: execution.timeoutMs ?? 10 * 60_000,
      });
    },
  };
}

export function createCleanInstallOperations(remote, config, ownerPassword) {
  const driver = config.remoteDriver;
  if (!safeAbsolutePath.test(driver)) throw new Error("Remote proof driver path is invalid.");
  const common = ["--domain", config.domain, "--host-ip", config.hostIp, "--release", config.release];
  const run = async (step, options = {}) => {
    const result = await remote.execute(["sudo", driver, step, ...common], options);
    if (result.status !== 0) return { ok: false, output: `${result.stdout}\n${result.stderr}` };
    try {
      return { ok: true, output: result.stdout, ...JSON.parse(result.stdout) };
    } catch {
      return { ok: false, output: "remote proof driver returned malformed JSON" };
    }
  };
  return {
    preflight: () => run("preflight"),
    install: () => run("install"),
    readiness: () => run("readiness"),
    ports: () => run("ports"),
    setupOwner: () => run("setup-owner", { stdin: ownerPassword }),
    setupReplay: () => run("setup-token-replay"),
    demoAbsence: () => run("demo-absence"),
    configureBusiness: () => run("configure-appointment-business"),
    publicBooking: () => run("complete-public-booking"),
  };
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function spawnBounded(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const maximumBytes = 256 * 1024;
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > maximumBytes) {
        child.kill("SIGKILL");
        throw new Error("Remote proof output exceeded the safe limit.");
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      try { stdout = append(stdout, chunk); } catch (error) { reject(error); }
    });
    child.stderr.on("data", (chunk) => {
      try { stderr = append(stderr, chunk); } catch (error) { reject(error); }
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status: status ?? 1, stdout, stderr }));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Remote proof command timed out."));
    }, options.timeoutMs);
    timer.unref();
    child.on("close", () => clearTimeout(timer));
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}
