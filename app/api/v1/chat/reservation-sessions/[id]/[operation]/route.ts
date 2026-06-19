import { chatModuleDisabledResponse } from "../../../../chat-disabled";

type ChatOperationRouteContext = {
  params: Promise<{ operation: string }>;
};

export async function POST(
  _request: Request,
  _context: ChatOperationRouteContext,
) {
  return chatModuleDisabledResponse();
}
