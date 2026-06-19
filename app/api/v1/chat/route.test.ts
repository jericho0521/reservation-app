import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { POST as createReservationSession } from "./reservation-sessions/route";
import { POST as sendMessage } from "./reservation-sessions/[id]/messages/route";
import { POST as streamMessage } from "./reservation-sessions/[id]/[operation]/route";
import { POST as confirmReservation } from "./reservation-sessions/[id]/confirm/route";

const disabledChatBody = {
  error: {
    code: "chat_module_disabled",
    message: "Chat module is disabled.",
    status: 404,
  },
};

const chatDir = dirname(fileURLToPath(import.meta.url));
const apiV1Dir = dirname(chatDir);

test("POST /api/v1/chat/reservation-sessions returns chat_module_disabled", async () => {
  await assertDisabledChatResponse(createReservationSession());
});

test("POST /api/v1/chat/reservation-sessions/{id}/messages returns chat_module_disabled", async () => {
  await assertDisabledChatResponse(sendMessage());
});

test("POST /api/v1/chat/reservation-sessions/{id}/messages:stream returns chat_module_disabled", async () => {
  await assertDisabledChatResponse(streamMessage(
    new Request("http://localhost/api/v1/chat/reservation-sessions/chat_123/messages:stream", {
      method: "POST",
    }),
    { params: Promise.resolve({ operation: "messages:stream" }) },
  ));
});

test("POST /api/v1/chat/reservation-sessions/{id}/confirm returns chat_module_disabled", async () => {
  await assertDisabledChatResponse(confirmReservation());
});

test("/api/v1 disabled chat operation compatibility uses shared disabled response", async () => {
  const source = await readFile(
    new URL("./reservation-sessions/[id]/[operation]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /chatModuleDisabledResponse/);
  assert.doesNotMatch(source, /code: "not_found"/);
  await assertDisabledChatResponse(streamMessage(
    new Request("http://localhost/api/v1/chat/reservation-sessions/chat_123/cancel", {
      method: "POST",
    }),
    { params: Promise.resolve({ operation: "cancel" }) },
  ));
});

test("/api/v1 disabled chat source stays provider-free and route-safe", async () => {
  const sourceFiles = [
    join(apiV1Dir, "chat-disabled.ts"),
    ...(await listTypeScriptFiles(chatDir)),
  ];

  const forbiddenPatterns = [
    ["legacy chat route", /app\/api\/chat|app\\api\\chat|@\/app\/api\/chat/],
    ["LangChain route helper", /lib\/langchain|lib\\langchain|@\/lib\/langchain/],
    ["LangChain package", /@langchain\//i],
    ["LangGraph package", /langgraph/i],
    ["Google provider SDK", /@google\/generative-ai|GOOGLE_GENERATIVE_AI_API_KEY|GEMINI_API_KEY/i],
    ["OpenAI provider SDK", /@ai-sdk\/openai|@langchain\/openai|OPENROUTER_API_KEY|OPENAI_API_KEY/i],
    ["AI SDK runtime", /from\s+["']ai["']|require\(\s*["']ai["']\s*\)|@ai-sdk\//],
    ["Supabase", /supabase/i],
    ["React", /from\s+["']react["']|react-dom|lucide-react/i],
    ["frontend components", /@\/components|["']components\//],
  ] as const;

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, "utf8");
    const relativePath = relative(apiV1Dir, filePath).split(sep).join("/");

    for (const [label, pattern] of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${relativePath} references ${label}`);
    }
  }
});

async function assertDisabledChatResponse(response: Response | Promise<Response>) {
  const resolvedResponse = await response;

  assert.equal(resolvedResponse.status, 404);
  assert.deepEqual(await resolvedResponse.json(), disabledChatBody);
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [fullPath]
      : [];
  }));

  return files.flat();
}
