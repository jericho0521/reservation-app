import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Sandbox } from "@vercel/sandbox";

config({ path: ".env.local" });

type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  sudo?: boolean;
};

export async function runChecked(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  options: RunOptions = {},
) {
  const result = await sandbox.runCommand({
    cmd,
    args,
    cwd: options.cwd,
    env: options.env,
    sudo: options.sudo,
  });

  const stdout = (await result.stdout()).trim();
  const stderr = (await result.stderr()).trim();

  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${cmd} ${args.join(" ")}`,
        `Exit code: ${result.exitCode}`,
        stdout && `stdout:\n${stdout}`,
        stderr && `stderr:\n${stderr}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  return stdout;
}

export async function runShell(
  sandbox: Sandbox,
  script: string,
  options: RunOptions = {},
) {
  return runChecked(sandbox, "sh", ["-lc", script], options);
}

export async function waitForEnter(message = "Press Enter to stop the sandbox...") {
  const rl = createInterface({ input, output });

  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

export async function stopSandbox(sandbox: Sandbox | undefined) {
  if (!sandbox) {
    return;
  }

  try {
    await sandbox.stop();
  } catch (error) {
    console.warn("Could not stop sandbox cleanly:", error);
  }
}
