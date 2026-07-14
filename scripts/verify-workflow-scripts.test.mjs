import assert from "node:assert/strict";
import test from "node:test";
import { verifyWorkflowScripts } from "./verify-workflow-scripts.mjs";

test("workflow verification rejects missing pnpm scripts", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "node --test" } },
    workflows: [
      {
        path: ".github/workflows/ci.yml",
        text: "steps:\n  - run: pnpm run missing",
      },
    ],
  });
  assert.deepEqual(findings, [".github/workflows/ci.yml references missing script: missing"]);
});

test("workflow verification rejects corepack pnpm", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "corepack pnpm test" } },
    workflows: [],
  });
  assert.deepEqual(findings, ["package.json script test invokes corepack pnpm"]);
});

test("workflow verification checks multiline run steps but ignores labels and comments", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "node --test" } },
    workflows: [
      {
        path: ".github/workflows/ci.yml",
        text: [
          "steps:",
          "  - name: pnpm run missing-from-label",
          "    run: |",
          "      # pnpm run missing-from-comment",
          "      pnpm run test # pnpm run missing-from-inline-comment",
          "      pnpm run missing-from-command -- --flag",
        ].join("\n"),
      },
    ],
  });
  assert.deepEqual(findings, [
    ".github/workflows/ci.yml references missing script: missing-from-command",
  ]);
});

test("workflow verification rejects corepack pnpm in run steps", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "node --test" } },
    workflows: [
      {
        path: ".github/workflows/deploy.yml",
        text: "steps:\n  - run: corepack pnpm run test",
      },
    ],
  });
  assert.deepEqual(findings, [
    ".github/workflows/deploy.yml run step invokes corepack pnpm",
  ]);
});

test("workflow verification ignores run-like text outside workflow steps", () => {
  const findings = verifyWorkflowScripts({
    packageJson: { scripts: { test: "node --test" } },
    workflows: [
      {
        path: ".github/workflows/ci.yml",
        text: [
          "name: pnpm run missing-from-name",
          "defaults:",
          "  run:",
          "    shell: bash",
          "description: run: pnpm run missing-from-description",
          "steps:",
          "  - run: pnpm run test",
        ].join("\n"),
      },
    ],
  });
  assert.deepEqual(findings, []);
});
