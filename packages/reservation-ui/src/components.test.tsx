import assert from "node:assert/strict";
import test from "node:test";

import type { AvailabilitySlot, ResourceResponse } from "@reservation-platform/contract-types";

import {
  AvailabilityTimeline,
  BookingFlow,
  BookingSetupError,
  DatePicker,
  ReservationError,
  ReservationSuccess,
  ResourceSelector,
  getBookingControlVisibility,
  filterBookingServices,
  shouldSyncQuantityToSelectedResources,
  ExperiencePreview,
} from "./components.js";
import { BookingStepActions, BookingStepProgress } from "./booking/journey.js";
import { createBookingFlowConfig, createExperiencePreviewConfig } from "./config.js";
import { defaultThemeClasses } from "./types.js";

function childrenOf(node: unknown): unknown[] {
  if (!node || typeof node !== "object" || !("props" in node)) {
    return [];
  }
  const children = (node as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(children) ? children : [children];
}

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(flattenText).join("");
  }
  return childrenOf(node).map(flattenText).join("");
}

function collectProps<T>(node: unknown, predicate: (props: Record<string, unknown>) => T | undefined): T[] {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node !== "object") {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectProps(child, predicate));
  }

  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  const current = predicate(props);
  return [
    ...(current === undefined ? [] : [current]),
    ...childrenOf(node).flatMap((child) => collectProps(child, predicate)),
  ];
}

test("AvailabilityTimeline explains unavailable slots", () => {
  const slots: AvailabilitySlot[] = [
    { start_time: "09:00", end_time: "10:00", available_quantity: 1, is_available: true },
  ];

  const element = AvailabilityTimeline({
    label: "Time",
    slots,
    quantity: 2,
    onSelect: () => undefined,
  });

  assert.match(flattenText(element), /Only 1 left/);
  assert.equal(collectProps(element, (props) => props.disabled === true ? true : undefined).length, 1);
});

test("AvailabilityTimeline distinguishes fully booked from a closed date", () => {
  const fullyBooked = AvailabilityTimeline({
    label: "Time",
    slots: [{ start_time: "09:00", end_time: "10:00", available_quantity: 0, is_available: false }],
    quantity: 1,
    onSelect: () => undefined,
  });
  const closed = AvailabilityTimeline({
    label: "Time",
    slots: [],
    quantity: 1,
    onSelect: () => undefined,
  });

  assert.match(flattenText(fullyBooked), /Fully booked/);
  assert.match(flattenText(closed), /business may be closed/);
  assert.match(flattenText(closed), /Choose another date/);
});

test("DatePicker associates its visible caption with the date input", () => {
  const element = DatePicker({ label: "Date", value: "2026-07-13", onChange: () => undefined });
  assert.equal((element as { type?: unknown }).type, "label");
  assert.match(flattenText(element), /Date/u);
});

test("AvailabilityTimeline shows loading before empty availability", () => {
  const element = AvailabilityTimeline({
    label: "Time",
    slots: [],
    quantity: 1,
    loading: true,
    onSelect: () => undefined,
  });

  assert.match(flattenText(element), /Loading availability/);
  assert.doesNotMatch(flattenText(element), /No slots available/);
});

test("ResourceSelector marks unavailable resources and preserves selected theme classes", () => {
  const resources: ResourceResponse[] = [
    { resource_id: "res_1", label: "A1", is_active: true },
    { resource_id: "res_2", label: "A2", is_active: true },
  ];

  const element = ResourceSelector({
    label: "Seat",
    resources,
    selectedResourceIds: new Set(["res_2"]),
    unavailableResourceLabels: ["A1"],
    onToggle: () => undefined,
    theme: { ...defaultThemeClasses, selected: "custom-selected" },
  });
  const classNames = collectProps(element, (props) => (
    typeof props.className === "string" ? props.className : undefined
  ));

  assert.match(flattenText(element), /Unavailable/);
  assert.ok(classNames.some((className) => className.includes("custom-selected")));
});

test("ResourceSelector disables rooms below the requested attendee capacity", () => {
  const element = ResourceSelector({
    label: "Room",
    resources: [
      { resource_id: "room_1", label: "Focus room", kind: "room", is_active: true, capacity: 4 },
      { resource_id: "room_2", label: "Boardroom", kind: "room", is_active: true, capacity: 10 },
    ],
    selectedResourceIds: new Set(),
    minimumCapacity: 6,
    onToggle: () => undefined,
    theme: defaultThemeClasses,
  });
  assert.match(flattenText(element), /Up to 4/u);
  assert.equal(collectProps(element, (props) => props.disabled === true ? true : undefined).length, 1);
});

