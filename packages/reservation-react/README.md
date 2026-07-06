# @reservation-platform/react

Headless React provider and hooks for frontend apps that consume the
reservation platform API through `@reservation-platform/sdk`.

This package is frontend-safe: it does not import Supabase, database adapters,
Next.js, or backend-only modules.

Use `ReservationProvider` when building custom booking screens:

```tsx
import { ReservationProvider, useBookingFlow } from "@reservation-platform/react";

function CustomBooking() {
  const flow = useBookingFlow({ serviceId: "service-id" });
  return <button disabled={!flow.validation.isValid}>Book</button>;
}

export function Page() {
  return (
    <ReservationProvider baseUrl="http://localhost:4100">
      <CustomBooking />
    </ReservationProvider>
  );
}
```
