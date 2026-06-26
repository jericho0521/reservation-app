import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  expectedGeneratedBackendWorkspaceScript,
  extractedBackendInstallProofAllowlistedSteps,
  extractedBackendProofAllowInstallEnvName,
  extractedBackendProofRootEnvName,
  readExtractedBackendInstallProofConfig,
  verifyExtractedBackendInstallBuildTestProof,
} from "./verify-extracted-backend-install-build-test-proof.mjs";

async function createPreparedBackendRoot(options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "extracted-backend-proof-test-"));
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: "reservation-platform-backend",
      private: true,
      packageManager: "pnpm@10.33.2",
      scripts: {
        "phase-11:verify-generated-backend-workspace":
          options.phase11Script ?? expectedGeneratedBackendWorkspaceScript,
      },
    }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

test("extracted backend install proof safely skips when env is absent", () => {
  const parsed = readExtractedBackendInstallProofConfig({}, { argv: [] });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.runReady, false);
  assert.equal(parsed.config, null);
  assert.deepEqual(parsed.missing, [extractedBackendProofRootEnvName]);
  assert.deepEqual(parsed.plannedSteps, []);
  assert.match(parsed.message, /required extracted backend install\/build\/test proof config is incomplete/);
});

test("extracted backend install proof fails strict runs without required env", () => {
  const parsed = readExtractedBackendInstallProofConfig({}, { argv: ["--strict"] });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.runReady, false);
  assert.match(parsed.message, new RegExp(extractedBackendProofRootEnvName));
});

test("extracted backend install proof rejects malformed prepared root paths", () => {
  const parsed = readExtractedBackendInstallProofConfig(
    {
      [extractedBackendProofRootEnvName]: "relative/backend-root",
    },
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /must be an absolute path/);
});

test("extracted backend install proof rejects current workspace paths", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "extracted-backend-proof-current-repo-"));
  const nestedRoot = path.join(repoRoot, "candidate");
  await mkdir(nestedRoot);
  await writeFile(path.join(nestedRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(nestedRoot, "package.json"),
    `${JSON.stringify({
      scripts: {
        "phase-11:verify-generated-backend-workspace": expectedGeneratedBackendWorkspaceScript,
      },
    })}\n`,
    "utf8",
  );

  try {
    const parsed = readExtractedBackendInstallProofConfig(
      {
        [extractedBackendProofRootEnvName]: nestedRoot,
      },
      { argv: ["--strict"], repoRoot },
    );

    assert.equal(parsed.status, "fail");
    assert.match(parsed.message, /must point outside the current repository workspace/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("extracted backend install proof rejects symlink parent paths resolving into current workspace", async (t) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "extracted-backend-proof-real-repo-"));
  const linkParentRoot = await mkdtemp(path.join(tmpdir(), "extracted-backend-proof-link-parent-"));
  const candidateRoot = path.join(repoRoot, "candidate");
  const linkedRepoRoot = path.join(linkParentRoot, "linked-repo");
  const linkedCandidateRoot = path.join(linkedRepoRoot, "candidate");

  await mkdir(candidateRoot);
  await writeFile(path.join(candidateRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(candidateRoot, "package.json"),
    `${JSON.stringify({
      scripts: {
        "phase-11:verify-generated-backend-workspace": expectedGeneratedBackendWorkspaceScript,
      },
    })}\n`,
    "utf8",
  );

  try {
    try {
      await symlink(repoRoot, linkedRepoRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlink/junction creation was not permitted: ${error instanceof Error ? error.message : error}`);
      return;
    }

    const parsed = readExtractedBackendInstallProofConfig(
      {
        [extractedBackendProofRootEnvName]: linkedCandidateRoot,
      },
      { argv: ["--strict"], repoRoot },
    );

    assert.equal(parsed.status, "fail");
    assert.match(parsed.message, /must point outside the current repository workspace after resolving symlinks and junctions/);
  } finally {
    await rm(linkParentRoot, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("extracted backend install proof validates generated script metadata", async () => {
  const root = await createPreparedBackendRoot({ phase11Script: "echo not the generated verifier" });

  try {
    const parsed = readExtractedBackendInstallProofConfig(
      {
        [extractedBackendProofRootEnvName]: root,
      },
      { argv: ["--strict"] },
    );

    assert.equal(parsed.status, "fail");
    assert.equal(parsed.ready, false);
    assert.match(parsed.message, /phase-11:verify-generated-backend-workspace script exactly/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extracted backend install proof commands are static and allowlisted", () => {
  assert.deepEqual(
    extractedBackendInstallProofAllowlistedSteps.map((step) => ({
      command: step.command,
      args: [...step.args],
    })),
    [
      {
        command: "corepack",
        args: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
      },
      {
        command: "corepack",
        args: ["pnpm", "run", "phase-11:verify-generated-backend-workspace"],
      },
    ],
  );
});

test("extracted backend install proof reports ready plan in default mode without running", async () => {
  const root = await createPreparedBackendRoot();
  const calls = [];

  try {
    const result = await verifyExtractedBackendInstallBuildTestProof(
      {
        [extractedBackendProofRootEnvName]: root,
        [extractedBackendProofAllowInstallEnvName]: "1",
      },
      {
        argv: [],
        runner: (...args) => {
          calls.push(args);
        },
      },
    );

    assert.equal(result.status, "ready");
    assert.equal(result.ok, true);
    assert.equal(result.ready, true);
    assert.equal(result.runReady, false);
    assert.equal(result.shouldRun, false);
    assert.equal(result.plannedSteps.length, 2);
    assert.match(result.message, /default mode only reports the static allowlisted proof plan/);
    assert.match(result.message, /Default mode does not install dependencies/);
    assert.match(result.message, /execute generated backend commands/);
    assert.deepEqual(calls, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extracted backend install proof fails strict configured proof without install opt-in", async () => {
  const root = await createPreparedBackendRoot();

  try {
    const parsed = readExtractedBackendInstallProofConfig(
      {
        [extractedBackendProofRootEnvName]: root,
      },
      { argv: ["--strict"] },
    );

    assert.equal(parsed.status, "fail");
    assert.equal(parsed.ready, true);
    assert.equal(parsed.runReady, false);
    assert.match(parsed.message, new RegExp(`${extractedBackendProofAllowInstallEnvName}=1`));
    assert.match(parsed.message, /before install or generated backend commands run/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extracted backend install proof runs only planned steps through injected runner", async () => {
  const root = await createPreparedBackendRoot();
  const calls = [];

  try {
    const result = await verifyExtractedBackendInstallBuildTestProof(
      {
        [extractedBackendProofRootEnvName]: root,
        [extractedBackendProofAllowInstallEnvName]: "1",
      },
      {
        argv: ["--strict"],
        runner: async (command, args, options) => {
          calls.push({ command, args, cwd: options.cwd });
        },
      },
    );

    assert.equal(result.status, "ready");
    assert.equal(result.ok, true);
    assert.equal(result.ready, true);
    assert.equal(result.runReady, true);
    assert.equal(result.executedSteps.length, 2);
    assert.deepEqual(calls, [
      {
        command: "corepack",
        args: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
        cwd: root,
      },
      {
        command: "corepack",
        args: ["pnpm", "run", "phase-11:verify-generated-backend-workspace"],
        cwd: root,
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
