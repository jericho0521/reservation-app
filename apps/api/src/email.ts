import nodemailer, { type Transporter } from "nodemailer";

import type { EmailConnectionTester } from "@reservation-platform/api";

export function createSmtpEmailConnectionTester(input: {
  createTransport?: (options: Record<string, unknown>) => Pick<Transporter, "sendMail">;
} = {}): EmailConnectionTester {
  return {
    async test({ settings, credential, recipient }) {
      const transport = (input.createTransport ?? ((options) => nodemailer.createTransport(options)))(
        smtpTransportOptions(settings, credential),
      );
      await transport.sendMail({
        from: formatFrom(settings),
        to: recipient,
        subject: "Reservation Platform email test",
        text: "Your SMTP email integration is working.",
        html: "<p>Your SMTP email integration is working.</p>",
      });
    },
  };
}

export function smtpTransportOptions(
  settings: Parameters<EmailConnectionTester["test"]>[0]["settings"],
  credential: Parameters<EmailConnectionTester["test"]>[0]["credential"],
) {
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

function formatFrom(settings: Parameters<EmailConnectionTester["test"]>[0]["settings"]) {
  return settings.fromName ? `"${settings.fromName.replaceAll('"', '\\"')}" <${settings.from}>` : settings.from;
}
