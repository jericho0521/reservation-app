"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Wrench } from "lucide-react";
import { Sidebar } from "@/components/admin/Sidebar";
import {
  listReservationServices,
  listResourceMaintenanceSeats,
  saveResourceMaintenanceSeats,
  type LegacyMaintenanceSeatRow,
} from "@/lib/reservation-platform-client";
import type { ReservableResource, Service } from "@/types";

interface SeatMaintenanceManagerProps {
  userEmail: string;
}

const RACING_ISLANDS = [
  { label: "Island A", rows: [["RS1", "RS2", "RS3", "RS4"], ["RS9", "RS10", "RS11", "RS12"]] },
  { label: "Island B", rows: [["RS5", "RS6", "RS7", "RS8"], ["RS13", "RS14", "RS15", "RS16"]] },
];
const LEGACY_RACING_RESOURCE_COUNT = 16;

function naturalLabelSort(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isMaintenanceSupportedService(service: Service) {
  return Boolean(
    service.selection_mode === "assigned_resource" ||
    service.reservation_policy?.require_resource_labels === true ||
    service.resources?.some((resource) => resource.is_active),
  );
}

function getActiveResourceLabels(resources?: ReservableResource[]) {
  return (resources ?? [])
    .filter((resource) => resource.is_active)
    .map((resource) => resource.label)
    .sort(naturalLabelSort);
}

function getMaintenanceResourceLabels(service: Service | null) {
  const configuredLabels = getActiveResourceLabels(service?.resources);

  if (configuredLabels.length > 0) {
    return configuredLabels;
  }

  if (!service?.selection_mode && service?.total_seats === LEGACY_RACING_RESOURCE_COUNT) {
    return Array.from({ length: LEGACY_RACING_RESOURCE_COUNT }, (_, index) => `RS${index + 1}`);
  }

  return [];
}

function isRacingLayout(labels: string[]) {
  const labelSet = new Set(labels);
  return labels.length === 16 && RACING_ISLANDS.every((island) =>
    island.rows.every((row) => row.every((label) => labelSet.has(label)))
  );
}

export function SeatMaintenanceManager({ userEmail }: SeatMaintenanceManagerProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [maintenanceSeats, setMaintenanceSeats] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services],
  );
  const resourceLabels = useMemo(
    () => getMaintenanceResourceLabels(selectedService),
    [selectedService],
  );
  const usesRacingLayout = isRacingLayout(resourceLabels);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await listReservationServices();

        if (!isMounted) return;

        const maintenanceServices = data.filter(isMaintenanceSupportedService);
        setServices(maintenanceServices);
        const firstService = maintenanceServices[0];
        setSelectedServiceId(firstService?.id ?? "");
      } catch (loadError) {
        console.error("Failed to load services:", loadError);
        if (isMounted) {
          setError("Failed to load services");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadServices();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedServiceId) {
      setMaintenanceSeats([]);
      return;
    }

    let isMounted = true;

    async function loadMaintenanceSeats() {
      setError(null);

      try {
        const seats: LegacyMaintenanceSeatRow[] = await listResourceMaintenanceSeats(selectedServiceId);
        const seatLabels = seats.map((seat) => seat.seat_label);

        if (isMounted) {
          setMaintenanceSeats(seatLabels);
          setReason(seats.find((seat) => seat.reason)?.reason ?? "");
        }
      } catch (loadError) {
        console.error("Failed to load maintenance seats:", loadError);
        if (isMounted) {
          setError("Failed to load seat maintenance");
        }
      }
    }

    loadMaintenanceSeats();

    return () => {
      isMounted = false;
    };
  }, [selectedServiceId]);

  const toggleSeat = (seatLabel: string) => {
    setMaintenanceSeats((currentSeats) => (
      currentSeats.includes(seatLabel)
        ? currentSeats.filter((label) => label !== seatLabel)
        : [...currentSeats, seatLabel].sort(naturalLabelSort)
    ));
  };

  const renderResourceButton = (resourceLabel: string) => {
    const isBlocked = maintenanceSeats.includes(resourceLabel);

    return (
      <button
        key={resourceLabel}
        onClick={() => toggleSeat(resourceLabel)}
        className={`relative flex h-14 w-14 flex-col items-center justify-center rounded-lg transition-all duration-200 ${
          isBlocked
            ? "border border-amber-400/50 bg-amber-400/20 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
            : "border border-white/20 bg-white/5 hover:scale-105 hover:border-neon/50 hover:bg-white/10"
        }`}
      >
        <Wrench className={`h-5 w-5 ${isBlocked ? "text-amber-300" : "text-gray-500"}`} />
        <span className={`mt-0.5 text-xs font-bold ${isBlocked ? "text-amber-200" : "text-gray-500"}`}>
          {resourceLabel}
        </span>
      </button>
    );
  };

  const saveMaintenanceSeats = async () => {
    if (!selectedServiceId) return;

    setIsSaving(true);
    setError(null);

    try {
      const seatLabels = await saveResourceMaintenanceSeats({
        serviceId: selectedServiceId,
        seatLabels: maintenanceSeats,
        reason: reason.trim() || undefined,
      });
      setMaintenanceSeats(seatLabels);
    } catch (saveError) {
      console.error("Failed to save maintenance seats:", saveError);
      setError("Failed to save seat maintenance");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-racing-dark">
      <Sidebar title="Admin Panel" subtitle={userEmail} />

      <div className="ml-[76px] transition-all duration-300">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-white/5 backdrop-blur-md">
          <div className="container mx-auto flex items-center justify-between px-6 py-4">
            <div>
              <h1 className="font-heading text-2xl font-bold">Seat Maintenance</h1>
              <p className="text-sm text-gray-400">Block seats or resources until repairs are complete</p>
            </div>
            <button
              onClick={saveMaintenanceSeats}
              disabled={isSaving || !selectedServiceId}
              className="flex items-center gap-2 rounded-lg bg-neon px-4 py-2 text-sm font-bold text-racing-dark transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </header>

        <main className="container mx-auto space-y-8 px-6 py-8">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          <section className="glass-panel rounded-xl border border-white/10 p-6">
            <div className="mb-6 grid gap-4 md:grid-cols-[1fr_2fr]">
              <div>
                <label className="mb-2 block text-sm text-gray-400">Service</label>
                <select
                  value={selectedServiceId}
                  onChange={(event) => setSelectedServiceId(event.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-white/20 bg-racing-dark px-4 py-3 text-white focus:border-neon focus:outline-none"
                >
                  {services.length === 0 && (
                    <option value="">No assigned-resource services</option>
                  )}
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-400">Reason optional</label>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Example: wheel issue, PC repair, pedal maintenance"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white focus:border-neon focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-xl font-bold">{selectedService?.name ?? "Seats"}</h2>
                <p className="text-sm text-gray-400">
                  {maintenanceSeats.length} resource{maintenanceSeats.length === 1 ? "" : "s"} currently under maintenance
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                <Wrench className="h-3.5 w-3.5" />
                Click resources to block or unblock
              </div>
            </div>

            {usesRacingLayout ? (
              <>
                <div className="mb-6 text-center">
                  <div className="mx-auto flex h-6 w-3/5 items-center justify-center rounded-t-full border-t border-neon/30 bg-gradient-to-b from-neon/20 to-transparent">
                    <span className="font-heading text-xs uppercase tracking-widest text-neon/70">PCs</span>
                  </div>
                </div>

                <div className="flex justify-center gap-8">
                  {RACING_ISLANDS.map((island, index) => (
                    <div key={island.label} className="contents">
                      {index > 0 && (
                        <div className="flex flex-col items-center justify-center text-gray-600">
                          <div className="h-full w-px bg-white/10" />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="mb-2 text-center text-xs text-gray-500">{island.label}</div>
                        {island.rows.map((row) => (
                          <div key={row.join("-")} className="grid grid-cols-4 gap-2">
                            {row.map(renderResourceButton)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(3.5rem,3.5rem))] justify-center gap-2">
                {resourceLabels.map(renderResourceButton)}
              </div>
            )}

            {/* Legend */}
            <div className="mt-6 flex justify-center gap-6 text-xs pt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-white/5 border border-white/20 rounded" />
                <span className="text-gray-400">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-400/20 border border-amber-400/50 rounded" />
                <span className="text-gray-400">Maintenance</span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
