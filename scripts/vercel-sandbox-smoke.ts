import { Sandbox } from "@vercel/sandbox";
import { runChecked, stopSandbox } from "./vercel-sandbox-utils";

async function main() {
  let sandbox: Sandbox | undefined;

  try {
    sandbox = await Sandbox.create({
      runtime: "node24",
      timeout: 5 * 60_000,
    });

    const output = await runChecked(sandbox, "echo", ["Hello from Vercel Sandbox"]);
    console.log(output);
  } finally {
    await stopSandbox(sandbox);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
