import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  POSTGREST_TOKEN_TTL_SECONDS,
  PRODUCTION_IMAGE_NAMES,
  PRODUCTION_IMAGE_REGISTRY,
  SECRET_FILE_NAMES,
  configureProduction,
  validateProductionDomain,
  validateReleaseTag,
  writeFileAtomically,
} from "./configure.mjs";

const temporaryRoots = [];

test.afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (directory) => {
      const { rm } = await import("node:fs/promises");
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function makeTemporaryDirectory(name) {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(tmpdir(), `reservation-${name}-`)),
  );
  temporaryRoots.push(root);
  return realpath(root);
}

function deterministicRandomBytes() {
  let callCount = 0;
  const randomBytes = (size) => {
    assert.equal(size, 32);
    callCount += 1;
    return Buffer.alloc(size, callCount);
  };
  randomBytes.calls = () => callCount;
  return randomBytes;
}

function decodeJwt(token) {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  return {
    encodedHeader,
    encodedPayload,
    header: JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    signature,
  };
}

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("configure creates exactly ten protected secrets and a non-secret release file", async () => {
  const root = await makeTemporaryDirectory("configure");
  const directory = path.join(root, "config");
  const randomBytes = deterministicRandomBytes();

  const result = await configureProduction({
    directory,
    domain: "book.example.com",
    release: "0.2.0",
    randomBytes,
    now: () => 1_800_000_000_000,
  });

  assert.equal(randomBytes.calls(), 10);
  assert.deepEqual((await readdir(directory)).sort(), [...SECRET_FILE_NAMES, "release.env"].sort());
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  for (const fileName of SECRET_FILE_NAMES) {
    const file = await lstat(path.join(directory, fileName));
    assert.equal(file.isFile(), true);
    assert.equal(file.isSymbolicLink(), false);
    assert.equal(file.mode & 0o777, 0o600, fileName);
  }
  assert.equal((await lstat(path.join(directory, "release.env"))).mode & 0o777, 0o644);

  const releaseEnvironment = await readFile(path.join(directory, "release.env"), "utf8");
  assert.match(releaseEnvironment, /^RESERVATION_DOMAIN=book\.example\.com$/mu);
  assert.match(releaseEnvironment, /^RESERVATION_RELEASE=0\.2\.0$/mu);
  for (const [component, imageName] of Object.entries(PRODUCTION_IMAGE_NAMES)) {
    assert.match(
      releaseEnvironment,
      new RegExp(`^RESERVATION_${component.toUpperCase()}_IMAGE=${PRODUCTION_IMAGE_REGISTRY.replaceAll(".", "\\.")}/${imageName}:0\\.2\\.0$`, "mu"),
    );
  }

  const serializedResult = JSON.stringify(result);
  for (const fileName of SECRET_FILE_NAMES) {
    const value = await readFile(path.join(directory, fileName), "utf8");
    assert.equal(result.stdout.includes(value), false, fileName);
    assert.equal(serializedResult.includes(value), false, fileName);
  }
  assert.deepEqual(Object.keys(result.secretDigests).sort(), [...SECRET_FILE_NAMES].sort());
  assert.equal("generated" in result, false);
  assert.doesNotMatch(result.stdout, /setup-token|jwt|service-token|recovery-key/iu);
});

test("configure is idempotent and never rotates a valid configuration", async () => {
  const root = await makeTemporaryDirectory("idempotent");
  const directory = path.join(root, "config");
  const randomBytes = deterministicRandomBytes();
  const options = {
    directory,
    domain: "book.example.com",
    release: "0.2.0",
    now: () => 1_800_000_000_000,
  };

  const first = await configureProduction({ ...options, randomBytes });
  const before = await Promise.all(
    SECRET_FILE_NAMES.map((fileName) => readFile(path.join(directory, fileName), "utf8")),
  );
  const second = await configureProduction({
    ...options,
    randomBytes: () => {
      throw new Error("idempotent configuration must not request entropy");
    },
  });
  const after = await Promise.all(
    SECRET_FILE_NAMES.map((fileName) => readFile(path.join(directory, fileName), "utf8")),
  );

  assert.deepEqual(after, before);
  assert.deepEqual(second.secretDigests, first.secretDigests);
  assert.equal(second.created, false);
});

