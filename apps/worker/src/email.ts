import nodemailer, { type Transporter } from "nodemailer";

export interface EmailJob {
  jobId: string;
  tenantId: string;
  payload: {
    kind: string;
    reservationId: string;
    recipient: string;
    locale: string;
    expectedAppointmentStart?: string;
    expectedAppointmentDate?: string;
    expectedAppointmentTime?: string;
    encryptedAction?: unknown;
  };
}

export interface SmtpPublicConfig {
  host: string;
  port: number;
  tlsMode: "required" | "starttls" | "plain";
  from: string;
  fromName?: string;
}

export interface SmtpCredential {
  username?: string;
  password?: string;
}

export interface LoadedEmailDelivery {
  subject: string;
  heading: string;
  lines: readonly string[];
  settings: SmtpPublicConfig;
  encryptedCredential?: unknown;
}

export function createEmailJobHandler(input: {
  load(job: EmailJob): Promise<LoadedEmailDelivery | undefined>;
  decrypt(envelope: unknown): SmtpCredential;
  createTransport?: (options: Record<string, unknown>) => Pick<Transporter, "sendMail" | "verify">;
}) {
  return async (job: EmailJob) => {
    const delivery = await input.load(job);
    if (!delivery) return { skipped: true as const };
    const credential = delivery.encryptedCredential === undefined
      ? {}
      : input.decrypt(delivery.encryptedCredential);
    const transport = (input.createTransport ?? ((options) => nodemailer.createTransport(options)))(
      smtpTransportOptions(delivery.settings, credential),
    );
    const result = await transport.sendMail({
      from: formatFrom(delivery.settings),
      to: job.payload.recipient,
      subject: delivery.subject,
      text: renderText(delivery.heading, delivery.lines),
      html: renderHtml(delivery.heading, delivery.lines),
    });
    return { providerMessageId: typeof result.messageId === "string" ? result.messageId : undefined };
  };
}

export async function sendSmtpTestMessage(input: {
  settings: SmtpPublicConfig;
  credential: SmtpCredential;
  recipient: string;
  createTransport?: (options: Record<string, unknown>) => Pick<Transporter, "sendMail">;
}) {
  const transport = (input.createTransport ?? ((options) => nodemailer.createTransport(options)))(
    smtpTransportOptions(input.settings, input.credential),
  );
  await transport.sendMail({
    from: formatFrom(input.settings),
    to: input.recipient,
    subject: "Reservation Platform email test",
    text: "Your SMTP email integration is working.",
    html: "<p>Your SMTP email integration is working.</p>",
  });
  return { ok: true as const };
}

export async function verifySmtpConnection(input: {
  settings: SmtpPublicConfig;
  credential: SmtpCredential;
  createTransport?: (options: Record<string, unknown>) => Pick<Transporter, "verify">;
}) {
  const transport = (input.createTransport ?? ((options) => nodemailer.createTransport(options)))(
    smtpTransportOptions(input.settings, input.credential),
  );
  await transport.verify();
  return { ok: true as const };
}

export function smtpTransportOptions(settings: SmtpPublicConfig, credential: SmtpCredential) {
  if (!settings.host.trim() || !Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65_535) {
    throw new Error("SMTP settings are invalid.");
  }
  return {
    host: settings.host.trim(),
    port: settings.port,
    secure: settings.tlsMode === "required",
    requireTLS: settings.tlsMode === "starttls",
    ignoreTLS: settings.tlsMode === "plain",
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    ...(credential.username
      ? { auth: { user: credential.username, pass: credential.password ?? "" } }
      : {}),
  };
}

function renderText(heading: string, lines: readonly string[]) {
  return [heading, "", ...lines].join("\n");
}

function renderHtml(heading: string, lines: readonly string[]) {
  return `<h1>${escapeHtml(heading)}</h1>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFrom(settings: SmtpPublicConfig) {
  return settings.fromName?.trim()
    ? { name: settings.fromName.trim(), address: settings.from }
    : settings.from;
}
