# Racing Simulator Example

Forkable racing simulator frontend powered by `@reservation-platform/ui`.

Required env:

```powershell
$env:NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL="http://localhost:4100"
$env:NEXT_PUBLIC_RESERVATION_SERVICE_ID="<racing-service-id>"
pnpm --filter @reservation-platform/example-racing-simulator run dev
```

Safe locally: starts only the racing frontend on port 4202.
