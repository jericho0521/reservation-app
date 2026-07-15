import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  buildSupabaseMigrationPlan,
  loadBundledCoreMigrationPlan,
  loadSupabaseMigrationIndex,
} from "./supabase-migrations";

const indexPath = new URL("../migrations/supabase/migration-index.json", import.meta.url);

test("core plan includes exactly 000001 through 000034 in order", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index);

  assert.deepEqual(
    plan.migrations.map((entry) => entry.path.split("/").at(-1)),
    [
      "000001_extensions.sql",
      "000002_platform_tenant_auth.sql",
      "000003_reservation_catalog.sql",
      "000004_reservation_resources.sql",
      "000005_reservation_bookings.sql",
      "000006_resource_maintenance.sql",
      "000007_availability_rules.sql",
      "000008_atomic_reservation_rpc.sql",
      "000009_core_rls_policies.sql",
      "000010_core_security_hardening.sql",
      "000011_platform_idempotency.sql",
      "000012_whatsapp_business_agent.sql",
      "000013_whatsapp_staff_takeover.sql",
      "000014_availability_snapshot_rpc.sql",
      "000015_experience_studio_foundation.sql",
      "000016_experience_availability_rules.sql",
      "000017_experience_knowledge.sql",
      "000018_reservation_management_tokens.sql",
      "000019_unified_conversations.sql",
      "000020_operations_analytics_rpc.sql",
      "000021_installation_auth.sql",
      "000022_password_reset.sql",
      "000023_venue_scoped_operations.sql",
      "000024_installation_business_onboarding.sql",
      "000025_availability_snapshot_venue_scope.sql",
      "000026_appointment_staff_timing.sql",
      "000027_staff_access_administration.sql",
      "000028_appointment_availability_management.sql",
      "000029_durable_jobs_notifications.sql",
      "000030_integration_secrets.sql",
      "000031_appointment_correctness_followup.sql",
      "000032_appointment_staff_operations.sql",
      "000033_appointment_notification_jobs.sql",
      "000034_channel_runtime.sql",
    ],
  );
  assert.equal(plan.migrations.length, 34);
  assert.equal(plan.seeds.length, 0);
});

test("channel runtime persists restart-safe proposals and service-role-only command state", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000034_channel_runtime.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create table public\.platform_conversation_booking_proposals/);
  assert.match(sql, /create table public\.platform_channel_commands/);
  assert.match(sql, /create table public\.platform_channel_outbox/);
  assert.match(sql, /create table public\.platform_whatsapp_pairing_state/);
  assert.match(sql, /claim_platform_conversation_booking_proposal[\s\S]*for update/);
  assert.match(sql, /expires_at <= now\(\)/);
  assert.match(sql, /reservation_id <> p_reservation_id/);
  assert.match(sql, /booking\.id = p_reservation_id[\s\S]*venue\.id = p_venue_id[\s\S]*venue\.tenant_id = p_tenant_id/);
  assert.match(sql, /revoke all on table public\.platform_channel_outbox from public, anon, authenticated, service_role/);
  assert.match(sql, /platform_append_whatsapp_automation_reply[\s\S]*append_platform_conversation_message[\s\S]*platform_channel_outbox[\s\S]*whatsapp\.deliver_outbound/);
  assert.match(sql, /platform_claim_whatsapp_outbox[\s\S]*status = 'sending'/);
  assert.match(sql, /platform_complete_whatsapp_outbox[\s\S]*delivery_state = 'sent'/);
  assert.match(sql, /platform_release_whatsapp_outbox[\s\S]*delivery_state = 'failed'/);
});

