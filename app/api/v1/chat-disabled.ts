export function chatModuleDisabledResponse() {
  return Response.json({
    error: {
      code: "chat_module_disabled",
      message: "Chat module is disabled.",
      status: 404,
    },
  }, { status: 404 });
}
