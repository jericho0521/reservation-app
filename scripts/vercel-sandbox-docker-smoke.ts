import { Sandbox } from "@vercel/sandbox";
import { runChecked, runShell, stopSandbox } from "./vercel-sandbox-utils";

async function main() {
  let sandbox: Sandbox | undefined;

  try {
    sandbox = await Sandbox.create({
      runtime: "node24",
      resources: { vcpus: 2 },
      timeout: 15 * 60_000,
    });

    console.log("Installing Docker...");
    await runShell(
      sandbox,
      "dnf install -y docker docker-compose-plugin || dnf install -y docker",
      { sudo: true },
    );

    console.log("Starting Docker daemon...");
    await sandbox.runCommand({ cmd: "dockerd", sudo: true, detached: true });

    console.log("Waiting for Docker...");
    await runShell(sandbox, "until sudo docker info >/dev/null 2>&1; do sleep 1; done");

    console.log("Running Redis container...");
    await runChecked(
      sandbox,
      "docker",
      ["run", "--rm", "-d", "--name", "redis", "redis:alpine"],
      { sudo: true },
    );

    const pong = await runChecked(
      sandbox,
      "docker",
      ["exec", "redis", "redis-cli", "PING"],
      { sudo: true },
    );

    console.log(`Redis replied: ${pong}`);
  } finally {
    if (sandbox) {
      await sandbox
        .runCommand({
          cmd: "docker",
          args: ["rm", "-f", "redis"],
          sudo: true,
        })
        .catch(() => undefined);
    }

    await stopSandbox(sandbox);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
