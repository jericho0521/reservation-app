#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredReleaseDocs = [
  "docs/tutorials/production-first-run.md",
  "docs/how-to/owner-onboarding.md",
  "docs/how-to/staff-working-day.md",
  "docs/how-to/connect-ai.md",
  "docs/how-to/connect-whatsapp.md",
  "docs/how-to/recover-installation.md",
  "docs/reference/production-configuration.md",
  "docs/reference/release-compatibility.md",
  "docs/release-evidence/full-day-acceptance-template.md",
];

export function validateReleaseDocContent(path, content) {
  const errors = [];
  if (!/^#\s+\S/mu.test(content)) errors.push(`${path}: missing level-one title`);
  if (/RESERVATION_(?:SUPABASE_SERVICE_ROLE_KEY|PLATFORM_SERVICE_API_KEY)\s*=\s*[^<\s][^\s]*/u.test(content)) {
    errors.push(`${path}: contains a fixed server credential assignment`);
  }
  if (/setup\?token=(?!<|\.\.\.)[A-Za-z0-9_-]{20,}/u.test(content)) {
    errors.push(`${path}: contains a setup capability value`);
  }
  if (/QR payload:\s*\S+/u.test(content)) errors.push(`${path}: contains a raw QR payload`);
  return errors;
}

export function validateReleaseDocs(root = process.cwd()) {
  const errors = [];
  const checked = [...requiredReleaseDocs, "README.md", "docs/README.md", "docs/manuals/README.md", "docs/manuals/backend-modules-dev-user-manual.html"];

  for (const relativePath of checked) {
    const absolutePath = resolve(root, relativePath);
    if (!existsSync(absolutePath)) {
      errors.push(`${relativePath}: required document is missing`);
      continue;
    }
    const content = readFileSync(absolutePath, "utf8");
    if (requiredReleaseDocs.includes(relativePath) && extname(relativePath) === ".md") {
      errors.push(...validateReleaseDocContent(relativePath, content));
    }
    errors.push(...validateLocalLinks(root, relativePath, content));
  }

  const readme = existsSync(resolve(root, "README.md")) ? readFileSync(resolve(root, "README.md"), "utf8") : "";
  for (const relativePath of requiredReleaseDocs.slice(0, 8)) {
    if (!readme.includes(relativePath)) errors.push(`README.md: missing production link to ${relativePath}`);
  }

  const reference = existsSync(resolve(root, "docs/reference/release-compatibility.md"))
    ? readFileSync(resolve(root, "docs/reference/release-compatibility.md"), "utf8")
    : "";
  if (!reference.includes("0.2.0")) errors.push("release compatibility: missing release 0.2.0");
  if (!reference.includes("000043")) errors.push("release compatibility: missing migration 000043");

  return errors;
}

function validateLocalLinks(root, relativePath, content) {
  const errors = [];
  const markdownLinks = /\[[^\]]+\]\(([^)]+)\)/gu;
  const htmlLinks = /href="([^"]+)"/gu;
  for (const match of [...content.matchAll(markdownLinks), ...content.matchAll(htmlLinks)]) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:|#)/u.test(target)) continue;
    const decoded = decodeURIComponent(target);
    const absoluteTarget = resolve(dirname(resolve(root, relativePath)), decoded);
    if (!absoluteTarget.startsWith(resolve(root))) {
      errors.push(`${relativePath}: link escapes repository: ${target}`);
    } else if (!existsSync(absoluteTarget)) {
      errors.push(`${relativePath}: broken local link: ${target}`);
    }
  }
  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const errors = validateReleaseDocs();
  if (errors.length) {
    for (const error of errors) console.error(`release-docs: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`release-docs: verified ${requiredReleaseDocs.length} production documents and their indexes`);
  }
}
