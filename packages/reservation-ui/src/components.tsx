import type {
  AvailabilitySlot,
  CustomerSnapshot,
  ResourceResponse,
  ReservationResponse,
  ServiceResponse,
} from "@reservation-platform/contract-types";
import {
  ReservationProvider,
  PublicExperienceReservationProvider,
  bookingErrorMessage,
  appointmentPractitioners,
  canAdvanceBookingJourney,
  getServiceStrategy,
  getSlotEnd,
  getSlotStart,
  nextBookingJourneyStep,
  previousBookingJourneyStep,
  useBookingFlow,
  useServices,
  type BookingStrategy,
  type BookingJourneyStep,
  type BookingFlowState,
} from "@reservation-platform/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "./class-names.js";
import {
  defaultBookingLabels,
  defaultThemeClasses,
  type BookingLabels,
  type ThemeClasses,
} from "./types.js";
import { BookingStepActions, BookingStepPanel, BookingStepProgress } from "./booking/journey.js";

export interface BookingFlowProps {
  serviceId?: string;
  baseUrl?: string;
  labels?: Partial<BookingLabels>;
  theme?: ThemeClasses;
  className?: string;
  initialDate?: string;
  initialQuantity?: number;
  useExistingProvider?: boolean;
  setupErrorTitle?: string;
  setupErrorMessage?: string;
  managementBasePath?: string;
}

export interface ExperiencePreviewProps {
  brandName: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  bookingLabel: string;
  resourceLabel: string;
  channels: { web_booking: boolean; web_chat: boolean; whatsapp: boolean };
  services: ServiceResponse[];
}

export function ExperiencePreview({
  brandName,
  description,
  primaryColor = "#2563eb",
  secondaryColor = "#0f172a",
  bookingLabel,
  resourceLabel,
  channels,
  services,
}: ExperiencePreviewProps) {
  const style = {
    "--rp-preview-primary": primaryColor,
    "--rp-preview-secondary": secondaryColor,
  } as CSSProperties;
  return <section className="rp-experience-preview" style={style}>
    <header className="rp-preview-hero">
      <span className="rp-preview-kicker">Book with confidence</span>
      <h2>{brandName}</h2>
      <p>{description ?? `Choose a ${bookingLabel.toLowerCase()} that works for you.`}</p>
      <div className="rp-preview-channels" aria-label="Available booking channels">
        {channels.web_booking ? <span>Web booking</span> : null}
        {channels.web_chat ? <span>AI chat</span> : null}
        {channels.whatsapp ? <span>WhatsApp</span> : null}
      </div>
    </header>
    <div className="rp-preview-content">
      <div className="rp-preview-service-list">
        <h3>Choose your {bookingLabel.toLowerCase()}</h3>
        {services.length > 0 ? services.map((service) => <article key={service.service_id}>
          <div><strong>{service.name}</strong><span>{service.duration_minutes ? `${service.duration_minutes} min` : resourceLabel}</span></div>
          <p>{service.description ?? `${resourceLabel} availability is checked live.`}</p>
          <button type="button">Select</button>
        </article>) : <div className="rp-preview-empty">Your services will appear here.</div>}
      </div>
      <aside className="rp-preview-booking-card">
        <span>Live availability</span>
        <strong>Select a date and time</strong>
        <div className="rp-preview-date-row"><span>Tomorrow</span><span>Next week</span></div>
        <div className="rp-preview-time-row"><span>09:00</span><span>10:30</span><span>14:00</span></div>
        <button type="button">Continue to {bookingLabel}</button>
      </aside>
    </div>
  </section>;
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
  useExistingProvider = false,
  setupErrorTitle = "Reservation backend configuration required",
  setupErrorMessage = "Set the backend base URL and service id, or wrap BookingFlow in ReservationProvider and pass a service id.",
  managementBasePath,
}: BookingFlowProps) {
  if (!serviceId || (!baseUrl && !useExistingProvider)) {
    return (
      <BookingSetupError
        title={setupErrorTitle}
        message={setupErrorMessage}
        className={className}
      />
    );
  }

  const content = (
    <BookingFlowInner
      serviceId={serviceId}
      labels={labels}
      theme={theme}
      className={className}
      initialDate={initialDate}
      initialQuantity={initialQuantity}
      managementBasePath={managementBasePath}
    />
  );

  return baseUrl ? <ReservationProvider baseUrl={baseUrl}>{content}</ReservationProvider> : content;
}

