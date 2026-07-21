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

Then create a config and render the booking flow:

```tsx
// reservation.config.ts
import { createBookingFlowConfig } from "@reservation-platform/ui";

export default createBookingFlowConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL,
  serviceId: process.env.NEXT_PUBLIC_RESERVATION_SERVICE_ID,
  labels: {
    resource: "Room",
    quantity: "Attendees",
  },
  theme: {
    brandName: "Room Booking",
  },
});
```

```tsx
// app/page.tsx
import { BookingFlow } from "@reservation-platform/ui";
import config from "../reservation.config";

export function Page() {
  return <BookingFlow {...config.booking} />;
}
```

Tailwind is optional for consumers. The CSS file provides the baseline packaged
UI styles, while `theme` class overrides can still be used by Tailwind apps.

## Visual presets

Industry presets configure booking rules and terminology. Visual presets are a
separate UI concern. The current design is exported as `editorial` and remains
the default when `visualPreset` is omitted:

```ts
const config = createBookingFlowConfig({
  apiBaseUrl: "https://booking.example.com",
  serviceId: "service-id",
  visualPreset: "editorial",
});
```

Theme class overrides are applied after the selected visual preset. Additional
visual designs can be added to the typed registry without changing reservation
or industry-preset contracts.

`BookingFlow` renders a setup error when the backend URL or service id is
missing. If you wrap components in your own `ReservationProvider`, pass
`useExistingProvider`.
