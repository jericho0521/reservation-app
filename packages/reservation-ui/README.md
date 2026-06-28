# @reservation-platform/ui

Tailwind-ready booking components built on `@reservation-platform/react`.

This package is frontend-only. It talks to the backend through the SDK context
created by `ReservationProvider`; it does not import Supabase, database code, or
backend runtime modules.

## Usage

Import the package CSS once in your app root:

```tsx
import "@reservation-platform/ui/styles.css";
```

Then render the booking flow:

```tsx
import { BookingFlow } from "@reservation-platform/ui";

export function Page() {
  return (
    <BookingFlow
      baseUrl="http://localhost:4100"
      serviceId="service-id"
    />
  );
}
```

Tailwind is optional for consumers. The CSS file provides the baseline packaged
UI styles, while `theme` class overrides can still be used by Tailwind apps.
