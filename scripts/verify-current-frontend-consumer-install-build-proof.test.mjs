import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  currentFrontendConsumerInstallProofAllowlistedSteps,
  currentFrontendConsumerProofAllowInstallEnvName,
  currentFrontendConsumerProofRootEnvName,
  generatedFrontendConsumerScripts,
  readCurrentFrontendConsumerInstallProofConfig,
  verifyCurrentFrontendConsumerInstallBuildProof,
} from "./verify-current-frontend-consumer-install-build-proof.mjs";

async function createPreparedFrontendRoot(options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "frontend-consumer-proof-test-"));
  await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: "reservation-frontend-consumer-candidate",
      private: true,
      packageManager: "pnpm@10.33.2",
      scripts: {
        ...generatedFrontendConsumerScripts,
        ...(options.scripts ?? {}),
      },
      dependencies: {
        next: "16.1.1",
        react: "19.2.3",
        "@reservation-platform/sdk": "0.0.0",
        ...(options.dependencies ?? {}),
      },
      devDependencies: {
        typescript: "^5",
        ...(options.devDependencies ?? {}),
      },
      ...(options.optionalDependencies
        ? { optionalDependencies: options.optionalDependencies }
        : {}),
      ...(options.peerDependencies
        ? { peerDependencies: options.peerDependencies }
        : {}),
    }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

test("frontend consumer install proof safely skips when env is absent", () => {
  const parsed = readCurrentFrontendConsumerInstallProofConfig({}, { argv: [] });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.runReady, false);
  assert.equal(parsed.config, null);
  assert.deepEqual(parsed.missing, [currentFrontendConsumerProofRootEnvName]);
  assert.deepEqual(parsed.plannedSteps, []);
  assert.match(parsed.message, /required frontend consumer install\/build proof config is incomplete/);
});

test("frontend consumer install proof fails strict runs without required env", () => {
  const parsed = readCurrentFrontendConsumerInstallProofConfig({}, { argv: ["--strict"] });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.runReady, false);
  assert.match(parsed.message, new RegExp(currentFrontendConsumerProofRootEnvName));
});

test("frontend consumer install proof rejects malformed prepared root paths", () => {
  const parsed = readCurrentFrontendConsumerInstallProofConfig(
    {
      [currentFrontendConsumerProofRootEnvName]: "relative/frontend-root",
    },
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /must be an absolute path/);
});

