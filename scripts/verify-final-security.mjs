#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenClientNames = ["RESERVATION_SUPABASE_SERVICE_ROLE_KEY", "RESERVATION_PLATFORM_SERVICE_API_KEY", "RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY", "encrypted_credentials"];
const scannerFixtureFiles = new Set(["scripts/verify-final-security.mjs", "scripts/verify-final-security.test.mjs"]);

export function securityFindingsForText(file, source) {
  const findings = [];
  if (/^[\s\S]*?["']use client["'];/u.test(source)) for (const name of forbiddenClientNames) if (source.includes(name)) findings.push(`${file}: client module contains ${name}`);
  const unsafeLog = source.split("\n").find((line) => /console\.(?:log|info|debug)\s*\([^\n]*(?:qr|credential|session[_ ]?key)/iu.test(line) && !/verified .*boundar/iu.test(line));
  if (!/\.test\.[cm]?[jt]sx?$/u.test(file) && unsafeLog) findings.push(`${file}: logs credential or QR-related data`);
  if (/\bsk-[a-z0-9_-]{20,}\b/iu.test(source) || /service[_-]?role[^\n]{0,40}eyj[a-z0-9_-]{20,}/iu.test(source)) findings.push(`${file}: contains a credential-shaped literal`);
  return findings;
}

export function productionSecurityFindingsForText(file, source) {
  const findings = [];
  if (/RESERVATION_PLATFORM_CORS_ALLOWED_ORIGINS\s*[:=]\s*["']?\*/u.test(source)) findings.push(`${file}: enables wildcard credentialed CORS`);
  if (/console\.(?:log|info|debug)\s*\([^\n]*(?:qr|credential|session[_ ]?key)/iu.test(source)) findings.push(`${file}: logs credential or QR-related data`);
  for (const line of source.split("\n")) {
    const image = /^\s*image:\s*(.+?)\s*$/u.exec(line)?.[1];
    if (image && !image.startsWith("${") && !/@sha256:[0-9a-f]{64}$/u.test(image)) findings.push(`${file}: contains an unpinned production image`);
  }
  if (/reservation-(?:db|gateway):[\s\S]{0,600}?\n\s+ports:/u.test(source)) findings.push(`${file}: exposes a database or PostgREST port`);
  return findings;
}

export function verifyFinalSecurity() {
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
  if (listed.status !== 0) throw new Error("Unable to enumerate tracked files for security review.");
  const findings = [];
  for (const file of listed.stdout.split("\0").filter(Boolean)) {
    if (scannerFixtureFiles.has(file) || !/\.(?:ts|tsx|js|mjs|json|md|html)$/u.test(file)) continue;
    findings.push(...securityFindingsForText(file, readFileSync(path.join(repoRoot, file), "utf8")));
  }
  for (const directory of ["apps/booking/.next/static", "apps/console/.next/static"]) {
    const absolute = path.join(repoRoot, directory); if (!existsSync(absolute)) continue;
    for (const file of walk(absolute)) {
      const source = readFileSync(file, "utf8");
      for (const name of forbiddenClientNames) if (source.includes(name)) findings.push(`${path.relative(repoRoot, file)}: generated client bundle contains ${name}`);
    }
  }
  const compose = readFileSync(path.join(repoRoot, "compose.production.yml"), "utf8");
  findings.push(...productionSecurityFindingsForText("compose.production.yml", compose));
  const workerAllowlist = readFileSync(path.join(repoRoot, "docker/production/allowlists/worker.env"), "utf8");
  if (!workerAllowlist.includes("RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY")) findings.push("docker/production/allowlists/worker.env: production WhatsApp encryption is not configured");
  const caddy = readFileSync(path.join(repoRoot, "docker/production/Caddyfile"), "utf8");
  if (!caddy.includes("-Server") || !caddy.includes("max_size 1MB") || !caddy.includes("Strict-Transport-Security")) findings.push("docker/production/Caddyfile: required production request and response hardening is missing");
  if (findings.length) throw new Error(`Final security verification failed:\n- ${findings.join("\n- ")}`);
  console.log("Final security verification passed: tracked source and available client bundles contain no credential literals, forbidden client secret names, or QR/credential logging.");
}

function walk(directory) { return readdirSync(directory).flatMap((entry) => { const value = path.join(directory, entry); return statSync(value).isDirectory() ? walk(value) : [value]; }); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { verifyFinalSecurity(); } catch (error) { console.error(error instanceof Error ? error.message : "Security verification failed."); process.exitCode = 1; } }
