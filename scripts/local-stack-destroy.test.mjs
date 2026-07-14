import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertDestroyConfirmation,
  clearLocalStackVolumeContents,
} from "./local-stack-destroy.mjs";

test("destroy requires the exact confirmation", () => {
  assert.throws(() => assertDestroyConfirmation({}), /DESTROY_LOCAL_STACK/u);
  assert.throws(
    () => assertDestroyConfirmation({ RESERVATION_STACK_DESTROY_CONFIRM: "destroy_local_stack" }),
    /DESTROY_LOCAL_STACK/u,
  );
  assert.doesNotThrow(() => assertDestroyConfirmation({
    RESERVATION_STACK_DESTROY_CONFIRM: "DESTROY_LOCAL_STACK",
  }));
});

test("destroy clears only the three fixed volume children", async () => {
  const root = await mkdtemp(join(tmpdir(), "reservation-stack-volumes-"));
  for (const name of ["database", "config", "whatsapp"]) {
    await mkdir(join(root, name));
    await writeFile(join(root, name, "data"), name);
  }
  await writeFile(join(root, "keep"), "safe");

  await clearLocalStackVolumeContents(root);

  assert.equal(await readFile(join(root, "keep"), "utf8"), "safe");
  for (const name of ["database", "config", "whatsapp"]) {
    await assert.rejects(readFile(join(root, name, "data"), "utf8"), /ENOENT/u);
  }
});
