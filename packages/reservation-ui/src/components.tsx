import type {
  AvailabilitySlot,
  CustomerSnapshot,
  ResourceResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";
import {
  ReservationProvider,
  getServiceStrategy,
  getSlotEnd,
  getSlotStart,
  useBookingFlow,
  useServices,
  type BookingStrategy,
  type BookingFlowState,
} from "@reservation-platform/react";
import { useState, type ReactNode } from "react";

import { cn } from "./class-names.js";
import {
  defaultBookingLabels,
  defaultThemeClasses,
  type BookingLabels,
  type ThemeClasses,
} from "./types.js";

export interface BookingFlowProps {
  serviceId: string;
  baseUrl?: string;
  labels?: Partial<BookingLabels>;
  theme?: ThemeClasses;
  className?: string;
  initialDate?: string;
  initialQuantity?: number;
}

function mergeLabels(labels?: Partial<BookingLabels>): BookingLabels {
  return { ...defaultBookingLabels, ...labels };
}

function mergeTheme(theme?: ThemeClasses): Required<ThemeClasses> {
  return {
    brandName: theme?.brandName ?? defaultThemeClasses.brandName,
    shell: cn(defaultThemeClasses.shell, theme?.shell),
    panel: cn(defaultThemeClasses.panel, theme?.panel),
    button: cn(defaultThemeClasses.button, theme?.button),
    buttonDisabled: cn(defaultThemeClasses.buttonDisabled, theme?.buttonDisabled),
    input: cn(defaultThemeClasses.input, theme?.input),
    selected: cn(defaultThemeClasses.selected, theme?.selected),
    muted: cn(defaultThemeClasses.muted, theme?.muted),
    error: cn(defaultThemeClasses.error, theme?.error),
    success: cn(defaultThemeClasses.success, theme?.success),
  };
}

export function getBookingControlVisibility(strategy: BookingStrategy, resourceCount: number) {
  const hasResources = resourceCount > 0;
  return {
    showResourceSelector: hasResources && (strategy === "assigned_resource" || strategy === "hybrid"),
    showQuantitySelector: strategy !== "assigned_resource",
  };
}

export function shouldSyncQuantityToSelectedResources(strategy: BookingStrategy) {
  return strategy === "assigned_resource";
}

export function BookingFlow({
  baseUrl,
  serviceId,
  labels,
  theme,
  className,
  initialDate,
  initialQuantity,
}: BookingFlowProps) {
  const content = (
    <BookingFlowInner
      serviceId={serviceId}
      labels={labels}
      theme={theme}
      className={className}
      initialDate={initialDate}
      initialQuantity={initialQuantity}
    />
  );

  return baseUrl ? <ReservationProvider baseUrl={baseUrl}>{content}</ReservationProvider> : content;
}

function BookingFlowInner({
  serviceId,
  labels,
  theme,
  className,
  initialDate,
  initialQuantity,
}: Omit<BookingFlowProps, "baseUrl">) {
  const mergedLabels = mergeLabels(labels);
  const mergedTheme = mergeTheme(theme);
  const flow = useBookingFlow({ serviceId, initialDate, initialQuantity });
  const [submitError, setSubmitError] = useState<string>();

  const resources = flow.state.availability?.resources ?? [];
  const slots = flow.state.availability?.slots ?? [];
  const selectedResourceIds = new Set(flow.state.selectedResourceIds);
  const bookingStrategy = getServiceStrategy(flow.state.service);
  const controlVisibility = getBookingControlVisibility(
    bookingStrategy,
    resources.length,
  );

  async function submit() {
    setSubmitError(undefined);
    try {
      await flow.actions.submit();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className={cn(mergedTheme.shell, className)}>
      {/* Header Block */}
      <div className="rp-header flex flex-col md:flex-row md:items-baseline justify-between border-b border-black dark:border-neutral-800 pb-6 mb-8 gap-4">
        <div>
          <div className="rp-kicker-row flex items-center gap-2">
            <span className="rp-live-dot inline-block w-1.5 h-1.5 bg-red-600 rounded-none animate-pulse"></span>
            <p className="rp-kicker text-[10px] font-bold uppercase tracking-widest font-mono text-neutral-500">
              {mergedTheme.brandName} // Live
            </p>
          </div>
          <h2 className="rp-title text-3xl font-extrabold tracking-tighter uppercase mt-1">
            {flow.state.service?.name ?? "Booking Flow"}
          </h2>
          <p className={cn("rp-description mt-1 text-sm text-neutral-500 max-w-[65ch]")}>
            {flow.state.service?.description ?? "Live booking interface powered by the backend API."}
          </p>
        </div>
        {flow.state.service?.service_id && (
          <div className="rp-service-ref font-mono text-[9px] text-neutral-400 uppercase tracking-wider md:text-right">
            Service Ref: {flow.state.service.service_id.slice(0, 8)}
          </div>
        )}
      </div>

      <div className="rp-layout grid gap-8 md:grid-cols-[1.5fr_1fr]">
        <div className="rp-main grid gap-6 md:pr-8 md:border-r border-neutral-200 dark:border-neutral-800">
          <DatePicker
            label={mergedLabels.date}
            value={flow.state.date}
            onChange={flow.actions.setDate}
            className={mergedTheme.input}
          />

          <AvailabilityTimeline
            label={mergedLabels.time}
            slots={slots}
            selectedSlot={flow.state.selectedSlot}
            quantity={flow.state.quantity}
            loading={flow.availability.loading}
            onSelect={flow.actions.setSelectedSlot}
          />

          {controlVisibility.showResourceSelector ? (
            <ResourceSelector
              label={mergedLabels.resource}
              resources={resources}
              selectedResourceIds={selectedResourceIds}
              unavailableResourceLabels={[
                ...(flow.state.selectedSlot?.taken_resource_labels ?? []),
                ...(flow.state.selectedSlot?.maintenance_resource_labels ?? []),
              ]}
              onToggle={(resource) => {
                const selected = resources.filter((candidate) => selectedResourceIds.has(candidate.resource_id));
                const next = selectedResourceIds.has(resource.resource_id)
                  ? selected.filter((candidate) => candidate.resource_id !== resource.resource_id)
                  : [...selected, resource];
                flow.actions.setSelectedResources(next);
                if (shouldSyncQuantityToSelectedResources(bookingStrategy)) {
                  flow.actions.setQuantity(Math.max(1, next.length));
                }
              }}
              theme={mergedTheme}
            />
          ) : null}

          {controlVisibility.showQuantitySelector ? (
            <QuantitySelector
              label={mergedLabels.quantity}
              value={flow.state.quantity}
              onChange={flow.actions.setQuantity}
              className={mergedTheme.input}
            />
          ) : null}

          <CustomerForm
            labels={mergedLabels}
            customer={flow.state.customer}
            purpose={flow.state.purpose}
            inputClassName={mergedTheme.input}
            onCustomerChange={flow.actions.setCustomer}
            onPurposeChange={flow.actions.setPurpose}
          />
        </div>

        <div className="rp-sidebar flex flex-col gap-6">
          <BookingSummary
            labels={mergedLabels}
            service={flow.state.service}
            state={flow.state}
            panelClassName={mergedTheme.panel}
          />
          {flow.state.reservation ? (
            <ReservationSuccess reservationId={flow.state.reservation.reservation_id} className={mergedTheme.success} />
          ) : null}
          {flow.service.error || flow.availability.error || submitError ? (
            <ReservationError
              message={flow.service.error?.message ?? flow.availability.error?.message ?? submitError}
              className={mergedTheme.error}
            />
          ) : null}
          <button
            type="button"
            className={flow.validation.isValid ? mergedTheme.button : mergedTheme.buttonDisabled}
            disabled={!flow.validation.isValid}
            onClick={() => void submit()}
          >
            {flow.validation.submitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ServicePicker({
  onSelect,
  className,
}: {
  onSelect: (service: ServiceResponse) => void;
  className?: string;
}) {
  const services = useServices();
  return (
    <div className={cn("rp-service-picker grid gap-3", className)}>
      {(services.data ?? []).map((service) => (
        <button
          key={service.service_id}
          type="button"
          className="rp-service-card border border-black bg-neutral-50 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-slate-900 dark:hover:bg-slate-800 p-6 text-left transition-all duration-150 rounded-none flex flex-col gap-2 focus:ring-1 focus:ring-black dark:focus:ring-white"
          onClick={() => onSelect(service)}
        >
          <div className="rp-service-card-header flex justify-between items-baseline w-full">
            <span className="rp-service-card-title text-lg font-bold uppercase tracking-tight">{service.name}</span>
            {service.duration_minutes && (
              <span className="rp-service-card-duration font-mono text-xs text-neutral-500">{service.duration_minutes} MIN</span>
            )}
          </div>
          {service.description ? (
            <p className="rp-service-card-description text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
              {service.description}
            </p>
          ) : null}
          <span className="rp-service-card-action text-[10px] font-bold uppercase tracking-widest text-black dark:text-white mt-2">
            Select Service &rarr;
          </span>
        </button>
      ))}
    </div>
  );
}

export function DatePicker({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className="rp-field grid gap-1.5">
      <span className="rp-field-label text-[11px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
        01 / {label}
      </span>
      <input
        type="date"
        value={value}
        className={cn(className, "focus:ring-1 focus:ring-black dark:focus:ring-white")}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

export function AvailabilityTimeline({
  label,
  slots,
  selectedSlot,
  quantity,
  loading = false,
  onSelect,
}: {
  label: string;
  slots: AvailabilitySlot[];
  selectedSlot?: AvailabilitySlot;
  quantity: number;
  loading?: boolean;
  onSelect: (slot: AvailabilitySlot) => void;
}) {
  return (
    <div className="rp-field grid gap-2">
      <span className="rp-field-label text-[11px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
        02 / {label}
      </span>
      {loading ? (
        <div className="rp-loading-state border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-xs font-mono text-neutral-500 rounded-none">
          Loading availability...
        </div>
      ) : slots.length === 0 ? (
        <div className="rp-empty-state border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-xs font-mono text-neutral-500 rounded-none">
          No slots available for the selected date.
        </div>
      ) : (
        <div className="rp-slot-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.map((slot) => {
            const start = getSlotStart(slot);
            const end = getSlotEnd(slot);
            const selected = start === getSlotStart(selectedSlot) && end === getSlotEnd(selectedSlot);
            const disabled = !slot.is_available || slot.available_quantity < quantity;
            return (
              <button
                key={`${start}-${end}`}
                type="button"
                disabled={disabled}
                className={cn(
                  "rp-slot border p-3 text-left font-mono transition-all duration-150 rounded-none flex flex-col justify-between min-h-[64px]",
                  selected
                    ? "rp-slot-selected bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                    : "rp-slot-available bg-white text-slate-900 border-neutral-300 hover:border-black dark:bg-slate-950 dark:text-slate-50 dark:border-neutral-800 dark:hover:border-white",
                  disabled && "rp-slot-disabled cursor-not-allowed bg-neutral-50 text-neutral-400 border-neutral-200 dark:bg-slate-900 dark:text-slate-600 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-800",
                )}
                onClick={() => onSelect(slot)}
              >
                <span className="rp-slot-time text-sm font-bold tracking-tight">{start}</span>
                <span className="rp-slot-meta text-[9px] uppercase tracking-wider opacity-60 mt-1">
                  {disabled ? "Sold Out" : `${slot.available_quantity} left`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function QuantitySelector({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <div className="rp-field grid gap-1.5">
      <span className="rp-field-label text-[11px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
        03 / {label}
      </span>
      <input
        type="number"
        min={1}
        value={value}
        className={cn(className, "focus:ring-1 focus:ring-black dark:focus:ring-white")}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

export function ResourceSelector({
  label,
  resources,
  selectedResourceIds,
  unavailableResourceLabels = [],
  onToggle,
  theme,
}: {
  label: string;
  resources: ResourceResponse[];
  selectedResourceIds: Set<string>;
  unavailableResourceLabels?: string[];
  onToggle: (resource: ResourceResponse) => void;
  theme: Required<ThemeClasses>;
}) {
  const unavailable = new Set(unavailableResourceLabels);
  return (
    <div className="rp-field grid gap-2">
      <span className="rp-field-label text-[11px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
        03 / {label}
      </span>
      <div className="rp-resource-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
        {resources.map((resource) => {
          const disabled = unavailable.has(resource.label) || !resource.is_active;
          const isSelected = selectedResourceIds.has(resource.resource_id);
          return (
            <button
              key={resource.resource_id}
              type="button"
              disabled={disabled}
              className={cn(
                "rp-resource border p-3 text-left font-mono transition-all duration-150 rounded-none flex flex-col justify-between min-h-[64px]",
                isSelected
                  ? cn("rp-resource-selected", theme.selected)
                  : "rp-resource-available bg-white text-slate-900 border-neutral-300 hover:border-black dark:bg-slate-950 dark:text-slate-50 dark:border-neutral-800 dark:hover:border-white",
                disabled && "rp-resource-disabled cursor-not-allowed bg-neutral-50 text-neutral-400 border-neutral-200 dark:bg-slate-900 dark:text-slate-600 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-800",
              )}
              onClick={() => onToggle(resource)}
            >
              <span className="rp-resource-label text-xs font-bold tracking-tight">{resource.label}</span>
              <span className="rp-resource-meta text-[9px] uppercase tracking-wider opacity-60 mt-1">
                {disabled ? "Unavailable" : isSelected ? "Selected" : "Select"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerForm({
  labels,
  customer,
  purpose,
  inputClassName,
  onCustomerChange,
  onPurposeChange,
}: {
  labels: BookingLabels;
  customer: CustomerSnapshot;
  purpose: string;
  inputClassName?: string;
  onCustomerChange: (customer: CustomerSnapshot) => void;
  onPurposeChange: (purpose: string) => void;
}) {
  return (
    <div className="rp-customer-form grid gap-4 border-t border-neutral-200 dark:border-neutral-800 pt-6">
      <span className="rp-field-label text-[11px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
        04 / Customer Details
      </span>
      <div className="rp-customer-grid grid gap-4 sm:grid-cols-2">
        <label className="rp-input-label grid gap-1.5">
          <span className="rp-input-label-text text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
            {labels.customerName}
          </span>
          <input
            className={cn(inputClassName, "focus:ring-1 focus:ring-black dark:focus:ring-white")}
            value={customer.name ?? ""}
            onChange={(event) => onCustomerChange({ ...customer, name: event.currentTarget.value })}
            placeholder="e.g. Jean Tschichold"
          />
        </label>
        <label className="rp-input-label grid gap-1.5">
          <span className="rp-input-label-text text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
            {labels.customerEmail}
          </span>
          <input
            type="email"
            className={cn(inputClassName, "focus:ring-1 focus:ring-black dark:focus:ring-white")}
            value={customer.email ?? ""}
            onChange={(event) => onCustomerChange({ ...customer, email: event.currentTarget.value })}
            placeholder="e.g. jean@typographie.ch"
          />
        </label>
        <label className="rp-input-label rp-input-label-wide grid gap-1.5 sm:col-span-2">
          <span className="rp-input-label-text text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
            {labels.purpose}
          </span>
          <input
            className={cn(inputClassName, "focus:ring-1 focus:ring-black dark:focus:ring-white")}
            value={purpose}
            onChange={(event) => onPurposeChange(event.currentTarget.value)}
            placeholder="e.g. Design review session"
          />
        </label>
      </div>
    </div>
  );
}

export function BookingSummary({
  labels,
  service,
  state,
  panelClassName,
}: {
  labels: BookingLabels;
  service?: ServiceResponse;
  state: Pick<BookingFlowState, "date" | "quantity" | "selectedResourceLabels" | "selectedSlot">;
  panelClassName?: string;
}) {
  return (
    <aside className={cn(panelClassName, "rp-summary flex flex-col gap-4")}>
      <h3 className="rp-summary-title text-xs font-bold uppercase tracking-widest text-neutral-400 font-mono border-b border-neutral-200 dark:border-neutral-800 pb-2">
        Summary
      </h3>
      <dl className="rp-summary-list grid gap-3 text-sm">
        <SummaryRow label={labels.service} value={service?.name ?? "Not loaded"} />
        <SummaryRow label={labels.date} value={<span className="rp-summary-value-code font-mono">{state.date}</span>} />
        <SummaryRow
          label={labels.time}
          value={
            <span className="rp-summary-value-code font-mono font-semibold">
              {getSlotStart(state.selectedSlot) ?? "Select slot"}
            </span>
          }
        />
        <SummaryRow label={labels.quantity} value={<span className="rp-summary-value-code font-mono">{state.quantity}</span>} />
        {state.selectedResourceLabels.length > 0 ? (
          <SummaryRow label={labels.resource} value={state.selectedResourceLabels.join(", ")} />
        ) : null}
      </dl>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rp-summary-row flex justify-between gap-3 border-b border-neutral-100 dark:border-neutral-900 pb-1.5">
      <dt className="rp-summary-label text-xs text-neutral-400 uppercase tracking-wider font-mono">{label}</dt>
      <dd className="rp-summary-value text-right text-sm font-semibold">{value}</dd>
    </div>
  );
}

export function ReservationSuccess({ reservationId, className }: { reservationId: string; className?: string }) {
  return (
    <div className={cn(className, "rp-success flex flex-col gap-1")}>
      <span className="rp-status-kicker font-bold uppercase tracking-wider text-[10px]">Success</span>
      <p className="rp-status-text text-xs font-semibold">Reservation created successfully.</p>
      <p className="rp-status-id font-mono text-[10px] break-all opacity-80 mt-1">ID: {reservationId}</p>
    </div>
  );
}

export function ReservationError({ message, className }: { message?: string; className?: string }) {
  return (
    <div className={cn(className, "rp-error flex flex-col gap-1")}>
      <span className="rp-status-kicker font-bold uppercase tracking-wider text-[10px]">Error</span>
      <p className="rp-status-text text-xs font-semibold">{message ?? "Reservation request failed."}</p>
    </div>
  );
}