test("durable jobs use tenant-idempotent enqueue and exclusive leases", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000029_durable_jobs_notifications.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create table public\.platform_jobs/);
  assert.match(sql, /kind text not null check \(kind in \([\s\S]*'notification\.email'[\s\S]*'conversation\.process_ai'[\s\S]*\)\)/);
  assert.match(sql, /unique \(tenant_id, idempotency_key\)/);
  assert.match(sql, /create table public\.platform_notification_deliveries/);
  assert.match(sql, /create or replace function public\.claim_platform_jobs/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /leased_until/);
  assert.match(sql, /job\.lease_owner = p_worker_id\s+and job\.leased_until > now\(\)/);
  assert.match(sql, /revoke all on table public\.platform_jobs from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.claim_platform_jobs[^;]+to service_role/);
});

test("appointment notifications are transactionally enqueued and old reminders are superseded", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000033_appointment_notification_jobs.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create trigger platform_bookings_enqueue_notification_jobs/);
  assert.match(sql, /after insert or update of status, booking_date, start_time, end_time, staff_id/);
  assert.match(sql, /service\.booking_mode = 'appointment'/);
  assert.match(sql, /error_code = 'superseded'[\s\S]*reminder\.payload ->> 'kind' = 'appointment_reminder'/);
  assert.match(sql, /'expectedappointmentstart', v_occurrence_key/);
  assert.match(sql, /on conflict \(tenant_id, idempotency_key\) do nothing/);
  assert.match(sql, /create or replace function public\.platform_record_notification_attempt/);
  assert.match(sql, /attempts = platform_notification_deliveries\.attempts \+ 1/);
  assert.match(sql, /create or replace function public\.platform_record_notification_delivered/);
  assert.match(sql, /provider_message_id = left\(nullif\(p_provider_message_id/);
  assert.match(sql, /create or replace function public\.platform_record_notification_retry/);
  assert.match(sql, /final_failure_code = case when p_final then p_error_code else null end/);
});

test("integration settings store only versioned encrypted envelopes", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000030_integration_secrets.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create table public\.platform_integration_settings/);
  assert.match(sql, /create table public\.platform_integration_credentials/);
  assert.match(sql, /envelope->>'v' = '1'/);
  assert.match(sql, /envelope->>'alg' = 'aes-256-gcm'/);
  assert.match(sql, /revoke all on table public\.platform_integration_credentials from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /api_key|password text|secret text/);
});

test("appointment availability migration serializes practitioner writes and closes the legacy bypass", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000028_appointment_availability_management.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /alter function public\.create_reservation_atomic\(jsonb\)\s+rename to create_reservation_atomic_legacy/);
  assert.match(sql, /for update of staff, resource/);
  assert.match(sql, /existing\.staff_id = v_staff_id[\s\S]*make_interval\(mins => existing_service\.buffer_before_minutes\)[\s\S]*make_interval\(mins => v_service\.buffer_after_minutes\)/);
  assert.match(sql, /create or replace function public\.reschedule_managed_reservation\(\s*p_public_slug text,\s*p_token_hash text,\s*p_date date,\s*p_start_time time,\s*p_staff_id uuid/);
  assert.match(sql, /existing\.id <> v_booking\.id[\s\S]*existing\.staff_id = p_staff_id/);
  assert.match(sql, /resource_status', resource\.status/);
  assert.match(sql, /revoke all on function public\.create_reservation_atomic_legacy\(jsonb\) from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.create_reservation_atomic_legacy/);
});

test("appointment correctness follow-up keeps stable modes and self-excluding managed availability", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000031_appointment_correctness_followup.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /add column if not exists booking_mode text/);
  assert.match(sql, /platform_create_appointment_practitioner_resource/);
  assert.match(sql, /insert into public\.platform_staff_profiles/);
  assert.match(sql, /join public\.platform_staff_services as staff_service[\s\S]*staff_service\.service_id = service\.id/);
  assert.match(sql, /public\.platform_appointment_slot_is_allowed/);
  assert.match(sql, /existing\.id <> v_booking\.id/);
  assert.match(sql, /create or replace function public\.read_managed_reservation_availability_snapshot/);
  assert.match(sql, /where entry ->> 'id' <> v_booking_id::text/);
  assert.match(sql, /v_before := jsonb_build_object\([\s\S]*'date'[\s\S]*'staff_id'[\s\S]*'status'/);
  assert.doesNotMatch(sql, /v_before := to_jsonb\(v_booking\)/);
  assert.match(sql, /grant execute on function public\.read_managed_reservation_availability_snapshot\(text, text, date\) to service_role/);
});

