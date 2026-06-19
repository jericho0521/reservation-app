import { FormEvent, useState } from "react";
import { runBrowserSdkSmoke, type BrowserSmokeResult } from "./sdkSmokeFlow";
import "./styles.css";

const initialForm = {
  customerName: "Vite React Consumer",
  customerEmail: "vite-react@example.com",
  date: "2026-09-01",
  quantity: 2,
};

export function App() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [result, setResult] = useState<BrowserSmokeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitSmoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("running");
    setError(null);

    try {
      const smokeResult = await runBrowserSdkSmoke(form);
      setResult(smokeResult);
      setStatus("passed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("failed");
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <div>
          <p className="eyebrow">External browser fixture</p>
          <h1>Reservation Platform SDK</h1>
        </div>

        <form onSubmit={submitSmoke} className="smoke-form">
          <label>
            Customer
            <input
              value={form.customerName}
              onChange={(event) => setForm({ ...form, customerName: event.target.value })}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.customerEmail}
              onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="1"
              max="2"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
            />
          </label>
          <button type="submit" disabled={status === "running"}>
            {status === "running" ? "Running" : "Run smoke"}
          </button>
        </form>

        <div className={`result result-${status}`}>
          <strong>{status === "idle" ? "Ready" : status.toUpperCase()}</strong>
          {error ? <p>{error}</p> : null}
          {result ? (
            <dl>
              <div>
                <dt>API</dt>
                <dd>{result.metadataVersion}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{result.venueName}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{result.serviceName}</dd>
              </div>
              <div>
                <dt>Resources</dt>
                <dd>{result.resourceLabels.join(", ")}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{result.availableQuantity}</dd>
              </div>
              <div>
                <dt>Reservation</dt>
                <dd>{result.reservationId}</dd>
              </div>
              <div>
                <dt>Requests</dt>
                <dd>{result.observedRequestCount}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>
    </main>
  );
}
