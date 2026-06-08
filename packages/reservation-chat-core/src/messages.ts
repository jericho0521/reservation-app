import type { ChatAction, CustomChatAction } from "./actions.js";

export interface SerializableChatMessage<TCustomAction extends CustomChatAction = never> {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  action?: ChatAction<TCustomAction>;
}

export interface ChatCoreResult<TCustomAction extends CustomChatAction = never> {
  content: string;
  action: ChatAction<TCustomAction> | null;
}