test("PostgREST tokens are distinct bounded HS256 tokens with the required roles", async () => {
  const root = await makeTemporaryDirectory("jwt");
  const directory = path.join(root, "config");
  await configureProduction({
    directory,
    domain: "book.example.com",
    release: "0.2.0",
    randomBytes: deterministicRandomBytes(),
    now: () => 1_800_000_000_000,
  });

  const signingSecret = await readFile(path.join(directory, "postgrest-jwt-secret"), "utf8");
  assert.equal(Buffer.from(signingSecret, "base64url").byteLength, 32);
  const anonToken = await readFile(path.join(directory, "postgrest-anon-token"), "utf8");
  const serviceToken = await readFile(path.join(directory, "postgrest-service-token"), "utf8");
  assert.notEqual(anonToken, serviceToken);

  for (const [token, role] of [[anonToken, "anon"], [serviceToken, "service_role"]]) {
    const decoded = decodeJwt(token);
    assert.deepEqual(decoded.header, { alg: "HS256", typ: "JWT" });
    assert.equal(decoded.payload.role, role);
    assert.equal(decoded.payload.iss, "reservation-platform");
    assert.equal(decoded.payload.aud, "postgrest");
    assert.equal(decoded.payload.exp - decoded.payload.iat, POSTGREST_TOKEN_TTL_SECONDS);
    assert.match(decoded.payload.jti, /^[A-Za-z0-9_-]{43}$/u);
    const expectedSignature = createHmac("sha256", signingSecret)
      .update(`${decoded.encodedHeader}.${decoded.encodedPayload}`)
      .digest("base64url");
    assert.equal(decoded.signature, expectedSignature);
  }
});

test("domain validation accepts only normalized ASCII DNS names", () => {
  assert.equal(validateProductionDomain("book.example.com"), "book.example.com");
  for (const value of [
    "Book.Example.com",
    " book.example.com",
    "https://book.example.com",
    "book.example.com/path",
    "book.example.com:443",
    "*.example.com",
    "127.0.0.1",
    "[::1]",
    "localhost",
    "café.example.com",
    "-book.example.com",
    "book_.example.com",
    "book.example.com.",
  ]) {
    assert.throws(() => validateProductionDomain(value), /normalized ASCII DNS name/u, value);
  }
});

test("release validation accepts an exact immutable semver tag", () => {
  for (const value of ["0.2.0", "1.0.0-rc.1"]) assert.equal(validateReleaseTag(value), value);
  for (const value of ["v0.2.0", "0.2", "latest", "main", "^0.2.0", "0.2.0+build", "01.2.3", "1.0.0-01", "0.2.0 "]) {
    assert.throws(() => validateReleaseTag(value), /exact immutable release tag/u, value);
  }
});

test("configure rejects partial, mismatched, or unsafe existing state without overwriting it", async () => {
  const root = await makeTemporaryDirectory("unsafe");
  const partialDirectory = path.join(root, "partial");
  await mkdir(partialDirectory, { mode: 0o700 });
  await writeFile(path.join(partialDirectory, "database-password"), "leave-me-alone", { mode: 0o600 });
  await assert.rejects(
    configureProduction({ directory: partialDirectory, domain: "book.example.com", release: "0.2.0" }),
    /partial production configuration/u,
  );
  assert.equal(await readFile(path.join(partialDirectory, "database-password"), "utf8"), "leave-me-alone");

  const configuredDirectory = path.join(root, "configured");
  await configureProduction({
    directory: configuredDirectory,
    domain: "book.example.com",
    release: "0.2.0",
    randomBytes: deterministicRandomBytes(),
  });
  await assert.rejects(
    configureProduction({ directory: configuredDirectory, domain: "other.example.com", release: "0.2.0" }),
    /does not match the requested domain and release/u,
  );
  await chmod(path.join(configuredDirectory, "database-password"), 0o644);
  await assert.rejects(
    configureProduction({ directory: configuredDirectory, domain: "book.example.com", release: "0.2.0" }),
    /mode 0600/u,
  );
});

