#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";
import { createInterface, emitKeypressEvents } from "node:readline";
import { pathToFileURL } from "node:url";
import {
  argon2idPasswordHasher,
  normalizeDisplayName,
  normalizeEmail,
  validatePassword,
} from "../packages/reservation-platform-api/src/sessions.js";

const localTenantId = "final_demo";
const localOwnerId = "00000000-0000-4000-8000-000000000701";

export interface LocalOwnerInput {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export async function bootstrapLocalOwner(
  input: LocalOwnerInput,
  dependencies: {
    hashPassword?: (password: string) => Promise<string>;
    runSql?: (sql: string) => void;
  } = {},
) {
  const displayName = normalizeDisplayName(input.displayName);
  const email = normalizeEmail(input.email);
  if (!displayName) throw new Error("Enter a valid owner name.");
  if (!email) throw new Error("Enter a valid owner email address.");
  if (!validatePassword(input.password)) {
    throw new Error("Password must contain at least 12 characters.");
  }
  if (input.password !== input.passwordConfirmation) {
    throw new Error("Password confirmation does not match.");
  }

  const passwordHash = await (dependencies.hashPassword ?? argon2idPasswordHasher.hash)(input.password);
  const sql = buildLocalOwnerBootstrapSql({ displayName, email, passwordHash });
  (dependencies.runSql ?? runLocalDockerSql)(sql);
  return { displayName, email };
}

export function buildLocalOwnerBootstrapSql(input: {
  displayName: string;
  email: string;
  passwordHash: string;
}) {
  return `do $reservation_local_owner$
declare
  updated_count integer;
begin
  if not exists (
    select 1
    from public.reservation_local_stack_state
    where key = 'final-demo-v1'
  ) then
    raise exception 'Local demo marker is missing';
  end if;

  if not exists (
    select 1
    from public.platform_installation
    where singleton = true
      and tenant_id = '${localTenantId}'
      and domain = 'localhost'
      and setup_completed_at is not null
  ) then
    raise exception 'Local demo installation is unavailable';
  end if;

  update public.platform_users
  set email = ${sqlLiteral(input.email)},
      display_name = ${sqlLiteral(input.displayName)},
      password_hash = ${sqlLiteral(input.passwordHash)},
      status = 'active',
      updated_at = now()
  where id = '${localOwnerId}'::uuid
    and tenant_id = '${localTenantId}'
    and role = 'owner';

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Local demo owner is unavailable';
  end if;

  delete from public.platform_sessions
  where user_id = '${localOwnerId}'::uuid;
end
$reservation_local_owner$;
`;
}

function runLocalDockerSql(sql: string) {
  const composeFiles = process.argv.includes("--demo")
    ? ["-f", "docker-compose.yml", "-f", "docker-compose.demo.yml"]
    : [];
  const result = spawnSync(
    "docker",
    ["compose", ...composeFiles, "exec", "-T", "reservation-db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "reservation"],
    { encoding: "utf8", input: sql, stdio: ["pipe", "ignore", "pipe"] },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Local owner bootstrap failed. Confirm the local Docker stack is healthy and try again.");
  }
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function promptForOwner(): Promise<LocalOwnerInput> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Local owner bootstrap requires an interactive terminal.");
  }
  const interface_ = createInterface({ input: stdin, output: stdout });
  const displayName = await question(interface_, "Owner name: ");
  const email = await question(interface_, "Owner email: ");
  interface_.close();
  const password = await hiddenQuestion("Password (at least 12 characters; input is masked): ");
  const passwordConfirmation = await hiddenQuestion("Confirm password: ");
  return { displayName, email, password, passwordConfirmation };
}

function question(interface_: ReturnType<typeof createInterface>, prompt: string) {
  return new Promise<string>((resolve) => interface_.question(prompt, resolve));
}

function hiddenQuestion(prompt: string) {
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;
    emitKeypressEvents(stdin);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdout.write(prompt);

    const finish = (error?: Error) => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode?.(Boolean(wasRaw));
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Local owner bootstrap cancelled."));
      } else if (key.name === "return" || key.name === "enter") {
        finish();
      } else if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (!key.ctrl && !key.meta && text && value.length < 128) {
        const addition = text.slice(0, 128 - value.length);
        value += addition;
        stdout.write("*".repeat(addition.length));
      }
    };
    stdin.on("keypress", onKeypress);
  });
}

async function main() {
  if (!process.argv.includes("--demo")) {
    throw new Error("The CLI owner helper is demo-only. Use pnpm run stack:setup-url for product onboarding.");
  }
  const owner = await bootstrapLocalOwner(await promptForOwner());
  stdout.write(`Local owner ${owner.email} is ready. Sign in at http://127.0.0.1:4300/admin/login.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Local owner bootstrap failed."}\n`);
    process.exitCode = 1;
  });
}