test("frontend consumer install proof rejects current workspace paths", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "frontend-consumer-proof-current-repo-"));
  const nestedRoot = path.join(repoRoot, "candidate");
  await mkdir(nestedRoot);
  await writeFile(path.join(nestedRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(nestedRoot, "package.json"),
    `${JSON.stringify({
      scripts: generatedFrontendConsumerScripts,
      dependencies: { next: "16.1.1" },
      devDependencies: { typescript: "^5" },
    })}\n`,
    "utf8",
  );

  try {
    const parsed = readCurrentFrontendConsumerInstallProofConfig(
      {
        [currentFrontendConsumerProofRootEnvName]: nestedRoot,
      },
      { argv: ["--strict"], repoRoot },
    );

    assert.equal(parsed.status, "fail");
    assert.match(parsed.message, /must point outside the current repository workspace/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("frontend consumer install proof rejects symlink parent paths resolving into current workspace", async (t) => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "frontend-consumer-proof-real-repo-"));
  const linkParentRoot = await mkdtemp(path.join(tmpdir(), "frontend-consumer-proof-link-parent-"));
  const candidateRoot = path.join(repoRoot, "candidate");
  const linkedRepoRoot = path.join(linkParentRoot, "linked-repo");
  const linkedCandidateRoot = path.join(linkedRepoRoot, "candidate");

  await mkdir(candidateRoot);
  await writeFile(path.join(candidateRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  await writeFile(
    path.join(candidateRoot, "package.json"),
    `${JSON.stringify({
      scripts: generatedFrontendConsumerScripts,
      dependencies: { next: "16.1.1" },
      devDependencies: { typescript: "^5" },
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

    const parsed = readCurrentFrontendConsumerInstallProofConfig(
      {
        [currentFrontendConsumerProofRootEnvName]: linkedCandidateRoot,
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

test("frontend consumer install proof validates exact generated scripts", async () => {
  const root = await createPreparedFrontendRoot({ scripts: { build: "next build && next start" } });

  try {
    const parsed = readCurrentFrontendConsumerInstallProofConfig(
      {
        [currentFrontendConsumerProofRootEnvName]: root,
      },
      { argv: ["--strict"] },
    );

    assert.equal(parsed.status, "fail");
    assert.equal(parsed.ready, false);
    assert.match(parsed.message, /script build must be "next build"/);
    assert.doesNotMatch(parsed.message, /script build exactly as "next build"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("frontend consumer install proof rejects local workspace dependency specs", async () => {
  const root = await createPreparedFrontendRoot({
    dependencies: { "@reservation-platform/sdk": "workspace:*" },
    devDependencies: { eslint: "file:../eslint.tgz" },
    optionalDependencies: { sharp: "link:../sharp" },
    peerDependencies: { react: "portal:../react" },
  });

  try {
    const parsed = readCurrentFrontendConsumerInstallProofConfig(
      {
        [currentFrontendConsumerProofRootEnvName]: root,
      },
      { argv: ["--strict"] },
    );

    assert.equal(parsed.status, "fail");
    assert.equal(parsed.ready, false);
    assert.match(parsed.message, /dependencies\.@reservation-platform\/sdk must not use workspace:/);
    assert.match(parsed.message, /devDependencies\.eslint must not use file:/);
    assert.match(parsed.message, /optionalDependencies\.sharp must not use link:/);
    assert.match(parsed.message, /peerDependencies\.react must not use portal:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("frontend consumer install proof commands are static and allowlisted", () => {
  assert.deepEqual(
    currentFrontendConsumerInstallProofAllowlistedSteps.map((step) => ({
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
        args: ["pnpm", "run", "typecheck"],
      },
      {
        command: "corepack",
        args: ["pnpm", "run", "build"],
      },
    ],
  );
});

test("frontend consumer install proof reports ready plan in default mode without running", async () => {
  const root = await createPreparedFrontendRoot();
  const calls = [];

  try {
    const result = await verifyCurrentFrontendConsumerInstallBuildProof(
      {
        [currentFrontendConsumerProofRootEnvName]: root,
        [currentFrontendConsumerProofAllowInstallEnvName]: "1",
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
    assert.equal(result.plannedSteps.length, 3);
    assert.match(result.message, /default mode only reports the static allowlisted proof plan/);
    assert.match(result.message, /Default mode does not install dependencies/);
    assert.match(result.message, /execute generated frontend commands/);
    assert.deepEqual(calls, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("frontend consumer install proof fails strict configured proof without install opt-in", async () => {
  const root = await createPreparedFrontendRoot();

  try {
    const parsed = readCurrentFrontendConsumerInstallProofConfig(
      {
        [currentFrontendConsumerProofRootEnvName]: root,
      },
      { argv: ["--strict"] },
    );

    assert.equal(parsed.status, "fail");
    assert.equal(parsed.ready, true);
    assert.equal(parsed.runReady, false);
    assert.match(parsed.message, new RegExp(`${currentFrontendConsumerProofAllowInstallEnvName}=1`));
    assert.match(parsed.message, /before install or generated frontend commands run/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("frontend consumer install proof runs only planned install, typecheck, and build steps", async () => {
  const root = await createPreparedFrontendRoot();
  const calls = [];

  try {
    const result = await verifyCurrentFrontendConsumerInstallBuildProof(
      {
        [currentFrontendConsumerProofRootEnvName]: root,
        [currentFrontendConsumerProofAllowInstallEnvName]: "1",
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
    assert.equal(result.executedSteps.length, 3);
    assert.deepEqual(calls, [
      {
        command: "corepack",
        args: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
        cwd: root,
      },
      {
        command: "corepack",
        args: ["pnpm", "run", "typecheck"],
        cwd: root,
      },
      {
        command: "corepack",
        args: ["pnpm", "run", "build"],
        cwd: root,
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
