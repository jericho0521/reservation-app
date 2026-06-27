# Restaurant Reservation Frontend Demo

This branch is a frontend-only design demo for the modular reservation platform.
It uses mocked data only and is intentionally separated from the backend branch.

## Backend Boundary

- Backend source branch: platform/backend-modules
- Future integration target: /v1 HTTP API or @reservation-platform/sdk
- Browser-safe env placeholder: NEXT_PUBLIC_RESERVATION_PLATFORM_BASE_URL
- Do not add Supabase clients, service-role keys, database adapters, packages/, or pps/api.

## Frontend Design Handover

Design a polished first-screen restaurant reservation booking experience for:

table and party-size reservation flow

Required UI pieces:

- Party size, date, and time controls
- Dining area and table preference cards
- Capacity/table availability mock data
- Mock reservation summary with guest details placeholder

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