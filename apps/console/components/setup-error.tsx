export function SetupError({ message }: { message: string }) {
  return (
    <section className="setup-error" role="alert">
      <span className="eyebrow">Setup required</span>
      <h1>Connect the owner console</h1>
      <p>{message}</p>
      <p className="muted">
        Configure the server-only platform URL, service key, tenant, and venue values, then restart
        the console.
      </p>
    </section>
  );
}

export function safeSetupErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/server-secret|Bearer\s+\S+/giu, "[redacted]")
    : "The platform workspace could not be loaded.";
}
