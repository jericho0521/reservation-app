"use client";

import { useState } from "react";
import { runNextSdkSmoke, type NextSmokeResult } from "../src/sdkSmokeFlow";

export const nextClientSmokeMarker = "next-client-sdk-smoke";

export function ClientSmoke() {
  const [result, setResult] = useState<NextSmokeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runSmoke() {
    setRunning(true);
    setError(null);
    try {
      setResult(await runNextSdkSmoke({
        customerName: "Next External Client",
        customerEmail: "next-client@example.com",
        date: "2026-10-01",
        quantity: 2,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section data-smoke-marker={nextClientSmokeMarker}>
      <button type="button" onClick={runSmoke} disabled={running}>
        {running ? "Running client smoke" : "Run client smoke"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <p>
          Client SDK smoke passed for {result.reservationId} with {result.directParity} parity.
        </p>
      ) : null}
    </section>
  );
}