test("staff access administration is tenant-safe, audited, and blocks placeholder activation", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000027_staff_access_administration.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /create or replace function public\.platform_list_staff\(p_tenant_id text\)/);
  assert.match(sql, /where staff\.tenant_id = p_tenant_id\s+and staff\.role = 'staff'/);
  assert.match(sql, /create or replace function public\.platform_update_staff_access/);
  assert.match(sql, /actor\.tenant_id = p_tenant_id[\s\S]*actor\.role = 'owner'[\s\S]*actor\.status = 'active'/);
  assert.match(sql, /candidate\.id = p_user_id\s+and candidate\.tenant_id = p_tenant_id\s+and candidate\.role = 'staff'/);
  assert.match(sql, /venue\.tenant_id = p_tenant_id/);
  assert.match(sql, /p_status = 'active' and target_user\.activated_at is null/);
  assert.match(sql, /target_user\.status = 'invited'[\s\S]*purpose = 'invitation'[\s\S]*consumed_at is null/);
  assert.match(sql, /updated_user\.status = 'disabled'[\s\S]*update public\.platform_sessions[\s\S]*set revoked_at = p_now/);
  assert.match(sql, /'staff\.invited'/);
  assert.match(sql, /'staff\.access\.updated'/);
  assert.match(sql, /revoke all on function public\.platform_update_staff_access[^;]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.platform_update_staff_access[^;]+to service_role/);
});

test("appointment staff migration creates tenant-safe profiles through atomic RPCs", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000026_appointment_staff_timing.sql", import.meta.url), "utf8")).toLowerCase();

  for (const column of [
    "duration_minutes integer not null default 60",
    "buffer_before_minutes integer not null default 0",
    "buffer_after_minutes integer not null default 0",
    "display_price numeric(12,2)",
    "currency text",
  ]) assert.match(sql, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /create table public\.platform_staff_profiles/);
  assert.match(sql, /create table public\.platform_staff_locations/);
  assert.match(sql, /create table public\.platform_staff_services/);
  assert.match(sql, /create or replace function public\.platform_create_staff_profile/);
  assert.match(sql, /insert into public\.reservable_resources[\s\S]*insert into public\.platform_staff_profiles/);
  assert.match(sql, /jsonb_build_object\([\s\S]*'platform_staff_id'/);
  assert.match(sql, /create trigger platform_validate_staff_location_scope/);
  assert.match(sql, /create trigger platform_validate_staff_service_scope/);
  assert.match(sql, /staff requires a location assignment/);
  assert.match(sql, /staff requires a service assignment/);
  assert.match(sql, /revoke all on function public\.platform_create_staff_profile[^;]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.platform_create_staff_profile[^;]+to service_role/);
});

test("appointment staff operations are actor-scoped, atomic, and PII-minimized", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000032_appointment_staff_operations.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /create or replace function public\.platform_staff_create_appointment/);
  assert.match(sql, /create or replace function public\.platform_transition_appointment/);
  assert.match(sql, /create or replace function public\.platform_staff_reschedule_appointment/);
  assert.match(sql, /actor\.tenant_id = p_tenant_id[\s\S]*actor\.role in \('owner', 'staff'\)/);
  assert.match(sql, /p_target_status in \('completed', 'cancelled', 'no_show'\)/);
  assert.match(sql, /p_target_status in \('cancelled', 'no_show'\)[\s\S]*reason_required/);
  assert.match(sql, /public\.create_reservation_atomic/);
  assert.match(sql, /'reservation\.staff_created'/);
  assert.match(sql, /'reservation\.staff_rescheduled'/);
  assert.match(sql, /'reservation\.status_changed'/);
  assert.doesNotMatch(sql, /v_before := to_jsonb\(v_booking\)/);
  assert.doesNotMatch(sql, /before_value[^;]*user_email/);
  assert.match(sql, /grant execute on function public\.platform_staff_create_appointment[^;]+to service_role/);
});

