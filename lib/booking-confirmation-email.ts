import { Resend } from "resend";

export interface BookingConfirmationDetails {
  bookingId: string;
  interfaceType: "form" | "chat";
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  seatsBooked: number;
  seatLabels?: string[];
}

export interface BookingEmailMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  tags: Array<{ name: string; value: string }>;
}

export interface BookingEmailTransport {
  send(
    message: BookingEmailMessage,
    options: { idempotencyKey: string },
  ): Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>;
}

interface BookingEmailEnvironment {
  BOOKING_EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
}

interface SendBookingConfirmationOptions {
  env?: BookingEmailEnvironment;
  transport?: BookingEmailTransport;
  logger?: Pick<Console, "error">;
}

export interface BookingConfirmationResult {
  sent: boolean;
  emailId?: string;
  error?: string;
}

const VENUE_ADDRESS =
  "Project Play By CW, 70, Jalan PJS 11/7, Bandar Sunway, 47500 Subang Jaya, Selangor";
const VENUE_PHONE = "+60 11-1628 1524";
const VENUE_WEBSITE = "https://ppbycw.com";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function detailRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:8px 0;color:#64748b;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

export function renderBookingConfirmationEmail(details: BookingConfirmationDetails) {
  const seatLabels = details.seatLabels?.filter(Boolean) ?? [];
  const seatDescription = seatLabels.length > 0
    ? `${details.seatsBooked} (${seatLabels.join(", ")})`
    : String(details.seatsBooked);
  const subject = `Booking confirmed — ${details.serviceName} on ${details.bookingDate}`;
  const rows = [
    detailRow("Booking reference", details.bookingId),
    detailRow("Service", details.serviceName),
    detailRow("Date", details.bookingDate),
    detailRow("Time", `${details.startTime}–${details.endTime} Malaysia time`),
    detailRow("Seats", seatDescription),
    detailRow("Name", details.customerName),
    ...(details.customerPhone ? [detailRow("Phone", details.customerPhone)] : []),
  ].join("");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <div style="overflow:hidden;border:1px solid #dbe4ea;border-radius:16px;background:#ffffff;">
        <div style="background:#0a1628;padding:28px 24px;text-align:center;">
          <p style="margin:0 0 8px;color:#b9d9cf;font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Project Play by CW</p>
          <h1 style="margin:0;color:#ffffff;font-size:26px;">Booking confirmed</h1>
        </div>
        <div style="padding:28px 24px;">
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Hi ${escapeHtml(details.customerName)}, your session is confirmed. We look forward to seeing you.</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">${rows}
          </table>
          <div style="margin-top:24px;padding:16px;border-radius:10px;background:#f8fafc;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;">Venue</p>
            <p style="margin:0;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(VENUE_ADDRESS)}</p>
          </div>
          <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6;">Need help? Call ${escapeHtml(VENUE_PHONE)} or visit <a href="${VENUE_WEBSITE}" style="color:#0f766e;">${VENUE_WEBSITE}</a>.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `Hi ${details.customerName}, your Project Play by CW booking is confirmed.`,
    "",
    `Booking reference: ${details.bookingId}`,
    `Service: ${details.serviceName}`,
    `Date: ${details.bookingDate}`,
    `Time: ${details.startTime}–${details.endTime} Malaysia time`,
    `Seats: ${seatDescription}`,
    `Name: ${details.customerName}`,
    ...(details.customerPhone ? [`Phone: ${details.customerPhone}`] : []),
    "",
    `Venue: ${VENUE_ADDRESS}`,
    `Help: ${VENUE_PHONE} | ${VENUE_WEBSITE}`,
  ].join("\n");

  return { subject, html, text };
}

function createResendTransport(apiKey: string): BookingEmailTransport {
  const resend = new Resend(apiKey);

  return {
    async send(message, options) {
      return resend.emails.send(message, options);
    },
  };
}

export async function sendBookingConfirmationEmail(
  details: BookingConfirmationDetails,
  options: SendBookingConfirmationOptions = {},
): Promise<BookingConfirmationResult> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const from = env.BOOKING_EMAIL_FROM?.trim();
  const apiKey = env.RESEND_API_KEY?.trim();

  if (!from || (!apiKey && !options.transport)) {
    const error = !from ? "Missing BOOKING_EMAIL_FROM" : "Missing RESEND_API_KEY";
    logger.error("Booking confirmation email configuration error", {
      bookingId: details.bookingId,
      interfaceType: details.interfaceType,
      error,
    });
    return { sent: false, error };
  }

  const transport = options.transport ?? createResendTransport(apiKey as string);
  const content = renderBookingConfirmationEmail(details);

  try {
    const { data, error } = await transport.send(
      {
        from,
        to: [details.customerEmail],
        subject: content.subject,
        html: content.html,
        text: content.text,
        tags: [
          { name: "booking_id", value: details.bookingId },
          { name: "interface", value: details.interfaceType },
        ],
      },
      { idempotencyKey: `booking-confirmation/${details.bookingId}` },
    );

    if (error || !data?.id) {
      const message = error?.message ?? "Resend returned no email ID";
      logger.error("Booking confirmation email delivery failed", {
        bookingId: details.bookingId,
        interfaceType: details.interfaceType,
        error: message,
      });
      return { sent: false, error: message };
    }

    return { sent: true, emailId: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Booking confirmation email delivery failed", {
      bookingId: details.bookingId,
      interfaceType: details.interfaceType,
      error: message,
    });
    return { sent: false, error: message };
  }
}
