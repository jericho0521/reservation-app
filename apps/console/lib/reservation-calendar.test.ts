import assert from "node:assert/strict";
import test from "node:test";
import { AppointmentCalendar } from "../components/reservations/appointment-calendar";

function text(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (typeof value === "object" && "props" in value) return text((value as { props: { children?: unknown } }).props.children);
  return "";
}

test("mixed calendars resolve appointment and capacity presentation per service", () => {
  const calendar = AppointmentCalendar({
    appointments: [
      { reservation_id: "appointment-1", service_id: "service-appointment", staff_id: "staff-1", status: "confirmed", date: "2026-07-15", start_time: "09:00", end_time: "09:30", quantity: 1, customer: { name: "Alex" } },
      { reservation_id: "archived-appointment", service_id: "archived-service", staff_id: "staff-1", status: "confirmed", date: "2026-07-15", start_time: "09:30", end_time: "10:00", quantity: 1, customer: { name: "Robin" } },
      { reservation_id: "capacity-1", service_id: "service-capacity", status: "confirmed", date: "2026-07-15", start_time: "10:00", end_time: "11:00", quantity: 4, customer: { name: "Taylor" } },
    ],
    date: "2026-07-15",
    timezone: "Asia/Kuala_Lumpur",
    practitioners: [{ id: "staff-1", label: "Morgan" }],
    services: [
      { service_id: "service-appointment", name: "Consultation", booking_mode: "appointment" },
      { service_id: "service-capacity", name: "Workshop", resource_strategy: "quantity" },
    ],
  });

  const rendered = text(calendar);
  assert.match(rendered, /Alex\s*,\s*Morgan/u);
  assert.match(rendered, /Robin\s*,\s*Morgan/u);
  assert.doesNotMatch(rendered, /Robin\s*,\s*1 seat/u);
  assert.match(rendered, /Taylor\s*,\s*4 seats/u);
  assert.doesNotMatch(rendered, /Taylor\s*,\s*Any available practitioner/u);
});