test("configure rejects symlink directories and secret files", async () => {
  const root = await makeTemporaryDirectory("symlink");
  const actual = path.join(root, "actual");
  const linked = path.join(root, "linked");
  await mkdir(actual, { mode: 0o700 });
  await symlink(actual, linked, "dir");
  await assert.rejects(
    configureProduction({ directory: linked, domain: "book.example.com", release: "0.2.0" }),
    /symbolic link/u,
  );

  const configured = path.join(root, "configured");
  await configureProduction({
    directory: configured,
    domain: "book.example.com",
    release: "0.2.0",
    randomBytes: deterministicRandomBytes(),
  });
  const databasePassword = path.join(configured, "database-password");
  const replacement = path.join(root, "replacement");
  await writeFile(replacement, "replacement", { mode: 0o600 });
  const { unlink } = await import("node:fs/promises");
  await unlink(databasePassword);
  await symlink(replacement, databasePassword);
  await assert.rejects(
    configureProduction({ directory: configured, domain: "book.example.com", release: "0.2.0" }),
    /symbolic link/u,
  );
});

test("configure rejects lexical traversal and symbolic-link ancestors before writing", async () => {
  const root = await makeTemporaryDirectory("path-safety");
  const linkedParent = path.join(root, "linked-parent");
  const actualParent = path.join(root, "actual-parent");
  await mkdir(actualParent, { mode: 0o700 });
  await symlink(actualParent, linkedParent, "dir");

  await assert.rejects(
    configureProduction({
      directory: `${root}/missing/../escaped`,
      domain: "book.example.com",
      release: "0.2.0",
    }),
    /normalized absolute path/u,
  );
  await assert.rejects(
    configureProduction({
      directory: path.join(linkedParent, "config"),
      domain: "book.example.com",
      release: "0.2.0",
    }),
    /symbolic link/u,
  );
  await assert.rejects(lstat(path.join(actualParent, "config")), /ENOENT/u);
});

test("atomic writes clean temporary files when publication fails", async () => {
  const root = await makeTemporaryDirectory("atomic");
  const target = path.join(root, "target");
  await assert.rejects(
    writeFileAtomically(target, "protected", {
      mode: 0o600,
      beforeRename: async () => {
        throw new Error("simulated publication failure");
      },
    }),
    /simulated publication failure/u,
  );
  assert.equal((await readdir(root)).length, 0);
});