export function PublicBookingJourney({
  baseUrl,
  slug,
  labels,
  theme,
  className,
}: {
  baseUrl: string;
  slug: string;
  labels?: Partial<BookingLabels>;
  theme?: ThemeClasses;
  className?: string;
}) {
  return <PublicExperienceReservationProvider baseUrl={baseUrl} slug={slug}>
    <PublicBookingJourneyInner labels={labels} theme={theme} className={className} managementBasePath={`/${slug}/manage`} />
  </PublicExperienceReservationProvider>;
}

function PublicBookingJourneyInner({
  labels,
  theme,
  className,
  managementBasePath,
}: {
  labels?: Partial<BookingLabels>;
  theme?: ThemeClasses;
  className?: string;
  managementBasePath: string;
}) {
  const [serviceId, setServiceId] = useState<string>();
  if (!serviceId) {
    return <section className={cn("rp-public-journey", className)}>
      <BookingStepProgress step="service" appointment />
      <header className="rp-service-step-header"><span>Start here</span><h2>Choose an experience</h2><p>Select the service you want to reserve.</p></header>
      <ServicePicker onSelect={(service) => setServiceId(service.service_id)} />
    </section>;
  }
  return <BookingFlow
    serviceId={serviceId}
    labels={labels}
    theme={theme}
    className={className}
    useExistingProvider
    managementBasePath={managementBasePath}
  />;
}

export function BookingSetupError({
  title,
  message,
  className,
}: {
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <section className={cn("rp-setup-error border border-red-600 bg-red-50 p-6 text-red-800 rounded-none", className)}>
      <h2 className="rp-setup-error-title text-lg font-bold">{title}</h2>
      <p className="rp-setup-error-message mt-2 text-sm">{message}</p>
    </section>
  );
}

