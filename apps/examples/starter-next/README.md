# Starter Next Example

Frontend-only starter that consumes the modular booking platform through
`@reservation-platform/ui`.

Required env:

```powershell
$env:NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL="http://localhost:4100"
$env:NEXT_PUBLIC_RESERVATION_SERVICE_ID="<service-id>"
pnpm --filter @reservation-platform/example-starter-next run dev
```

Safe locally: starts only this frontend on port 4200. It does not start the
database or backend API.
