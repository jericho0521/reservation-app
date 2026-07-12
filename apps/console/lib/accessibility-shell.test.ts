import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner console exposes keyboard navigation and reduced-motion safeguards", async () => {
  const [shell, styles] = await Promise.all([
    readFile("components/console-shell.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(shell, /href="#console-main"/u);
  assert.match(shell, /id="console-main"/u);
  assert.match(styles, /:focus-visible/u);
  assert.match(styles, /prefers-reduced-motion: reduce/u);
});