test("ReservationError renders a safe fallback message", () => {
  const element = ReservationError({});

  assert.match(flattenText(element), /Reservation request failed/);
});

test("BookingFlow renders setup guidance when config is incomplete", () => {
  const element = BookingFlow(createBookingFlowConfig({
    apiBaseUrl: "",
    serviceId: "",
  }).booking);

  assert.equal((element as { type?: unknown }).type, BookingSetupError);
});

test("BookingSetupError explains missing backend configuration", () => {
  const element = BookingSetupError({
    title: "Reservation backend configuration required",
    message: "Set the backend base URL and service id.",
  });

  assert.match(flattenText(element), /backend configuration required/i);
});

test("getBookingControlVisibility keeps quantity services as capacity booking", () => {
  assert.deepEqual(getBookingControlVisibility("quantity", 3), {
    showResourceSelector: false,
    showQuantitySelector: true,
  });
});

test("getBookingControlVisibility uses resources for assigned-resource services", () => {
  assert.deepEqual(getBookingControlVisibility("assigned_resource", 3), {
    showResourceSelector: true,
    showQuantitySelector: false,
  });
});

test("getBookingControlVisibility supports hybrid services with both controls", () => {
  assert.deepEqual(getBookingControlVisibility("hybrid", 3), {
    showResourceSelector: true,
    showQuantitySelector: true,
  });
});

test("shouldSyncQuantityToSelectedResources only syncs assigned-resource bookings", () => {
  assert.equal(shouldSyncQuantityToSelectedResources("assigned_resource"), true);
  assert.equal(shouldSyncQuantityToSelectedResources("hybrid"), false);
  assert.equal(shouldSyncQuantityToSelectedResources("quantity"), false);
});

test("ExperiencePreview renders draft branding, terminology, channels, and services", () => {
  const element = ExperiencePreview(createExperiencePreviewConfig({
    preset_id: "racing_gaming",
    branding: { brand_name: "Apex Racing", primary_color: "#f59e0b" },
    terminology: { customer: "Driver", resource: "Simulator", booking: "Session" },
    channels: { web_booking: true, web_chat: true, whatsapp: false },
  }, [{ service_id: "service_1", name: "Sprint Session", duration_minutes: 60 }]));

  assert.match(flattenText(element), /Apex Racing/);
  assert.match(flattenText(element), /AI chat/);
  assert.match(flattenText(element), /Sprint Session/);
  assert.match(flattenText(element), /Continue to Session/);
  assert.doesNotMatch(flattenText(element), /WhatsApp/);
});

test("booking progress exposes the guided service-to-review sequence", () => {
  const element = BookingStepProgress({ step: "details" });
  assert.match(flattenText(element), /Service.*Date.*Time.*Options.*Details.*Review/u);
  assert.equal(element.props.tabIndex, 0);
  assert.equal(collectProps(element, (props) => props["aria-current"] === "step" ? true : undefined).length, 1);
});

test("appointment progress uses the fixed practitioner booking sequence", () => {
  const element = BookingStepProgress({ step: "practitioner", appointment: true });
  assert.match(flattenText(element), /Service.*Practitioner.*Date.*Time.*Details.*Review/u);
  assert.doesNotMatch(flattenText(element), /Options/u);
  assert.equal(collectProps(element, (props) => props["aria-current"] === "step" ? true : undefined).length, 1);
});

test("booking step actions keep confirmation disabled until review is valid", () => {
  const element = BookingStepActions({
    canContinue: false,
    canGoBack: true,
    continueLabel: "Confirm reservation",
    onBack: () => undefined,
    onContinue: () => undefined,
  });
  assert.match(flattenText(element), /Confirm reservation/u);
  assert.equal(collectProps(element, (props) => props.disabled === true ? true : undefined).length, 1);
});

test("service search matches names and descriptions with a useful empty result", () => {
  const services = [
    { service_id: "one", name: "Boardroom", description: "Video conferencing" },
    { service_id: "two", name: "Focus room", description: "Quiet work" },
  ];
  assert.deepEqual(filterBookingServices(services, "video"), [services[0]]);
  assert.deepEqual(filterBookingServices(services, "missing"), []);
  assert.deepEqual(filterBookingServices(services, "  "), services);
});

test("reservation success exposes the opaque management link when issued", () => {
  const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
  const element = ReservationSuccess({
    reservation: { reservation_id: "reservation_1", management_token: token },
    managementBasePath: "/luma-studio/manage",
  });
  const hrefs = collectProps(element, (props) => typeof props.href === "string" ? props.href : undefined);
  assert.deepEqual(hrefs, [`/luma-studio/manage/${token}`]);
});
