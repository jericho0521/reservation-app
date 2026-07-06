# Room Booking Example

Forkable room booking frontend powered by `@reservation-platform/ui`.

Edit `reservation.config.ts` for labels, theme, backend URL, and service id.

Required env:

```powershell
$env:NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL="http://localhost:4100"
$env:NEXT_PUBLIC_RESERVATION_SERVICE_ID="<room-service-id>"
pnpm --filter @reservation-platform/example-room-booking run dev
```

Safe locally: starts only the room frontend on port 4201.
