"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Wrench } from "lucide-react";
import { Sidebar } from "@/components/admin/Sidebar";
import type { Service } from "@/types";

interface SeatMaintenanceManagerProps {
  userEmail: string;
}

interface MaintenanceSeatRow {
  seat_label: string;
  reason?: string | null;
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

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/services");

        if (!response.ok) {
          throw new Error("Failed to load services");
        }

        const data = (await response.json()) as Service[];

        if (!isMounted) return;

        const maintenanceServices = data.filter((service) => service.total_seats === 16);
        setServices(maintenanceServices);
        const racingService = maintenanceServices[0];
        setSelectedServiceId(racingService?.id ?? "");
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
        const response = await fetch(`/api/seat-maintenance?service_id=${selectedServiceId}`);

        if (!response.ok) {
          throw new Error("Failed to load maintenance seats");
        }

        const data = (await response.json()) as { seats?: MaintenanceSeatRow[] };
        const seatLabels = (data.seats ?? []).map((seat) => seat.seat_label);

        if (isMounted) {
          setMaintenanceSeats(seatLabels);
          setReason(data.seats?.find((seat) => seat.reason)?.reason ?? "");
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
        : [...currentSeats, seatLabel].sort((left, right) => Number(left.slice(2)) - Number(right.slice(2)))
    ));
  };

  const saveMaintenanceSeats = async () => {
    if (!selectedServiceId) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/seat-maintenance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: selectedServiceId,
          seat_labels: maintenanceSeats,
          reason: reason.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save maintenance seats");
      }

      const data = (await response.json()) as { seat_labels?: string[] };
      setMaintenanceSeats(data.seat_labels ?? []);
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
              <p className="text-sm text-gray-400">Block racing simulator seats until repairs are complete</p>
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
                  {maintenanceSeats.length} seat{maintenanceSeats.length === 1 ? "" : "s"} currently under maintenance
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                <Wrench className="h-3.5 w-3.5" />
                Click seats to block or unblock
              </div>
            </div>

            {/* Racing Screen / Track View */}
            <div className="mb-6 text-center">
              <div className="mx-auto w-3/5 h-6 bg-gradient-to-b from-neon/20 to-transparent rounded-t-full flex items-center justify-center border-t border-neon/30">
                <span className="text-xs text-neon/70 font-heading uppercase tracking-widest">PCs</span>
              </div>
            </div>

            {/* Two Island Layout */}
            <div className="flex justify-center gap-8">
              {/* Left Island A */}
              <div className="space-y-2">
                <div className="text-center text-xs text-gray-500 mb-2">Island A</div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((seatNumber) => {
                    const seatLabel = `RS${seatNumber}`;
                    const isBlocked = maintenanceSeats.includes(seatLabel);

                    return (
                      <button
                        key={seatLabel}
                        onClick={() => toggleSeat(seatLabel)}
                        className={`relative w-14 h-14 rounded-lg transition-all duration-200 flex flex-col items-center justify-center ${
                          isBlocked
                            ? "bg-amber-400/20 border border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
                            : "bg-white/5 border border-white/20 hover:border-neon/50 hover:bg-white/10 hover:scale-105"
                        }`}
                      >
                        <svg
                          className={`w-6 h-6 ${isBlocked ? "text-amber-300" : "text-gray-500"}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M4 18v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h10v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h1v-4c0-.55-.45-1-1-1h-1V8c0-2.21-1.79-4-4-4H9C6.79 4 5 5.79 5 8v5H4c-.55 0-1 .45-1 1v4h1zm3-10c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v5H7V8z"/>
                        </svg>
                        <span className={`text-xs font-bold mt-0.5 ${isBlocked ? "text-amber-200" : "text-gray-500"}`}>
                          {seatLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[9, 10, 11, 12].map((seatNumber) => {
                    const seatLabel = `RS${seatNumber}`;
                    const isBlocked = maintenanceSeats.includes(seatLabel);

                    return (
                      <button
                        key={seatLabel}
                        onClick={() => toggleSeat(seatLabel)}
                        className={`relative w-14 h-14 rounded-lg transition-all duration-200 flex flex-col items-center justify-center ${
                          isBlocked
                            ? "bg-amber-400/20 border border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
                            : "bg-white/5 border border-white/20 hover:border-neon/50 hover:bg-white/10 hover:scale-105"
                        }`}
                      >
                        <svg
                          className={`w-6 h-6 ${isBlocked ? "text-amber-300" : "text-gray-500"}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M4 18v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h10v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h1v-4c0-.55-.45-1-1-1h-1V8c0-2.21-1.79-4-4-4H9C6.79 4 5 5.79 5 8v5H4c-.55 0-1 .45-1 1v4h1zm3-10c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v5H7V8z"/>
                        </svg>
                        <span className={`text-xs font-bold mt-0.5 ${isBlocked ? "text-amber-200" : "text-gray-500"}`}>
                          {seatLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aisle */}
              <div className="flex flex-col items-center justify-center text-gray-600">
                <div className="w-px h-full bg-white/10" />
              </div>

              {/* Right Island B */}
              <div className="space-y-2">
                <div className="text-center text-xs text-gray-500 mb-2">Island B</div>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 6, 7, 8].map((seatNumber) => {
                    const seatLabel = `RS${seatNumber}`;
                    const isBlocked = maintenanceSeats.includes(seatLabel);

                    return (
                      <button
                        key={seatLabel}
                        onClick={() => toggleSeat(seatLabel)}
                        className={`relative w-14 h-14 rounded-lg transition-all duration-200 flex flex-col items-center justify-center ${
                          isBlocked
                            ? "bg-amber-400/20 border border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
                            : "bg-white/5 border border-white/20 hover:border-neon/50 hover:bg-white/10 hover:scale-105"
                        }`}
                      >
                        <svg
                          className={`w-6 h-6 ${isBlocked ? "text-amber-300" : "text-gray-500"}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M4 18v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h10v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h1v-4c0-.55-.45-1-1-1h-1V8c0-2.21-1.79-4-4-4H9C6.79 4 5 5.79 5 8v5H4c-.55 0-1 .45-1 1v4h1zm3-10c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v5H7V8z"/>
                        </svg>
                        <span className={`text-xs font-bold mt-0.5 ${isBlocked ? "text-amber-200" : "text-gray-500"}`}>
                          {seatLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[13, 14, 15, 16].map((seatNumber) => {
                    const seatLabel = `RS${seatNumber}`;
                    const isBlocked = maintenanceSeats.includes(seatLabel);

                    return (
                      <button
                        key={seatLabel}
                        onClick={() => toggleSeat(seatLabel)}
                        className={`relative w-14 h-14 rounded-lg transition-all duration-200 flex flex-col items-center justify-center ${
                          isBlocked
                            ? "bg-amber-400/20 border border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
                            : "bg-white/5 border border-white/20 hover:border-neon/50 hover:bg-white/10 hover:scale-105"
                        }`}
                      >
                        <svg
                          className={`w-6 h-6 ${isBlocked ? "text-amber-300" : "text-gray-500"}`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M4 18v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h10v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h1v-4c0-.55-.45-1-1-1h-1V8c0-2.21-1.79-4-4-4H9C6.79 4 5 5.79 5 8v5H4c-.55 0-1 .45-1 1v4h1zm3-10c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v5H7V8z"/>
                        </svg>
                        <span className={`text-xs font-bold mt-0.5 ${isBlocked ? "text-amber-200" : "text-gray-500"}`}>
                          {seatLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

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
