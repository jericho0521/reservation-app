import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getAppUrl } from "@/lib/app-url";

const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";

export function getChatModelName(): string {
  return process.env.OPENROUTER_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

export function createOpenRouterChat(modelName?: string) {
  return new ChatOpenAI({
    model: modelName || getChatModelName(),
    temperature: 0.2,
    maxTokens: 1024,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": getAppUrl(),
      },
    },
  });
}

export function createAnalyticsChat(modelName?: string) {
  return new ChatOpenAI({
    model: modelName || "google/gemini-2.5-flash",
    temperature: 0.2,
    maxTokens: 2400,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": getAppUrl(),
      },
    },
  });
}

export function createGeminiChat(modelName?: string) {
  return new ChatGoogleGenerativeAI({
    model: modelName || "gemini-2.5-flash",
    temperature: 0.2,
    maxOutputTokens: 1024,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

export function createStructredOutputModel() {
  return new ChatOpenAI({
    model: getChatModelName(),
    temperature: 0,
    maxTokens: 2400,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": getAppUrl(),
      },
    },
  });
}
