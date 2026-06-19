import { runNextSdkSmoke } from "../src/sdkSmokeFlow";
import { ClientSmoke } from "./ClientSmoke";

export default async function Page() {
  const result = await runNextSdkSmoke({
    customerName: "Next External Page",
    customerEmail: "next-page@example.com",
    date: "2026-10-01",
    quantity: 2,
  });

  return (
    <main>
      <h1>Reservation Platform SDK Next Smoke</h1>
      <dl>
        <dt>API version</dt>
        <dd>{result.metadataVersion}</dd>
        <dt>Availability</dt>
        <dd>{result.availableQuantity}</dd>
        <dt>Reservation</dt>
        <dd>{result.reservationId}</dd>
        <dt>Direct parity</dt>
        <dd>{result.directParity}</dd>
      </dl>
      <ClientSmoke />
    </main>
  );
}
