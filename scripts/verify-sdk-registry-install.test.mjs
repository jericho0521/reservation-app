import assert from "node:assert/strict";
import test from "node:test";

import { readSdkRegistryInstallConfig } from "./verify-sdk-registry-install.mjs";

function publicRegistryEnv(overrides = {}) {
  return {
    RESERVATION_SDK_REGISTRY_PROOF_MODE: "public",
    RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
      "@reservation-platform/sdk@1.2.3 @reservation-platform/contract-types@1.2.3",
    ...overrides,
  };
}

function privateRegistryEnv(overrides = {}) {
  return {
    RESERVATION_SDK_REGISTRY_PROOF_MODE: "private",
    RESERVATION_SDK_REGISTRY_PRIVATE_URL: "https://npm.private.example.test/repository/npm/",
    RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN: "private-token",
    RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
      "@reservation-platform/sdk@1.2.3,@reservation-platform/contract-types@1.2.3",
    ...overrides,
  };
}

function disposableRegistryEnv(overrides = {}) {
  return {
    RESERVATION_SDK_REGISTRY_PROOF_MODE: "disposable",
    RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
      "@reservation-platform/sdk@0.0.0 @reservation-platform/contract-types@0.0.0",
    ...overrides,
  };
}

test("SDK registry install config safely skips when env is absent", () => {
  const parsed = readSdkRegistryInstallConfig({}, { argv: [] });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(parsed.shouldFail, false);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.installReady, false);
  assert.equal(parsed.config, null);
  assert.deepEqual(parsed.missing, ["RESERVATION_SDK_REGISTRY_PROOF_MODE"]);
  assert.match(parsed.message, /required SDK registry install proof config is incomplete/);
});

test("SDK registry install config fails strict runs when required env is missing", () => {
  const parsed = readSdkRegistryInstallConfig({}, { argv: ["--strict"] });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.shouldFail, true);
  assert.equal(parsed.ready, false);
  assert.equal(parsed.installReady, false);
  assert.match(parsed.message, /RESERVATION_SDK_REGISTRY_PROOF_MODE/);
});

test("SDK registry install config skips invalid mode by default", () => {
  const parsed = readSdkRegistryInstallConfig(
    {
      RESERVATION_SDK_REGISTRY_PROOF_MODE: "staging",
      RESERVATION_SDK_REGISTRY_PACKAGE_SPECS: "@reservation-platform/sdk@1.2.3",
    },
    { argv: [] },
  );

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.shouldSkip, true);
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /must be private, public, or disposable/);
});

test("SDK registry install config fails invalid mode in strict mode", () => {
  const parsed = readSdkRegistryInstallConfig(
    {
      RESERVATION_SDK_REGISTRY_STRICT: "1",
      RESERVATION_SDK_REGISTRY_PROOF_MODE: "staging",
      RESERVATION_SDK_REGISTRY_PACKAGE_SPECS: "@reservation-platform/sdk@1.2.3",
    },
    { argv: [] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.shouldFail, true);
  assert.match(parsed.message, /must be private, public, or disposable/);
});

test("SDK registry install config parses disposable proof mode without registry credentials", () => {
  const parsed = readSdkRegistryInstallConfig(disposableRegistryEnv({
    RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: "1",
    RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT: "0",
  }), { argv: ["--strict"] });

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.mode, "disposable");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.installReady, true);
  assert.deepEqual(parsed.requiredEnvNames, ["RESERVATION_SDK_REGISTRY_PACKAGE_SPECS"]);
  assert.equal(parsed.config.disposableRegistryPort, 0);
  assert.deepEqual(parsed.config.packageSpecs, [
    "@reservation-platform/sdk@0.0.0",
    "@reservation-platform/contract-types@0.0.0",
  ]);
});

test("SDK registry install config rejects malformed disposable registry port", () => {
  const parsed = readSdkRegistryInstallConfig(disposableRegistryEnv({
    RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: "1",
    RESERVATION_SDK_REGISTRY_DISPOSABLE_PORT: "70000",
  }), { argv: ["--strict"] });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /DISPOSABLE_PORT must be between 0 and 65535/);
});

test("SDK registry install config parses configured public proof without install opt-in", () => {
  const parsed = readSdkRegistryInstallConfig(publicRegistryEnv(), { argv: [] });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.mode, "public");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.allowInstall, false);
  assert.equal(parsed.installReady, false);
  assert.deepEqual(parsed.requiredEnvNames, ["RESERVATION_SDK_REGISTRY_PACKAGE_SPECS"]);
  assert.deepEqual(parsed.packageSpecs, [
    "@reservation-platform/sdk@1.2.3",
    "@reservation-platform/contract-types@1.2.3",
  ]);
  assert.match(parsed.message, /RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1/);
});

