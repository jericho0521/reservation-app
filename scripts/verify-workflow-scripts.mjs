import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function indentation(line) {
  return line.match(/^\s*/u)[0].length;
}

function isIgnoredLine(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function stripShellComment(command) {
  let quote;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = quote === character ? undefined : quote ?? character;
      continue;
    }
    if (character === "#" && quote === undefined && (index === 0 || /\s/u.test(command[index - 1]))) {
      return command.slice(0, index);
    }
  }

  return command;
}

function workflowRunSteps(text) {
  const lines = text.split(/\r?\n/u);
  const commands = [];

  for (let index = 0; index < lines.length; index += 1) {
    const stepsMatch = lines[index].match(/^(\s*)steps\s*:\s*(?:#.*)?$/u);
    if (!stepsMatch) continue;

    const stepsIndent = stepsMatch[1].length;
    let itemIndent;

    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (isIgnoredLine(line)) continue;
      const lineIndent = indentation(line);
      if (lineIndent <= stepsIndent) {
        index -= 1;
        break;
      }

      const itemMatch = line.match(/^(\s*)-\s+(.*)$/u);
      if (itemMatch && (itemIndent === undefined || itemMatch[1].length === itemIndent)) {
        itemIndent ??= itemMatch[1].length;
        const propertyIndent = itemIndent + 2;
        const inlineRun = itemMatch[2].match(/^run\s*:\s*(.*)$/u);
        if (inlineRun) {
          const scalar = inlineRun[1].trim();
          if (/^[|>][+-]?$/u.test(scalar)) {
            const blockLines = [];
            while (index + 1 < lines.length) {
              const nextLine = lines[index + 1];
              if (!isIgnoredLine(nextLine) && indentation(nextLine) <= propertyIndent) break;
              index += 1;
              if (!nextLine.trim().startsWith("#")) blockLines.push(nextLine.trim());
            }
            commands.push(blockLines.join("\n"));
          } else {
            commands.push(scalar);
          }
        }
        continue;
      }

      if (itemIndent === undefined || lineIndent !== itemIndent + 2) continue;
      const runMatch = line.trim().match(/^run\s*:\s*(.*)$/u);
      if (!runMatch) continue;

      const scalar = runMatch[1].trim();
      if (/^[|>][+-]?$/u.test(scalar)) {
        const blockLines = [];
        while (index + 1 < lines.length) {
          const nextLine = lines[index + 1];
          if (!isIgnoredLine(nextLine) && indentation(nextLine) <= lineIndent) break;
          index += 1;
          if (!nextLine.trim().startsWith("#")) blockLines.push(nextLine.trim());
        }
        commands.push(blockLines.join("\n"));
      } else {
        commands.push(scalar);
      }
    }
  }

  return commands.map((command) =>
    command
      .split(/\r?\n/u)
      .map(stripShellComment)
      .join("\n"),
  );
}

export function verifyWorkflowScripts({ packageJson, workflows }) {
  const scripts = packageJson.scripts ?? {};
  const findings = [];

  for (const [name, command] of Object.entries(scripts)) {
    if (/\bcorepack\s+pnpm\b/u.test(String(command))) {
      findings.push(`package.json script ${name} invokes corepack pnpm`);
    }
  }

  for (const workflow of workflows) {
    for (const command of workflowRunSteps(workflow.text)) {
      if (/\bcorepack\s+pnpm\b/u.test(command)) {
        findings.push(`${workflow.path} run step invokes corepack pnpm`);
      }
      for (const match of command.matchAll(/\bpnpm\s+run\s+([\w:-]+)/gu)) {
        if (!(match[1] in scripts)) {
          findings.push(`${workflow.path} references missing script: ${match[1]}`);
        }
      }
    }
  }

  return findings;
}

async function runCli() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const workflowPaths = [".github/workflows/ci.yml", ".github/workflows/deploy.yml"];
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const workflows = await Promise.all(
    workflowPaths.map(async (workflowPath) => ({
      path: workflowPath,
      text: await readFile(path.join(repositoryRoot, workflowPath), "utf8"),
    })),
  );
  const findings = verifyWorkflowScripts({ packageJson, workflows });

  if (findings.length > 0) {
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
    return;
  }

  console.log("Workflow scripts verified.");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