function BookingFlowInner({
  serviceId,
  labels,
  theme,
  className,
  initialDate,
  initialQuantity,
  managementBasePath,
}: Omit<BookingFlowProps, "baseUrl" | "serviceId"> & { serviceId: string }) {
  const mergedLabels = mergeLabels(labels);
  const mergedTheme = mergeTheme(theme);
  const flow = useBookingFlow({ serviceId, initialDate, initialQuantity });
  const [step, setStep] = useState<BookingJourneyStep>("practitioner");
  const [submitError, setSubmitError] = useState<string>();

  const resources = flow.state.availability?.resources ?? [];
  const slots = flow.state.availability?.slots ?? [];
  const selectedResourceIds = new Set(flow.state.selectedResourceIds);
  const bookingStrategy = getServiceStrategy(flow.state.service);
  const practitioners = appointmentPractitioners(flow.state.service);
  const controlVisibility = getBookingControlVisibility(
    bookingStrategy,
    resources.length,
  );

  useEffect(() => {
    if (step === "practitioner" && flow.state.service && practitioners.length === 0) setStep("date");
  }, [flow.state.service, practitioners.length, step]);

  async function submit() {
    setSubmitError(undefined);
    try {
      await flow.actions.submit();
      setStep("success");
    } catch (error) {
      setSubmitError(bookingErrorMessage(error));
      await flow.actions.refetchAvailability();
      setStep("slot");
    }
  }

  const canContinue = canAdvanceBookingJourney(step, flow.state);
  const journey: readonly BookingJourneyStep[] = practitioners.length > 0
    ? ["practitioner", "date", "slot", "details", "review"]
    : ["date", "slot", "options", "details", "review"];
  const stepIndex = step === "success" ? journey.length : journey.indexOf(step);

  return (
    <section className={cn(mergedTheme.shell, className)}>
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
      <BookingStepProgress step={step} appointment={practitioners.length > 0} />
      <div className="rp-layout rp-journey-layout">
        <div className="rp-main">
          {step === "practitioner" ? <BookingStepPanel step={step} title="Choose a practitioner" description="Select who you would like to see before choosing a date and time.">
            <div className="rp-practitioner-grid" role="list">
              {practitioners.map((practitioner) => {
                const selected = flow.state.selectedResourceIds.includes(practitioner.resource_id);
                return <button
                  key={practitioner.resource_id}
                  type="button"
                  role="listitem"
                  aria-pressed={selected}
                  className={cn("rp-practitioner-card", selected && "selected")}
                  onClick={() => flow.actions.setSelectedResources([practitioner])}
                >
                  <strong>{String(practitioner.metadata?.practitioner_display_name ?? practitioner.label).replace(/\s+\[[0-9a-f-]+\]$/iu, "")}</strong>
                  <span>{selected ? "Selected" : "Choose practitioner"}</span>
                </button>;
              })}
            </div>
          </BookingStepPanel> : null}
          {step === "date" ? <BookingStepPanel step={step} title="Choose a date" description="We will check the latest opening hours and booking notice rules.">
            <DatePicker label={mergedLabels.date} value={flow.state.date} onChange={flow.actions.setDate} className={mergedTheme.input} />
          </BookingStepPanel> : null}
          {step === "slot" ? <BookingStepPanel step={step} title="Choose an available time" description="Availability reflects existing reservations and maintenance.">
            <AvailabilityTimeline label={mergedLabels.time} slots={slots} selectedSlot={flow.state.selectedSlot} quantity={flow.state.quantity} loading={flow.availability.loading} onSelect={flow.actions.setSelectedSlot} />
          </BookingStepPanel> : null}
          {step === "options" ? <BookingStepPanel step={step} title={`Choose ${mergedLabels.resource.toLowerCase()} and quantity`} description="Unavailable options cannot be selected.">
            {practitioners.length > 0 ? <p className="rp-practitioner-confirmation">Practitioner selected: <strong>{flow.state.selectedResourceLabels[0]}</strong></p> : controlVisibility.showResourceSelector ? <ResourceSelector
              label={mergedLabels.resource}
              resources={resources}
              selectedResourceIds={selectedResourceIds}
              unavailableResourceLabels={[...(flow.state.selectedSlot?.taken_resource_labels ?? []), ...(flow.state.selectedSlot?.maintenance_resource_labels ?? [])]}
              minimumCapacity={flow.state.quantity}
              onToggle={(resource) => {
                const selected = resources.filter((candidate) => selectedResourceIds.has(candidate.resource_id));
                const next = selectedResourceIds.has(resource.resource_id) ? selected.filter((candidate) => candidate.resource_id !== resource.resource_id) : [...selected, resource];
                flow.actions.setSelectedResources(next);
                if (shouldSyncQuantityToSelectedResources(bookingStrategy)) flow.actions.setQuantity(Math.max(1, next.length));
              }}
              theme={mergedTheme}
            /> : null}
            {controlVisibility.showQuantitySelector ? <QuantitySelector label={mergedLabels.quantity} value={flow.state.quantity} onChange={flow.actions.setQuantity} className={mergedTheme.input} /> : null}
          </BookingStepPanel> : null}
          {step === "details" ? <BookingStepPanel step={step} title="Your details" description="We use these details only for this reservation and its updates.">
            <CustomerForm labels={mergedLabels} customer={flow.state.customer} purpose={flow.state.purpose} inputClassName={mergedTheme.input} onCustomerChange={flow.actions.setCustomer} onPurposeChange={flow.actions.setPurpose} />
          </BookingStepPanel> : null}
          {step === "review" ? <BookingStepPanel step={step} title="Review and confirm" description="Nothing is reserved until you press the confirmation button.">
            <BookingSummary labels={mergedLabels} service={flow.state.service} state={flow.state} panelClassName={mergedTheme.panel} />
          </BookingStepPanel> : null}
          {step === "success" && flow.state.reservation ? <BookingStepPanel step={step} title="You are booked" description="Keep this confirmation for your records.">
            <ReservationSuccess reservation={flow.state.reservation} managementBasePath={managementBasePath} className={mergedTheme.success} />
          </BookingStepPanel> : null}
          {flow.service.error || flow.availability.error || submitError ? <ReservationError message={flow.service.error?.message ?? flow.availability.error?.message ?? submitError} className={mergedTheme.error} /> : null}
          {step !== "success" ? <BookingStepActions
            canContinue={canContinue}
            canGoBack={stepIndex > 0}
            continueLabel={step === "review" ? (flow.state.submitting ? "Confirming…" : "Confirm reservation") : "Continue"}
            onBack={() => setStep(previousBookingJourneyStep(step, flow.state))}
            onContinue={() => step === "review" ? void submit() : setStep(nextBookingJourneyStep(step, flow.state))}
          /> : null}
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
  const [query, setQuery] = useState("");
  const visibleServices = filterBookingServices(services.data ?? [], query);
  return (
    <div className={cn("rp-service-picker grid gap-3", className)}>
      <label className="rp-service-search"><span>Find a service</span><input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search by name or description" /></label>
      {services.loading ? <div className="rp-loading-state" aria-live="polite">Loading live services…</div> : null}
      {services.error ? <div className="rp-error">Services are temporarily unavailable. <button type="button" onClick={() => void services.refetch()}>Try again</button></div> : null}
      {!services.loading && !services.error && visibleServices.length === 0 ? <div className="rp-empty-state">{query.trim() ? "No services match that search." : "No bookable services are available right now."}</div> : null}
      {visibleServices.map((service) => (
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

export function filterBookingServices(services: ServiceResponse[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return services;
  return services.filter((service) => `${service.name} ${service.description ?? ""}`.toLocaleLowerCase().includes(normalized));
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
    <label className="rp-field grid gap-1.5">
      <span className="rp-field-label text-[11px] font-bold uppercase tracking-widest text-neutral-500 font-mono">
        01 / {label}
      </span>
      <input
        type="date"
        value={value}
        className={cn(className, "focus:ring-1 focus:ring-black dark:focus:ring-white")}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
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
          No bookable times are offered on this date. The business may be closed or the date may be outside its booking window. Choose another date.
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
                  {!slot.is_available && slot.available_quantity > 0
                    ? "Unavailable"
                    : slot.available_quantity === 0
                      ? "Fully booked"
                      : slot.available_quantity < quantity
                        ? `Only ${slot.available_quantity} left`
                        : `${slot.available_quantity} left`}
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
  minimumCapacity = 1,
  onToggle,
  theme,
}: {
  label: string;
  resources: ResourceResponse[];
  selectedResourceIds: Set<string>;
  unavailableResourceLabels?: string[];
  minimumCapacity?: number;
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
          const undersized = resource.kind === "room" && (resource.capacity ?? 1) < minimumCapacity;
          const disabled = unavailable.has(resource.label) || !resource.is_active || undersized;
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
                {undersized ? `Up to ${resource.capacity ?? 1}` : disabled ? "Unavailable" : isSelected ? "Selected" : resource.capacity && resource.capacity > 1 ? `Up to ${resource.capacity}` : "Select"}
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

export function ReservationSuccess({
  reservation,
  managementBasePath,
  className,
}: {
  reservation: Pick<ReservationResponse, "reservation_id" | "management_token">;
  managementBasePath?: string;
  className?: string;
}) {
  return (
    <div className={cn(className, "rp-success flex flex-col gap-1")}>
      <span className="rp-status-kicker font-bold uppercase tracking-wider text-[10px]">Success</span>
      <p className="rp-status-text text-xs font-semibold">Reservation created successfully.</p>
      <p className="rp-status-id font-mono text-[10px] break-all opacity-80 mt-1">ID: {reservation.reservation_id}</p>
      {managementBasePath && reservation.management_token ? <a className="rp-management-link" href={`${managementBasePath}/${encodeURIComponent(reservation.management_token)}`}>View or cancel this reservation</a> : null}
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
