import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const live = process.env.RESERVATION_STACK_LIVE_TESTS === "true";

test("Compose down and up preserve a database marker", { skip: !live, timeout: 300_000 }, async () => {
  const marker = `persistence-${Date.now()}`;
  psql(`insert into public.reservation_local_stack_state (key, value) values ('persistence-proof', '{"marker":"${marker}"}'::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now();`);

  compose(["down"]);
  compose(["up", "-d"]);
  await waitForHealthyStack();

  const persisted = psql("select value->>'marker' from public.reservation_local_stack_state where key = 'persistence-proof';");
  assert.equal(persisted.trim(), marker);
});

function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "reservation-db", "psql", "-U", "postgres", "-d", "reservation", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--command", sql],
    { encoding: "utf8" },
  );
}

function compose(args) {
  execFileSync("docker", ["compose", ...args], { stdio: "inherit" });
}

async function waitForHealthyStack() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4400/apex-racing-demo");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Local stack did not become healthy after restart.");
}