test("availability snapshot exposes its venue for application-layer scope enforcement", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000025_availability_snapshot_venue_scope.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /create or replace function public\.read_reservation_availability_snapshot/);
  assert.match(sql, /'venue_id', services\.venue_id/);
  assert.match(sql, /revoke all on function public\.read_reservation_availability_snapshot\(uuid, date\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.read_reservation_availability_snapshot\(uuid, date\) to service_role/);
});

test("installation business onboarding is atomic, appointment-specific, and service-role only", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000024_installation_business_onboarding.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create or replace function public\.platform_configure_installation_business/);
  assert.match(sql, /from public\.tenants tenant\s+where tenant\.id = p_tenant_id\s+for update/);
  assert.match(sql, /insert into public\.venues[\s\S]*insert into public\.platform_business_profiles/);
  assert.match(sql, /insert into public\.platform_experience_configurations/);
  assert.match(sql, /'appointments_salon'/);
  assert.match(sql, /'customer', 'client'/);
  assert.match(sql, /insert into public\.platform_availability_settings/);
  assert.match(sql, /insert into public\.platform_user_venue_assignments/);
  assert.match(sql, /pg_timezone_names/);
  assert.match(sql, /create unique index if not exists venues_tenant_name_key[\s\S]*tenant_id, lower\(name\)/);
  const existingDraftUpdate = sql.match(/if found then\s+update public\.platform_experience_configurations[\s\S]*?\n  else/)?.[0] ?? "";
  assert.match(existingDraftUpdate, /branding = coalesce\(v_draft\.branding/);
  assert.doesNotMatch(existingDraftUpdate, /terminology\s*=|channels\s*=/);
  assert.match(sql, /platform_list_installation_locations\(text, uuid\[\]\)/);
  assert.match(sql, /revoke all on function public\.platform_configure_installation_business[^;]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.platform_configure_installation_business[^;]+to service_role/);
});

test("bundled core migration loader returns every indexed path and checksum", async () => {
  const index = await readActualIndex();
  const plan = await loadBundledCoreMigrationPlan();

  assert.deepEqual(plan, index.coreMigrations.map(({ path, sha256 }) => ({ path, sha256 })));
  assert.equal(Object.isFrozen(plan), true);
});

test("bundled core migration loader follows an extended validated index", async (t) => {
  const rawIndex = await readActualRawIndex();
  rawIndex.coreMigrations.push({
    order: rawIndex.coreMigrations.length + 1,
    path: "packages/database/migrations/supabase/000035_runtime_readiness_test.sql",
    module: "core",
    scope: "reservation-platform",
    sha256: "a".repeat(64),
    bytes: 1,
  });
  const directory = await mkdtemp(join(tmpdir(), "reservation-migration-index-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const extendedIndexPath = join(directory, "migration-index.json");
  await writeFile(extendedIndexPath, JSON.stringify(rawIndex), "utf8");

  const plan = await loadBundledCoreMigrationPlan(pathToFileURL(extendedIndexPath));

  assert.equal(plan.length, 35);
  assert.deepEqual(plan.at(-1), {
    path: "packages/database/migrations/supabase/000035_runtime_readiness_test.sql",
    sha256: "a".repeat(64),
  });
});

test("operations overview migration is venue scoped, timezone aware, and bounded", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000020_operations_analytics_rpc.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create or replace function public\.read_platform_operations_overview/);
  assert.match(sql, /create or replace function public\.read_platform_analytics/);
  assert.match(sql, /booking\.confirmation_requested/);
  assert.match(sql, /p_include_simulation/);
  assert.match(sql, /add column if not exists cancellation_reason text/);
  assert.match(sql, /add column if not exists cancelled_by text/);
  assert.match(sql, /add column if not exists cancelled_at timestamptz/);
  assert.match(sql, /venues\.tenant_id = p_tenant_id and venues\.id = p_venue_id/);
  assert.match(sql, /p_now at time zone/);
  assert.match(sql, /limit 20/);
  assert.match(sql, /revoke all on function public\.read_platform_operations_overview/);
});

