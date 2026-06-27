# Movie Ticketing Frontend Demo

This branch is a frontend-only design demo for the modular reservation platform.
It uses mocked data only and is intentionally separated from the backend branch.

## Backend Boundary

- Backend source branch: platform/backend-modules
- Future integration target: /v1 HTTP API or @reservation-platform/sdk
- Browser-safe env placeholder: NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL
- Do not add Supabase clients, service-role keys, database adapters, packages/, or pps/api.

## Frontend Design Handover

Design a polished first-screen movie ticketing booking experience for:

cinema showtime and assigned seat booking

Required UI pieces:

- Movie cards and showtime picker
- Screen indicator and cinema-style seat map
- Mock selected tickets and subtotal summary
- Assigned-seat booking state with no backend calls

The current app files are a handover scaffold. Replace the placeholder page with the finished mocked design while keeping the branch frontend-only.

## Run Locally

`powershell
corepack pnpm install
`

Safe: installs this standalone frontend branch's dependencies from the lockfile; it does not touch backend code or production data.

`powershell
corepack pnpm run dev
`

Safe: starts only this frontend demo on port 4000. Backend integration is not wired yet.

## Acceptance Criteria For The Design Agent

- The first screen looks like a real booking product, not a generic landing page.
- All data is mocked in frontend code.
- No backend package imports and no Supabase environment variables.
- Future backend integration is clearly reserved for /v1 or @reservation-platform/sdk.