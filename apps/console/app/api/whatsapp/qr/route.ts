import { isPlatformError } from "@reservation-platform/sdk";
import { NextResponse } from "next/server";
import { createConsolePlatformClient } from "../../../../lib/platform-client";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};

export async function GET() {
  try {
    const session = await createConsolePlatformClient().getWhatsAppSessionQr({ headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ status: session.status, qr_code: session.qr_code, updated_at: session.updated_at }, { headers: privateHeaders });
  } catch (error) {
    const status = isPlatformError(error) && error.body.status >= 400 && error.body.status < 500 ? error.body.status : 502;
    return NextResponse.json({ error: status === 404 ? "A pairing code is not available yet." : "WhatsApp pairing is temporarily unavailable." }, { status, headers: privateHeaders });
  }
}