test("installation auth migration stores only hashed capabilities and restricts tables", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000021_installation_auth.sql", import.meta.url), "utf8")).toLowerCase();

  for (const table of [
    "platform_installation",
    "platform_users",
    "platform_user_venue_assignments",
    "platform_sessions",
    "platform_auth_tokens",
    "platform_audit_events",
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant [^;]+ on table public\\.${table} to service_role`));
  }
  assert.match(sql, /setup_token_hash text/);
  assert.match(sql, /token_hash text not null unique/);
  assert.doesNotMatch(sql, /setup_token\s+text|plaintext_token|raw_token/);
  assert.match(sql, /role text not null check \(role in \('owner', 'staff'\)\)/);
  assert.match(sql, /status text not null default 'active' check \(status in \('invited', 'active', 'disabled'\)\)/);
  assert.doesNotMatch(sql, /platform_enforce_user_venue_assignment_tenant/);
  assert.match(sql, /create table public\.platform_user_venue_assignments \([\s\S]*tenant_id text not null/);
  assert.match(sql, /foreign key \(tenant_id, user_id\)\s+references public\.platform_users \(tenant_id, id\) on delete cascade/);
  assert.equal(
    (sql.match(/foreign key \(tenant_id, venue_id\)\s+references public\.venues \(tenant_id, id\)/g) ?? []).length,
    2,
  );
  assert.match(sql, /foreign key \(tenant_id, actor_user_id\) references public\.platform_users \(tenant_id, id\)/);
  assert.match(sql, /create or replace function public\.platform_create_user/);
  assert.match(sql, /insert into public\.platform_users[\s\S]*insert into public\.platform_user_venue_assignments/);
  assert.match(sql, /revoke all on function public\.platform_create_user/);
  assert.match(sql, /grant execute on function public\.platform_create_user\(text, text, text, text, text, text, uuid\[\]\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.platform_create_user[^;]+to (?:public|anon|authenticated)/);
  assert.match(sql, /create or replace function public\.platform_create_first_owner/);
  assert.match(sql, /select candidate\.\* into installation[\s\S]*for update/);
  assert.match(sql, /insert into public\.platform_users[\s\S]*update public\.platform_installation/);
  assert.match(sql, /revoke all on function public\.platform_create_first_owner/);
  assert.match(sql, /grant execute on function public\.platform_create_first_owner\(text, timestamptz, text, text, text\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.platform_create_first_owner[^;]+to (?:public|anon|authenticated)/);
  assert.match(sql, /create or replace function public\.platform_create_staff_invitation/);
  assert.match(sql, /insert into public\.platform_auth_tokens[\s\S]*'invitation'/);
  assert.match(sql, /create or replace function public\.platform_accept_staff_invitation/);
  assert.match(sql, /for update of candidate, invited_user/);
  assert.match(sql, /set consumed_at = p_now/);
  assert.match(sql, /status = 'active'/);
  assert.match(sql, /grant execute on function public\.platform_create_staff_invitation\(text, text, text, text, text, timestamptz, uuid\[\]\) to service_role/);
  assert.match(sql, /grant execute on function public\.platform_accept_staff_invitation\(text, timestamptz, text, text\) to service_role/);
});

test("password reset migration consumes one hashed token and revokes existing sessions atomically", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000022_password_reset.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /create or replace function public\.platform_create_password_reset/);
  assert.match(sql, /insert into public\.platform_auth_tokens[\s\S]*'password_reset'/);
  assert.match(sql, /create or replace function public\.platform_complete_password_reset/);
  assert.match(sql, /candidate\.token_hash = p_token_hash/);
  assert.match(sql, /candidate\.consumed_at is null/);
  assert.match(sql, /candidate\.expires_at > p_now/);
  assert.match(sql, /update public\.platform_users[\s\S]*password_hash = p_password_hash/);
  assert.match(sql, /update public\.platform_auth_tokens[\s\S]*consumed_at = p_now/);
  assert.match(sql, /update public\.platform_sessions[\s\S]*revoked_at = p_now/);
  assert.match(sql, /revoke all on function public\.platform_complete_password_reset[^;]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.platform_complete_password_reset\(text, timestamptz, text\) to service_role/);
  assert.match(sql, /create or replace function public\.platform_create_session/);
  assert.match(sql, /where candidate\.id = p_user_id\s+for update/);
  assert.match(sql, /target_user\.password_hash <> p_expected_password_hash/);
  assert.match(sql, /insert into public\.platform_sessions/);
  assert.match(sql, /revoke all on function public\.platform_create_session\(uuid, text, text, timestamptz\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.platform_create_session\(uuid, text, text, timestamptz\) to service_role/);
  assert.doesNotMatch(sql, /plaintext_token|raw_token/);
});

test("authenticated operational mutations are venue-checked inside service-role RPC transactions", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000023_venue_scoped_operations.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /create or replace function public\.platform_create_scoped_reservation/);
  assert.match(sql, /where id = requested_service_id\s+and venue_id = p_venue_id\s+for share/);
  assert.match(sql, /return public\.create_reservation_atomic\(p_payload\)/);
  assert.match(sql, /create or replace function public\.platform_update_scoped_reservation/);
  assert.match(sql, /join public\.services as current_service[\s\S]*current_service\.venue_id = p_venue_id[\s\S]*for update of booking, current_service/);
  assert.match(sql, /target_service_id[\s\S]*and venue_id = p_venue_id\s+for share/);
  assert.match(sql, /create or replace function public\.platform_create_scoped_maintenance/);
  assert.match(sql, /create or replace function public\.platform_end_scoped_maintenance/);
  assert.match(sql, /join public\.services as scoped_service[\s\S]*scoped_service\.venue_id = p_venue_id[\s\S]*for update of candidate, scoped_service/);
  for (const signature of [
    "platform_create_scoped_reservation\\(uuid, jsonb\\)",
    "platform_update_scoped_reservation\\(uuid, uuid, jsonb\\)",
    "platform_create_scoped_maintenance\\(uuid, jsonb\\)",
    "platform_end_scoped_maintenance\\(uuid, uuid, text\\)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
});

test("experience availability migration owns normalized rules and shared snapshot integration", async () => {
  const sql = await readFile(new URL("../migrations/supabase/000016_experience_availability_rules.sql", import.meta.url), "utf8");

  for (const expected of [
    "create table if not exists public.platform_availability_settings",
    "create table if not exists public.platform_operating_intervals",
    "create table if not exists public.platform_date_closures",
    "create or replace function public.replace_experience_operating_hours",
    "prevent_platform_operating_interval_overlap",
    "create or replace function public.read_reservation_availability_snapshot",
    "'operating_hours'",
  ]) {
    assert.match(sql.toLowerCase(), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("experience knowledge migration is scoped, bounded, archival, and service-role only", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000017_experience_knowledge.sql", import.meta.url), "utf8")).toLowerCase();

  assert.match(sql, /create table if not exists public\.platform_experience_knowledge/);
  assert.match(sql, /foreign key \(tenant_id, venue_id\) references public\.venues\(tenant_id, id\)/);
  assert.match(sql, /status text not null default 'active' check \(status in \('active', 'archived'\)\)/);
  assert.match(sql, /revoke all on table public\.platform_experience_knowledge from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update on table public\.platform_experience_knowledge to service_role/);
  assert.doesNotMatch(sql, /grant .*delete.*platform_experience_knowledge/);
  assert.doesNotMatch(sql, /grant select .* to anon|grant select .* to authenticated/);
});

test("reservation management migration hashes tokens and scopes read/cancel by public slug", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000018_reservation_management_tokens.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /token_hash text not null unique/);
  assert.doesNotMatch(sql, /token_plaintext|raw_token/);
  assert.match(sql, /create or replace function public\.read_managed_reservation/);
  assert.match(sql, /create or replace function public\.cancel_managed_reservation/);
  assert.match(sql, /profiles\.public_slug = lower\(trim\(p_public_slug\)\)/);
  assert.match(sql, /v_token\.expires_at <= now\(\)/);
  assert.match(sql, /v_starts_at <= now\(\)/);
  assert.match(sql, /revocation_reason = 'cancelled'/);
  assert.match(sql, /revoke all on table public\.platform_reservation_management_tokens from public, anon, authenticated/);
});

test("unified conversation migration scopes channels, deduplicates messages, and protects identifiers", async () => {
  const sql = (await readFile(new URL("../migrations/supabase/000019_unified_conversations.sql", import.meta.url), "utf8")).toLowerCase();
  assert.match(sql, /create table if not exists public\.platform_conversations/);
  assert.match(sql, /create table if not exists public\.platform_conversation_participants/);
  assert.match(sql, /channel_identifier text/);
  assert.match(sql, /identifier_hash text/);
  assert.match(sql, /create table if not exists public\.platform_conversation_messages/);
  assert.match(sql, /unique index[\s\S]*\(conversation_id, channel, external_message_id\)/);
  assert.match(sql, /create or replace function public\.append_platform_conversation_message/);
  assert.match(sql, /automation_state text not null default 'automated'/);
  assert.match(sql, /revoke all on table public\.platform_conversation_participants from public, anon, authenticated/);
});

test("default plan excludes optional AI retrieval and development seed entries", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index);

  assert.equal(plan.entries.some((entry) => entry.module === "ai-retrieval"), false);
  assert.equal(plan.entries.some((entry) => entry.module === "development-seed"), false);
});

test("AI retrieval option appends optional AI retrieval migrations after core migrations", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index, { includeAiRetrieval: true });

  assert.deepEqual(
    plan.migrations.slice(index.coreMigrations.length).map((entry) => entry.path),
    [
      "packages/database/migrations/supabase/optional/ai-retrieval/000001_knowledge_chunks.sql",
      "packages/database/migrations/supabase/optional/ai-retrieval/000002_langchain_checkpoints.sql",
      "packages/database/migrations/supabase/optional/ai-retrieval/000003_match_knowledge_security.sql",
    ],
  );
  assert.equal(plan.seeds.length, 0);
});

test("development seed option keeps seed entries separate and after migrations", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index, { includeDevelopmentSeeds: true });

  assert.deepEqual(
    plan.seeds.map((entry) => entry.path),
    ["packages/database/seeds/development/project-play-compat.sql"],
  );
  assert.deepEqual(plan.entries.slice(-1), plan.seeds);
});

test("plan arrays are frozen copies and do not expose index array references", async () => {
  const index = await readActualIndex();
  const plan = buildSupabaseMigrationPlan(index, {
    includeAiRetrieval: true,
    includeDevelopmentSeeds: true,
  });

  assert.equal(Object.isFrozen(index.coreMigrations), true);
  assert.equal(Object.isFrozen(index.optionalMigrations), true);
  assert.equal(Object.isFrozen(index.developmentSeeds), true);
  assert.equal(Object.isFrozen(plan.migrations), true);
  assert.equal(Object.isFrozen(plan.seeds), true);
  assert.equal(Object.isFrozen(plan.entries), true);
  assert.notEqual(plan.seeds, index.developmentSeeds);
  assert.notEqual(plan.migrations, index.coreMigrations);
});

test("validation fails for duplicate core order", async () => {
  const rawIndex = await readActualRawIndex();
  rawIndex.coreMigrations[1] = {
    ...rawIndex.coreMigrations[1],
    order: rawIndex.coreMigrations[0].order,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /duplicate core migration order: 1/,
  );
});

test("validation fails for shuffled or gapped core order", async () => {
  const shuffledIndex = await readActualRawIndex();
  const firstOrder = shuffledIndex.coreMigrations[0].order;
  shuffledIndex.coreMigrations[0] = {
    ...shuffledIndex.coreMigrations[0],
    order: shuffledIndex.coreMigrations[1].order,
  };
  shuffledIndex.coreMigrations[1] = {
    ...shuffledIndex.coreMigrations[1],
    order: firstOrder,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(shuffledIndex),
    /core migration order must be contiguous and sorted from 1/,
  );

  const gappedIndex = await readActualRawIndex();
  gappedIndex.coreMigrations[1] = {
    ...gappedIndex.coreMigrations[1],
    order: 20,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(gappedIndex),
    /core migration order must be contiguous and sorted from 1/,
  );
});

test("validation fails for shuffled optional AI migration paths", async () => {
  const rawIndex = await readActualRawIndex();
  const firstOptional = rawIndex.optionalMigrations[0];
  rawIndex.optionalMigrations[0] = rawIndex.optionalMigrations[1];
  rawIndex.optionalMigrations[1] = firstOptional;

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /optional migration paths must be contiguous and sorted from 000001/,
  );
});

test("validation fails for duplicate path", async () => {
  const rawIndex = await readActualRawIndex();
  rawIndex.coreMigrations[1] = {
    ...rawIndex.coreMigrations[1],
    path: rawIndex.coreMigrations[0].path,
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /duplicate migration index path:/,
  );
});

test("validation fails for missing required entry fields", async () => {
  const rawIndex = await readActualRawIndex();
  delete rawIndex.coreMigrations[0].sha256;

  assert.throws(
    () => loadSupabaseMigrationIndex(rawIndex),
    /coreMigrations\[0\]\.sha256 is required/,
  );
});

test("validation fails for unsafe paths and weak checksums", async () => {
  const unsafePathIndex = await readActualRawIndex();
  unsafePathIndex.optionalMigrations[0] = {
    ...unsafePathIndex.optionalMigrations[0],
    path: "../outside.sql",
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(unsafePathIndex),
    /optionalMigrations\[0\]\.path must be a package-relative SQL path/,
  );

  const wrongScopeIndex = await readActualRawIndex();
  wrongScopeIndex.developmentSeeds[0] = {
    ...wrongScopeIndex.developmentSeeds[0],
    path: "packages/database/migrations/supabase/000012_seed.sql",
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(wrongScopeIndex),
    /developmentSeeds\[0\]\.path must point to a development seed SQL file/,
  );

  const weakChecksumIndex = await readActualRawIndex();
  weakChecksumIndex.coreMigrations[0] = {
    ...weakChecksumIndex.coreMigrations[0],
    sha256: "not-a-checksum",
  };

  assert.throws(
    () => loadSupabaseMigrationIndex(weakChecksumIndex),
    /coreMigrations\[0\]\.sha256 must be a lowercase 64-character sha256 hex digest/,
  );
});

async function readActualIndex() {
  return loadSupabaseMigrationIndex(await readActualRawIndex());
}

async function readActualRawIndex(): Promise<any> {
  return JSON.parse(await readFile(indexPath, "utf8"));
}
