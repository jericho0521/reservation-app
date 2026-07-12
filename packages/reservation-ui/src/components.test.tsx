import assert from "node:assert/strict";
import test from "node:test";

import type { AvailabilitySlot, ResourceResponse } from "@reservation-platform/contract-types";

import {
  AvailabilityTimeline,
  BookingFlow,
  BookingSetupError,
  ReservationError,
  ResourceSelector,
  getBookingControlVisibility,
  shouldSyncQuantityToSelectedResources,
  ExperiencePreview,
} from "./components.js";
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

  assert.match(flattenText(element), /Sold Out/);
  assert.equal(collectProps(element, (props) => props.disabled === true ? true : undefined).length, 1);
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
