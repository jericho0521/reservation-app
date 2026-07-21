#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const forbiddenDirectories = [".superpowers/", "tmp/", ".reservation-whatsapp-sessions/"];
const evidenceDirectoryPattern = /(?:^|\/)(?:evidence|recordings|screenshots)(?:\/|$)/u;
const evidenceExtensionPattern = /\.(?:mp4|mov|webm)$/iu;
const environmentFilePattern = /(?:^|\/)\.env(?:\..+)?$/u;
const allowedEnvironmentFiles = new Set([".env.example"]);

export function findRepositoryHygieneViolations(trackedPaths) {
  const findings = [];

  for (const inputPath of trackedPaths) {
    const trackedPath = inputPath.replaceAll("\\", "/").replace(/^\.\//u, "");
    if (forbiddenDirectories.some((directory) => trackedPath.startsWith(directory))) {
      findings.push(`${trackedPath}: local runtime or agent state must not be tracked`);
    }
    if (environmentFilePattern.test(trackedPath) && !allowedEnvironmentFiles.has(trackedPath)) {
      findings.push(`${trackedPath}: environment files must not be tracked`);
    }
    if (evidenceDirectoryPattern.test(trackedPath) && evidenceExtensionPattern.test(trackedPath)) {
      findings.push(`${trackedPath}: recordings and acceptance evidence belong under tmp/`);
    }
    if (/^docs\/manuals\/.*\.docx$/iu.test(trackedPath)) {
      findings.push(`${trackedPath}: the maintained manual is the checked HTML artifact`);
    }
  }

  return findings;
}

function runCli() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const trackedPaths = execFileSync("git", ["ls-files"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).split(/\r?\n/u).filter((trackedPath) => trackedPath && existsSync(path.join(repositoryRoot, trackedPath)));
  const findings = findRepositoryHygieneViolations(trackedPaths);

  if (findings.length > 0) {
    for (const finding of findings) console.error(`repository-hygiene: ${finding}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Repository hygiene verified across ${trackedPaths.length} tracked files.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) runCli();
