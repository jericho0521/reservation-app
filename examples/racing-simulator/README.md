# Racing Simulator Consumer Demo

This demo represents the first frontend consumer of the modular booking
platform. In the current repository, the production racing simulator frontend is
still the main Next.js app; this folder documents the target consumer proof for
final-year-project grading.

## Purpose

Prove that an assigned-resource frontend can use the reusable backend platform
without owning booking logic, Supabase queries, database migrations, or atomic
reservation RPCs.

## Expected Integration

- Frontend calls the platform through `@reservation-platform/sdk` or the public
  `/v1` HTTP API.
- Backend owns service catalog, availability, reservation creation, resource
  maintenance, and database access.
- Frontend config contains only:
  - platform backend URL,
  - optional tenant or venue identifiers,
  - display-specific UI settings.

## Demo Flow

1. Start the backend platform using the repository dev runbook.
2. Open the racing simulator booking frontend.
3. Select Racing Simulator.
4. Select a date and time slot.
5. Select a resource label such as `RS1`.
6. Submit the booking.
7. Confirm the booking is created through the backend platform route.

## Separation Evidence

The frontend must not:

- import Supabase admin clients,
- execute raw reservation SQL,
- call database RPCs directly,
- duplicate backend reservation conflict logic.

The backend/platform modules must own those responsibilities.
