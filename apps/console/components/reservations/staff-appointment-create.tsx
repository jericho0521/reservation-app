"use client";

import type { ResourceResponse, ServiceResponse } from "@reservation-platform/sdk";
import { useActionState, useEffect, useState } from "react";
import { createStaffAppointmentAction, type AppointmentActionState } from "../../app/reservations/actions";
import { availabilitySlotSupportsResources, requiresOwnerResourceSelection } from "../../lib/reservation-resource-selection";
import { practitionersForService, type PractitionerOption } from "../../lib/practitioner-options";

const initialState: AppointmentActionState = { status: "idle", message: "" };
type OwnerAvailabilitySlot = { start_time?: string; end_time?: string; start_at?: string; end_at?: string; available_quantity: number; is_available: boolean; taken_resource_labels?: string[]; maintenance_resource_labels?: string[] };

export function StaffAppointmentCreate({
  date,
  services,
  resources,
  practitioners,
}: {
  date: string;
  services: ServiceResponse[];
  resources: ResourceResponse[];
  practitioners: PractitionerOption[];
}) {
  const [state, action, pending] = useActionState(createStaffAppointmentAction, initialState);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [bookingDate, setBookingDate] = useState(date);
  const [quantity, setQuantity] = useState(1);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<OwnerAvailabilitySlot[]>([]);
  const [availabilityState, setAvailabilityState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const selectedService = services.find((service) => service.service_id === serviceId);
  const appointment = selectedService?.booking_mode === "appointment";
  const servicePractitioners = practitionersForService(practitioners, serviceId);
  const requiresResources = requiresOwnerResourceSelection(selectedService);
  const serviceResources = resources.filter((resource) => (
    resource.is_active && resource.service_id === selectedService?.service_id
  ));
  const singleResource = selectedService?.resource_strategy === "hybrid"
    || selectedService?.resource_kind === "room";
  const selectedCapacity = serviceResources
    .filter((resource) => selectedResourceIds.includes(resource.resource_id))
    .reduce((sum, resource) => sum + Math.max(1, resource.capacity ?? 1), 0);
  const maximumQuantity = requiresResources
    ? Math.max(1, selectedCapacity || serviceResources.reduce((sum, resource) => sum + Math.max(1, resource.capacity ?? 1), 0))
    : selectedService?.total_quantity ?? 10000;
  const availableSlots = slots.filter((slot) => (
    !requiresResources || availabilitySlotSupportsResources(slot, serviceResources, selectedResourceIds)
  ));
  useEffect(() => {
    if (!selectedService || appointment || !bookingDate || quantity < 1) {
      setSlots([]);
      setAvailabilityState("idle");
      return;
    }
    const controller = new AbortController();
    setAvailabilityState("loading");
    const query = new URLSearchParams({ service_id: selectedService.service_id, date: bookingDate, quantity: String(quantity) });
    void fetch(`/admin/api/availability?${query.toString()}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json() as { slots?: OwnerAvailabilitySlot[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Availability could not be loaded.");
        setSlots((payload.slots ?? []).filter((slot) => slot.is_available && slot.available_quantity >= quantity && Boolean(slotTime(slot))));
        setAvailabilityState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSlots([]);
        setAvailabilityState("error");
      });
    return () => controller.abort();
  }, [appointment, bookingDate, quantity, selectedService]);

  return <section className="panel">
    <span className="eyebrow">Owner reservation</span>
    <h2>Create a reservation</h2>
    <p>This uses the same availability and conflict checks as customer bookings.</p>
    <form action={action} className="studio-form">
      <div className="form-columns"><label>Service<select name="service_id" required value={serviceId} onChange={(event) => { setServiceId(event.target.value); setStaffId(""); setSelectedResourceIds([]); }}><option value="" disabled>Choose a service</option>{services.map((service) => <option key={service.service_id} value={service.service_id}>{service.name}</option>)}</select></label>{appointment ? <label>Practitioner<select name="staff_id" required value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="" disabled>{servicePractitioners.length > 0 ? "Choose a practitioner" : "No practitioners for this service"}</option>{servicePractitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.label}</option>)}</select></label> : <label>Seats<input name="quantity" type="number" min={1} max={maximumQuantity} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></label>}</div>
      {requiresResources ? <fieldset className="resource-choice-fieldset"><legend>{singleResource ? "Resource" : "Resources"}</legend>{serviceResources.length > 0 ? <div className="resource-choice-list">{serviceResources.map((resource) => <label key={resource.resource_id}><input name="resource_ids" type={singleResource ? "radio" : "checkbox"} value={resource.resource_id} checked={selectedResourceIds.includes(resource.resource_id)} onChange={(event) => setSelectedResourceIds((current) => singleResource
          ? (event.target.checked ? [resource.resource_id] : [])
          : event.target.checked ? [...current, resource.resource_id] : current.filter((id) => id !== resource.resource_id))} /> <span>{resource.label}</span><small>{Math.max(1, resource.capacity ?? 1)} seat{Math.max(1, resource.capacity ?? 1) === 1 ? "" : "s"}</small></label>)}</div> : <p className="form-message error">No active resources are configured for this service.</p>}<span className="field-hint">Choose resources with enough combined capacity for the requested seats.</span></fieldset> : null}
      {appointment ? <input name="quantity" type="hidden" value="1" /> : null}
      <div className="form-columns"><label>Date<input type="date" name="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} required /></label>{appointment ? <label>Start time<input type="time" name="start_time" required /></label> : <label>Available time<select name="start_time" required defaultValue="" key={`${serviceId}:${bookingDate}:${quantity}:${selectedResourceIds.join(",")}`} disabled={availabilityState !== "ready" || availableSlots.length === 0}><option value="" disabled>{availabilityOptionLabel(availabilityState, availableSlots.length)}</option>{availableSlots.map((slot) => <option key={`${slotTime(slot)}:${slotEndTime(slot)}`} value={slotTime(slot)}>{slotTime(slot)} to {slotEndTime(slot)} ({slot.available_quantity} seats left)</option>)}</select><span className="field-hint" aria-live="polite">{availabilityHint(availabilityState, availableSlots.length)}</span></label>}</div>
      <div className="form-columns"><label>Customer name<input name="customer_name" required /></label><label>Customer email<input name="customer_email" type="email" required /></label></div>
      <label>Customer phone (optional)<input name="customer_phone" type="tel" /></label>
      <button className="primary-action" type="submit" disabled={pending || services.length === 0 || !selectedService || (appointment && servicePractitioners.length === 0) || (requiresResources && (selectedResourceIds.length === 0 || selectedCapacity < quantity)) || (!appointment && (availabilityState !== "ready" || availableSlots.length === 0))}>{pending ? "Creating..." : "Create reservation"}</button>
      {state.status === "idle" ? null : <p className={`form-message ${state.status}`}>{state.message}</p>}
    </form>
  </section>;
}

function slotTime(slot: OwnerAvailabilitySlot) {
  return slot.start_time?.slice(0, 5) ?? /T(\d{2}:\d{2})/u.exec(slot.start_at ?? "")?.[1] ?? "";
}

function slotEndTime(slot: OwnerAvailabilitySlot) {
  return slot.end_time?.slice(0, 5) ?? /T(\d{2}:\d{2})/u.exec(slot.end_at ?? "")?.[1] ?? "";
}

function availabilityOptionLabel(state: "idle" | "loading" | "ready" | "error", count: number) {
  if (state === "loading") return "Loading live availability...";
  if (state === "error") return "Availability could not be loaded";
  if (state === "ready" && count === 0) return "No times have enough seats";
  return count > 0 ? "Choose an available time" : "Choose a service first";
}

function availabilityHint(state: "idle" | "loading" | "ready" | "error", count: number) {
  if (state === "loading") return "Checking reservations, operating hours, and maintenance.";
  if (state === "error") return "Change the date or service to retry.";
  if (state === "ready" && count === 0) return "No live slot can hold the requested number of seats.";
  return count > 0 ? "Only slots with enough remaining seats are shown." : "Availability will load after a service is selected.";
}