test("run-with-secrets exports only explicitly mapped regular files and does not print values", async () => {
  const root = await makeTemporaryDirectory("entrypoint");
  const secrets = path.join(root, "secrets");
  await mkdir(secrets, { mode: 0o700 });
  await writeFile(path.join(secrets, "database-password"), "private-value", { mode: 0o600 });
  await writeFile(path.join(secrets, "unmapped-secret"), "must-not-export", { mode: 0o600 });
  const mappings = path.join(root, "allowlist");
  await writeFile(mappings, "DATABASE_PASSWORD=database-password\n", { mode: 0o600 });

  const entrypoint = path.resolve("docker/production/run-with-secrets.sh");
  const result = await run("sh", [entrypoint, mappings, "--", "sh", "-c", "test \"$DATABASE_PASSWORD\" = private-value && test -z \"${UNMAPPED_SECRET:-}\""], {
    env: { ...process.env, RESERVATION_SECRETS_DIR: secrets },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("run-with-secrets rejects unsafe mappings and symlinked secret files", async () => {
  const root = await makeTemporaryDirectory("entrypoint-reject");
  const secrets = path.join(root, "secrets");
  await mkdir(secrets, { mode: 0o700 });
  const outside = path.join(root, "outside");
  await writeFile(outside, "private-value", { mode: 0o600 });
  await symlink(outside, path.join(secrets, "database-password"));
  const entrypoint = path.resolve("docker/production/run-with-secrets.sh");

  for (const mapping of ["BAD-NAME=database-password\n", "DATABASE_PASSWORD=../outside\n", "DATABASE_PASSWORD=database-password\n"]) {
    const mappings = path.join(root, `mapping-${Buffer.from(mapping).toString("hex")}`);
    await writeFile(mappings, mapping, { mode: 0o600 });
    const result = await run("sh", [entrypoint, mappings, "--", "true"], {
      env: { ...process.env, RESERVATION_SECRETS_DIR: secrets },
    });
    assert.notEqual(result.status, 0, mapping);
    assert.equal(result.stdout.includes("private-value"), false);
    assert.equal(result.stderr.includes("private-value"), false);
  }
});

test("run-with-secrets locks a root-read then UID/GID-drop contract", async () => {
  const root = await makeTemporaryDirectory("entrypoint-drop");
  const secrets = path.join(root, "secrets");
  await mkdir(secrets, { mode: 0o700 });
  await writeFile(path.join(secrets, "internal-service-key"), "private-value", { mode: 0o600 });
  const mappings = path.join(root, "allowlist");
  await writeFile(mappings, "INTERNAL_SERVICE_KEY=internal-service-key\n", { mode: 0o600 });
  const fakeSuExec = path.join(root, "su-exec");
  await writeFile(fakeSuExec, [
    "#!/bin/sh",
    "test \"$1\" = \"1001:1002\" || exit 91",
    "shift",
    "exec \"$@\"",
    "",
  ].join("\n"), { mode: 0o700 });
  await chmod(fakeSuExec, 0o700);

  const entrypoint = path.resolve("docker/production/run-with-secrets.sh");
  const currentUid = process.getuid?.() ?? 1;
  const environment = {
    ...process.env,
    RESERVATION_SECRETS_DIR: secrets,
    RESERVATION_RUN_AS_UID: "1001",
    RESERVATION_RUN_AS_GID: "1002",
    RESERVATION_SU_EXEC_PATH: fakeSuExec,
  };
  const result = await run("sh", [entrypoint, mappings, "--", "sh", "-c", "test \"$INTERNAL_SERVICE_KEY\" = private-value"], {
    env: environment,
  });
  if (currentUid === 0) {
    assert.equal(result.status, 0, result.stderr);
  } else {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /only root can load protected secrets/u);
  }
  assert.equal(result.stdout.includes("private-value"), false);
  assert.equal(result.stderr.includes("private-value"), false);
});

test("run-with-secrets rejects noncanonical or unsafe run-as UID and GID values", async () => {
  const root = await makeTemporaryDirectory("entrypoint-ids");
  const secrets = path.join(root, "secrets");
  await mkdir(secrets, { mode: 0o700 });
  await writeFile(path.join(secrets, "internal-service-key"), "private-value", { mode: 0o600 });
  const mappings = path.join(root, "allowlist");
  await writeFile(mappings, "INTERNAL_SERVICE_KEY=internal-service-key\n", { mode: 0o600 });
  const entrypoint = path.resolve("docker/production/run-with-secrets.sh");
  const invalidIds = ["0", "00", "0001", "+1", "-1", " 1", "1 ", "one", "1:2"];

  for (const invalidId of invalidIds) {
    for (const [uid, gid] of [[invalidId, "1002"], ["1001", invalidId]]) {
      const result = await run("sh", [entrypoint, mappings, "--", "true"], {
        env: {
          ...process.env,
          RESERVATION_SECRETS_DIR: secrets,
          RESERVATION_RUN_AS_UID: uid,
          RESERVATION_RUN_AS_GID: gid,
        },
      });
      assert.notEqual(result.status, 0, `${JSON.stringify(uid)}:${JSON.stringify(gid)}`);
      assert.match(result.stderr, /canonical positive integers/u);
      assert.equal(result.stdout.includes("private-value"), false);
      assert.equal(result.stderr.includes("private-value"), false);
    }
  }
});

test("the tools image and Docker context pin production inputs and exclude every secret basename", async () => {
  const dockerfile = await readFile(path.resolve("Dockerfile.production-tools"), "utf8");
  assert.match(
    dockerfile,
    /^FROM node:20\.19\.4-alpine3\.22@sha256:[a-f0-9]{64}$/mu,
  );
  assert.match(dockerfile, /postgresql16-client=16\.14-r0/u);
  assert.match(dockerfile, /su-exec=0\.2-r3/u);

  const dockerignore = await readFile(path.resolve(".dockerignore"), "utf8");
  for (const fileName of SECRET_FILE_NAMES) {
    assert.match(dockerignore, new RegExp(`^\\*\\*/${fileName}$`, "mu"), fileName);
  }
});

test("configure CLI uses only the protected directory environment and emits redacted JSON", async () => {
  const root = await makeTemporaryDirectory("cli");
  const directory = path.join(root, "config");
  const result = await run(
    process.execPath,
    [path.resolve("scripts/production/configure.mjs"), "--domain", "book.example.com", "--release", "0.2.0"],
    { env: { ...process.env, RESERVATION_PRODUCTION_CONFIG_DIR: directory } },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "ready");
  assert.equal(output.protectedValues.present, 10);
  assert.equal(output.protectedValues.digests.length, 10);
  assert.doesNotMatch(result.stdout, /setup-token|jwt|service-token|recovery-key/iu);
  for (const fileName of SECRET_FILE_NAMES) {
    const value = await readFile(path.join(directory, fileName), "utf8");
    assert.equal(result.stdout.includes(value), false, fileName);
  }
});
