# Movie Ticketing Consumer Demo

This demo is the second-domain proof for the modular booking platform. It should
show that the same backend contract can support a different booking experience
from the racing simulator app.

## Purpose

Prove that a frontend for movie ticketing can plug into the platform by changing
service/resource data and UI, not by rewriting backend reservation logic.

## Expected Integration

- Frontend calls `@reservation-platform/sdk` or public `/v1` routes.
- Backend owns screening/service catalog, availability, reservation creation,
  and persistence.
- Frontend config contains only:
  - platform backend URL,
  - optional tenant or venue identifiers,
  - movie-ticketing display settings.

## Suggested Demo Shape

- Services map to movie screenings or auditoriums.
- Resources map to seats, rows, or capacity buckets.
- Time slots map to screening start/end times.
- Booking confirmation uses the same reservation API response shape as other
  domains.

## Demo Flow

1. Start the backend platform using the repository dev runbook.
2. Open the movie ticketing frontend example.
3. Select a movie/screening service.
4. Select date, time, and seats.
5. Submit the booking through the SDK/API.
6. Confirm the booking exists through the backend platform route.

## Separation Evidence

The demo should prove that the movie frontend:

- does not import Supabase clients,
- does not own reservation conflict checks,
- does not define database migrations,
- uses the same backend contract as the racing simulator consumer.