test("SDK registry install config parses configured private proof without install opt-in", () => {
  const parsed = readSdkRegistryInstallConfig(privateRegistryEnv(), { argv: [] });

  assert.equal(parsed.status, "skip");
  assert.equal(parsed.mode, "private");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.allowInstall, false);
  assert.equal(parsed.installReady, false);
  assert.deepEqual(parsed.requiredEnvNames, [
    "RESERVATION_SDK_REGISTRY_PRIVATE_URL",
    "RESERVATION_SDK_REGISTRY_PRIVATE_TOKEN",
    "RESERVATION_SDK_REGISTRY_PACKAGE_SPECS",
  ]);
  assert.equal(parsed.config.privateRegistryUrl, "https://npm.private.example.test/repository/npm/");
  assert.deepEqual(parsed.config.packageSpecs, [
    "@reservation-platform/sdk@1.2.3",
    "@reservation-platform/contract-types@1.2.3",
  ]);
});

test("SDK registry install config allows explicit public install opt-in", () => {
  const parsed = readSdkRegistryInstallConfig(
    publicRegistryEnv({
      RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: "1",
      RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER: "npm",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.strict, true);
  assert.equal(parsed.ready, true);
  assert.equal(parsed.allowInstall, true);
  assert.equal(parsed.installReady, true);
  assert.equal(parsed.packageManager, "npm");
});

test("SDK registry install config fails strict configured proof without install opt-in", () => {
  const parsed = readSdkRegistryInstallConfig(publicRegistryEnv(), { argv: ["--strict"] });

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.installReady, false);
  assert.match(parsed.message, /RESERVATION_SDK_REGISTRY_ALLOW_INSTALL=1/);
});

test("SDK registry install config rejects workspace and non-version package specs", () => {
  const parsed = readSdkRegistryInstallConfig(
    publicRegistryEnv({
      RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
        "@reservation-platform/sdk@latest @reservation-platform/contract-types@workspace:*",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /exact package@version specs/);
  assert.match(parsed.message, /must not use workspace, file, link, or portal specs/);
});

test("SDK registry install config rejects non-registry source package specs", () => {
  const parsed = readSdkRegistryInstallConfig(
    publicRegistryEnv({
      RESERVATION_SDK_REGISTRY_PACKAGE_SPECS: [
        "@reservation-platform/sdk@1.2.3",
        "@reservation-platform/contract-types@1.2.3",
        "github:user/repo@1.2.3",
        "user/repo@1.2.3",
        "https://example.test/pkg@1.2.3",
        "../pkg@1.2.3",
        "git+ssh://git@github.com/user/repo.git#v1.2.3",
      ].join(" "),
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /github:user\/repo@1\.2\.3/);
  assert.match(parsed.message, /user\/repo@1\.2\.3/);
  assert.match(parsed.message, /https:\/\/example\.test\/pkg@1\.2\.3/);
  assert.match(parsed.message, /\.\.\/pkg@1\.2\.3/);
  assert.match(parsed.message, /git\+ssh:\/\/git@github\.com\/user\/repo\.git#v1\.2\.3/);
});

test("SDK registry install config allows unscoped npm names with exact versions", () => {
  const parsed = readSdkRegistryInstallConfig(
    publicRegistryEnv({
      RESERVATION_SDK_REGISTRY_PACKAGE_SPECS:
        "@reservation-platform/sdk@1.2.3 @reservation-platform/contract-types@1.2.3 left-pad@1.2.3",
      RESERVATION_SDK_REGISTRY_ALLOW_INSTALL: "1",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.ready, true);
  assert.deepEqual(parsed.packageSpecs, [
    "@reservation-platform/sdk@1.2.3",
    "@reservation-platform/contract-types@1.2.3",
    "left-pad@1.2.3",
  ]);
});

test("SDK registry install config validates private registry URL and package manager", () => {
  const parsed = readSdkRegistryInstallConfig(
    privateRegistryEnv({
      RESERVATION_SDK_REGISTRY_PRIVATE_URL: "ftp://npm.private.example.test",
      RESERVATION_SDK_REGISTRY_PACKAGE_MANAGER: "yarn",
    }),
    { argv: ["--strict"] },
  );

  assert.equal(parsed.status, "fail");
  assert.equal(parsed.ready, false);
  assert.match(parsed.message, /PRIVATE_URL must use http or https/);
  assert.match(parsed.message, /PACKAGE_MANAGER must be pnpm or npm/);
});
