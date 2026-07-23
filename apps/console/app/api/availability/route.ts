import { isPlatformError } from "@reservation-platform/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createConsolePlatformClient } from "../../../lib/platform-client";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};

export async function GET(request: NextRequest) {
  const serviceId = request.nextUrl.searchParams.get("service_id")?.trim() ?? "";
  const date = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  const quantity = Number(request.nextUrl.searchParams.get("quantity") ?? "1");
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Choose a service, date, and valid seat quantity." }, { status: 400, headers: privateHeaders });
  }

  try {
    const availability = await createConsolePlatformClient().listAvailability({ service_id: serviceId, date, quantity });
    return NextResponse.json({
      slots: availability.slots.map((slot) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        start_at: slot.start_at,
        end_at: slot.end_at,
        available_quantity: slot.available_quantity,
        is_available: slot.is_available,
        taken_resource_labels: slot.taken_resource_labels,
        maintenance_resource_labels: slot.maintenance_resource_labels,
      })),
    }, { headers: privateHeaders });
  } catch (error) {
    const status = isPlatformError(error) && error.body.status >= 400 && error.body.status < 500 ? error.body.status : 502;
    return NextResponse.json({ error: "Live availability could not be loaded. Try again." }, { status, headers: privateHeaders });
  }
}
