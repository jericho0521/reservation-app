# Final demo environment

The deterministic seed supports three flagship experiences: Apex Racing Lab, Harbour Rooms, and Luma Appointments. It includes reservations, assigned resources, maintenance, unified web-chat and simulation conversations, and complete analytics funnel events.

## Validation-only mode

Run `pnpm demo:reset` and `pnpm demo:verify` with no database URL to validate the checked-in seed and readiness requirements without changing external state.

## Apply to a database

Prerequisites: PostgreSQL with migrations `000001` through `000020` applied, `psql` on `PATH` (or `PSQL_BIN` set), and a local or explicitly allowlisted disposable demo database.

```bash
FINAL_DEMO_DATABASE_URL=postgresql://user:password@localhost:5432/reservation_demo \
RESERVATION_DEMO_RESET_CONFIRM=RESET_FINAL_DEMO \
pnpm demo:reset

FINAL_DEMO_DATABASE_URL=postgresql://user:password@localhost:5432/reservation_demo \
pnpm demo:verify
```

Remote hosts are refused unless their exact lowercase hostname appears in the comma-separated `RESERVATION_DEMO_RESET_ALLOW_HOSTS`. Never point the reset at production. The reset deletes and recreates only rows owned by tenant `final_demo`.
