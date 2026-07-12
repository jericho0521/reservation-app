import {
  createPublicExperienceBookingClient,
  createReservationPlatformClient,
  type ReservationPlatformClient,
  type ReservationPlatformClientOptions,
} from "@reservation-platform/sdk";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface ReservationProviderProps
  extends Omit<ReservationPlatformClientOptions, "baseUrl"> {
  baseUrl?: string;
  client?: ReservationPlatformClient;
  children: ReactNode;
}

export function PublicExperienceReservationProvider({
  baseUrl,
  slug,
  children,
}: {
  baseUrl: string;
  slug: string;
  children: ReactNode;
}) {
  const client = useMemo(
    () => createPublicExperienceBookingClient({ baseUrl, slug }),
    [baseUrl, slug],
  );
  return <ReservationProvider client={client}>{children}</ReservationProvider>;
}

const ReservationClientContext = createContext<ReservationPlatformClient | null>(null);

export function ReservationProvider({
  baseUrl,
  client,
  children,
  ...clientOptions
}: ReservationProviderProps) {
  const value = useMemo(() => {
    if (client) {
      return client;
    }
    const normalizedBaseUrl = baseUrl?.trim();
    if (!normalizedBaseUrl) {
      return null;
    }
    return createReservationPlatformClient({
      ...clientOptions,
      baseUrl: normalizedBaseUrl,
    });
  }, [
    baseUrl,
    client,
    clientOptions.apiVersion,
    clientOptions.fetch,
    clientOptions.getAccessToken,
    clientOptions.headers,
    clientOptions.onRequest,
    clientOptions.onResponse,
    clientOptions.retry,
    clientOptions.tenantId,
    clientOptions.timeoutMs,
    clientOptions.venueId,
  ]);

  return (
    <ReservationClientContext.Provider value={value}>
      {children}
    </ReservationClientContext.Provider>
  );
}

export function useReservationClient() {
  const client = useContext(ReservationClientContext);
  if (!client) {
    throw new Error("ReservationProvider requires a baseUrl or client before reservation hooks can run.");
  }
  return client;
}

export function useOptionalReservationClient() {
  return useContext(ReservationClientContext);
}
