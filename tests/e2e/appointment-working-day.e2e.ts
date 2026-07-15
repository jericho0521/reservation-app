import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("appointment staff operations execute atomically against PostgreSQL and write audit events", (context) => {
  const fixture = appointmentDatabaseFixture();
  if (!fixture) {
    context.skip("Set RESERVATION_APPOINTMENT_E2E_DATABASE_URL, TENANT_ID, VENUE_ID, ACTOR_USER_ID, BOOKING_ID, STAFF_ID, SERVICE_ID, DATE, START_TIME, and END_TIME to run the dedicated PostgreSQL proof.");
    return;
  }

  const variables = [
    "--set", `tenant_id=${fixture.tenantId}`,
    "--set", `venue_id=${fixture.venueId}`,
    "--set", `actor_user_id=${fixture.actorUserId}`,
    "--set", `booking_id=${fixture.bookingId}`,
    "--set", `staff_id=${fixture.staffId}`,
    "--set", `service_id=${fixture.serviceId}`,
    "--set", `appointment_date=${fixture.date}`,
    "--set", `start_time=${fixture.startTime}`,
    "--set", `end_time=${fixture.endTime}`,
  ];

  runProof(fixture.databaseUrl, variables, `
    begin;
    with operated as (
      select public.platform_staff_create_appointment(
        :'tenant_id', :'venue_id'::uuid, :'actor_user_id'::uuid,
        jsonb_build_object(
          'service_id', :'service_id', 'staff_id', :'staff_id',
          'booking_date', :'appointment_date', 'start_time', :'start_time', 'end_time', :'end_time',
          'user_name', 'Database E2E Customer', 'user_email', 'database-e2e@example.invalid',
          'user_phone', 'unknown', 'seats_booked', 1, 'interface_type', 'form'
        )
      ) as result
    )
    select jsonb_build_object(
      'result', result,
      'audit_count', (select count(*) from public.platform_audit_events
        where action = 'reservation.staff_created' and entity_id = result -> 'booking' ->> 'id')
    ) from operated;
    rollback;
  `);

  runProof(fixture.databaseUrl, variables, `
    begin;
    with operated as (
      select public.platform_staff_reschedule_appointment(
        :'tenant_id', :'venue_id'::uuid, :'actor_user_id'::uuid, :'booking_id'::uuid,
        'confirmed', :'appointment_date'::date, :'start_time'::time, :'staff_id'::uuid,
        'Dedicated database E2E reschedule'
      ) as result
    )
    select jsonb_build_object(
      'result', result,
      'audit_count', (select count(*) from public.platform_audit_events
        where action = 'reservation.staff_rescheduled' and entity_id = :'booking_id')
    ) from operated;
    rollback;
  `);

  runProof(fixture.databaseUrl, variables, `
    begin;
    with operated as (
      select public.platform_transition_appointment(
        :'tenant_id', :'venue_id'::uuid, :'actor_user_id'::uuid, :'booking_id'::uuid,
        'confirmed', 'no_show', 'Dedicated database E2E no-show'
      ) as result
    )
    select jsonb_build_object(
      'result', result,
      'audit_count', (select count(*) from public.platform_audit_events
        where action = 'reservation.status_changed' and entity_id = :'booking_id')
    ) from operated;
    rollback;
  `);
});

function runProof(databaseUrl: string, variables: string[], sql: string) {
  const result = spawnSync(
    process.env.PSQL_BIN?.trim() || "psql",
    [databaseUrl, "--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", ...variables, "--command", sql],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || "PostgreSQL appointment proof failed.");
  assert.match(result.stdout, /"ok": true/u);
  assert.match(result.stdout, /"audit_count": 1/u);
}

function appointmentDatabaseFixture() {
  const read = (name: string) => process.env[`RESERVATION_APPOINTMENT_E2E_${name}`]?.trim();
  const values = {
    databaseUrl: read("DATABASE_URL"), tenantId: read("TENANT_ID"), venueId: read("VENUE_ID"),
    actorUserId: read("ACTOR_USER_ID"), bookingId: read("BOOKING_ID"), staffId: read("STAFF_ID"),
    serviceId: read("SERVICE_ID"), date: read("DATE"), startTime: read("START_TIME"), endTime: read("END_TIME"),
  };
  return Object.values(values).every(Boolean) ? values as Record<keyof typeof values, string> : null;
}
