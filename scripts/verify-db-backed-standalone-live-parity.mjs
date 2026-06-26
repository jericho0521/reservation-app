#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

import {
  databaseLiveDockerContainerEnvName,
  loadMigrationProofPlan,
  readLiveDatabaseConfig,
  resolvePsqlCommand,
  runDatabaseBehaviorProof,
  runPsqlPlan,
} from "./verify-database-live-proof.mjs";

const strict = process.argv.includes("--strict")
  || process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_STRICT === "1";
export const dbBackedStandaloneLiveParityStrictEnvName = "RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_STRICT";
export const serviceApiKey = process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_API_KEY?.trim()
  || "db-backed-standalone-proof-key";
export const tenantId = process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_TENANT_ID?.trim()
  || "db-backed-proof-tenant";
export const serviceId = process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_SERVICE_ID?.trim()
  || "10000000-0000-4000-8000-000000000101";
export const resourceId = process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_RESOURCE_ID?.trim()
  || "10000000-0000-4000-8000-000000000201";
export const startAt = process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_START_AT?.trim()
  || "2030-01-02T12:00:00.000Z";
export const endAt = process.env.RESERVATION_DB_BACKED_STANDALONE_LIVE_PARITY_END_AT?.trim()
  || "2030-01-02T13:00:00.000Z";

function fail(message) {
  console.error(`FAILED DB-backed standalone live parity proof: ${message}`);
  process.exitCode = 1;
}

function skip(message) {
  console.log(`SKIPPED DB-backed standalone live parity proof: ${message}`);
}

export function readDbBackedStandaloneLiveParityProofConfig(env, argv = []) {
  const parsed = readLiveDatabaseConfig(env, argv);
  const strictConfig = argv.includes("--strict") || env[dbBackedStandaloneLiveParityStrictEnvName] === "1";
  const errors = [...parsed.errors];
  const ready = parsed.ready && errors.length === 0;
  const status = errors.length > 0
    ? (strictConfig ? "fail" : "skip")
    : ready
      ? "ready"
      : (strictConfig ? "fail" : "skip");
  let message = "";

  if (errors.length > 0) {
    message = errors.join(" ");
  } else if (!ready) {
    const details = [
      `missing ${parsed.missing.join(", ")}`,
      parsed.configured.length > 0
        ? `configured ${parsed.configured.join(", ")}`
        : "no live database env configured",
    ].join("; ");
    message = `required DB-backed standalone live parity proof config is incomplete: ${details}.`;
  }

  return {
    status,
    ready,
    shouldSkip: status === "skip",
    shouldFail: status === "fail",
    message,
    missing: parsed.missing,
    configured: parsed.configured,
    errors,
  };
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlUuid(value) {
  return `${sqlString(value)}::uuid`;
}

function dateFromIso(value) {
  return value.slice(0, 10);
}

function timeFromIso(value) {
  return value.slice(11, 16);
}

export class PsqlJsonClient {
  constructor(config) {
    this.config = config;
  }

  async exec(sql) {
    await this.run(["-v", "ON_ERROR_STOP=1", "-f", "-"], sql, { inherit: true });
  }

  async json(sql) {
    const output = await this.run(["-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql], undefined, {
      inherit: false,
    });
    const text = output.trim();
    return text.length > 0 ? JSON.parse(text) : null;
  }

  async run(args, stdin, options) {
    const command = this.config.dockerContainer ? "docker" : this.config.psqlCommand;
    const commandArgs = this.config.dockerContainer
      ? ["exec", "-i", this.config.dockerContainer, "psql", this.config.databaseUrl, ...args]
      : [this.config.databaseUrl, ...args];

    return new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        stdio: options.inherit ? ["pipe", "inherit", "inherit"] : ["pipe", "pipe", "pipe"],
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(`${command} exited with ${signal ?? code}${stderr ? `: ${stderr}` : ""}`));
      });
      child.stdin.end(stdin);
    });
  }
}

function selectJsonArraySql(innerSql) {
  return `select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb)::text from (${innerSql}) rows`;
}

function selectJsonObjectSql(innerSql) {
  return `select coalesce((select to_jsonb(row) from (${innerSql}) row), 'null'::jsonb)::text`;
}

export async function seedProofData(client) {
  const date = dateFromIso(startAt);
  const startTime = timeFromIso(startAt);
  const endTime = timeFromIso(endAt);
  await client.exec(`
insert into public.services (
  id,
  name,
  description,
  total_seats,
  resource_kind,
  selection_mode,
  reservation_policy,
  metadata
)
values (
  ${sqlUuid(serviceId)},
  'DB Backed Standalone Proof Service',
  'Disposable service for DB-backed standalone SDK/direct parity proof.',
  1,
  'station',
  'assigned_resource',
  '{"kind":"assigned_resource","selection_mode":"assigned_resource","max_quantity":1,"require_resource_labels":true,"allow_partial_capacity":false}'::jsonb,
  '{"proof":"db-backed-standalone-live-parity"}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  total_seats = excluded.total_seats,
  resource_kind = excluded.resource_kind,
  selection_mode = excluded.selection_mode,
  reservation_policy = excluded.reservation_policy,
  metadata = excluded.metadata;

insert into public.resource_layouts (
  id,
  service_id,
  name,
  layout_kind,
  metadata,
  is_active
)
values (
  '10000000-0000-4000-8000-000000000301'::uuid,
  ${sqlUuid(serviceId)},
  'DB Backed Standalone Proof Layout',
  'grid',
  '{"columns":1,"rows":1,"resources":[{"resource_id":"${resourceId}","label":"Proof Station 1","row":1,"column":1}]}'::jsonb,
  true
)
on conflict (id) do update set
  service_id = excluded.service_id,
  name = excluded.name,
  layout_kind = excluded.layout_kind,
  metadata = excluded.metadata,
  is_active = excluded.is_active;

insert into public.reservable_resources (
  id,
  service_id,
  layout_id,
  label,
  resource_kind,
  capacity,
  sort_order,
  status,
  metadata
)
values (
  ${sqlUuid(resourceId)},
  ${sqlUuid(serviceId)},
  '10000000-0000-4000-8000-000000000301'::uuid,
  'Proof Station 1',
  'station',
  1,
  1,
  'available',
  '{"proof":"db-backed-standalone-live-parity"}'::jsonb
)
on conflict (id) do update set
  service_id = excluded.service_id,
  layout_id = excluded.layout_id,
  label = excluded.label,
  resource_kind = excluded.resource_kind,
  capacity = excluded.capacity,
  sort_order = excluded.sort_order,
  status = excluded.status,
  metadata = excluded.metadata;

delete from public.service_seat_maintenance
where service_id = ${sqlUuid(serviceId)};

delete from public.reservation_items
where service_id = ${sqlUuid(serviceId)};

delete from public.bookings
where service_id = ${sqlUuid(serviceId)}
  and (
    user_email like '%db-backed-standalone-proof.example.invalid'
    or user_email = 'seeded-db-backed-standalone-proof@example.invalid'
  );

insert into public.bookings (
  id,
  service_id,
  user_name,
  user_email,
  user_phone,
  booking_date,
  start_time,
  end_time,
  seats_booked,
  seat_labels,
  status,
  interface_type
)
values (
  '20000000-0000-4000-8000-000000000101'::uuid,
  ${sqlUuid(serviceId)},
  'Seeded DB Backed Standalone Proof',
  'seeded-db-backed-standalone-proof@example.invalid',
  '000',
  ${sqlString(date)}::date,
  ${sqlString(startTime)}::time,
  ${sqlString(endTime)}::time,
  1,
  array['Proof Station 1'],
  'confirmed',
  'form'
)
on conflict (id) do update set
  service_id = excluded.service_id,
  user_name = excluded.user_name,
  user_email = excluded.user_email,
  user_phone = excluded.user_phone,
  booking_date = excluded.booking_date,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  seats_booked = excluded.seats_booked,
  seat_labels = excluded.seat_labels,
  status = excluded.status,
  interface_type = excluded.interface_type;

insert into public.reservation_items (
  booking_id,
  service_id,
  resource_id,
  resource_label,
  quantity,
  metadata
)
values (
  '20000000-0000-4000-8000-000000000101'::uuid,
  ${sqlUuid(serviceId)},
  ${sqlUuid(resourceId)},
  'Proof Station 1',
  1,
  '{"proof":"db-backed-standalone-live-parity","seeded":true}'::jsonb
)
on conflict do nothing;
`);
}

function normalizeService(row) {
  if (!row) {
    return null;
  }
  const resources = Array.isArray(row.resources)
    ? row.resources.map((resource) => ({
        id: resource.id,
        service_id: resource.service_id,
        label: resource.label,
        kind: resource.kind ?? resource.resource_kind ?? "station",
        is_active: resource.is_active ?? resource.status !== "inactive",
        capacity: resource.capacity,
        metadata: resource.metadata ?? {},
      }))
    : [];
  const reservationPolicy = row.reservation_policy ?? {
    kind: "assigned_resource",
    selection_mode: "assigned_resource",
    max_quantity: row.total_seats ?? 1,
    require_resource_labels: true,
    allow_partial_capacity: false,
  };
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    resource_kind: row.resource_kind ?? "station",
    selection_mode: row.selection_mode ?? "assigned_resource",
    policy: reservationPolicy,
    reservation_policy: reservationPolicy,
    layout: row.layout ?? { kind: "none" },
    resources,
    total_seats: row.total_seats ?? (resources.length || 1),
    created_at: row.created_at,
  };
}

function normalizeBooking(row) {
  if (!row) {
    return null;
  }
  const items = Array.isArray(row.reservation_items)
    ? row.reservation_items.map((item) => ({
        ...(item.resource_id ? { resource_id: item.resource_id } : {}),
        ...(item.resource_label ? { resource_label: item.resource_label } : {}),
        quantity: item.quantity ?? 1,
      }))
    : [];
  return {
    ...row,
    booking_date: row.booking_date?.slice(0, 10) ?? row.booking_date,
    start_time: row.start_time?.slice(0, 5) ?? row.start_time,
    end_time: row.end_time?.slice(0, 5) ?? row.end_time,
    items,
  };
}

export function createDbBackedRepositories(client) {
  const getServiceRow = async (id) => client.json(selectJsonObjectSql(`
select
  services.*,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', resources.id,
      'service_id', resources.service_id,
      'label', resources.label,
      'kind', resources.resource_kind,
      'resource_kind', resources.resource_kind,
      'is_active', resources.status = 'available',
      'capacity', resources.capacity,
      'metadata', resources.metadata
    ) order by resources.sort_order), '[]'::jsonb)
    from public.reservable_resources resources
    where resources.service_id = services.id
  ) as resources,
  (
    select jsonb_build_object(
      'id', layouts.id,
      'service_id', layouts.service_id,
      'layout_kind', layouts.layout_kind,
      'kind', layouts.layout_kind,
      'metadata', layouts.metadata
    )
    from public.resource_layouts layouts
    where layouts.service_id = services.id
      and layouts.is_active is true
    order by layouts.created_at desc
    limit 1
  ) as layout
from public.services services
where services.id = ${sqlUuid(id)}
limit 1
`));

  const listBookingsSql = `
select
  bookings.*,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'resource_id', items.resource_id,
      'resource_label', items.resource_label,
      'quantity', items.quantity
    ) order by items.created_at), '[]'::jsonb)
    from public.reservation_items items
    where items.booking_id = bookings.id
  ) as reservation_items,
  jsonb_build_object('name', services.name) as services
from public.bookings bookings
left join public.services services on services.id = bookings.service_id
`;

  return {
    catalogRepository: {
      listVenues: async () => ({ data: await client.json(selectJsonArraySql("select * from public.venues order by name")), error: null }),
      getVenue: async (id) => ({ data: await client.json(selectJsonObjectSql(`select * from public.venues where id = ${sqlUuid(id)} limit 1`)), error: null }),
      listServices: async () => ({ data: await client.json(selectJsonArraySql("select * from public.services order by name")), error: null }),
      getService: async (id) => ({ data: await getServiceRow(id), error: null }),
      listResources: async (input = {}) => ({
        data: await client.json(selectJsonArraySql(`
select
  id,
  service_id,
  label,
  resource_kind as kind,
  status = 'available' as is_active,
  capacity,
  metadata
from public.reservable_resources
where (${input.serviceId ? `service_id = ${sqlUuid(input.serviceId)}` : "true"})
order by sort_order, label
`)),
        error: null,
      }),
      getResource: async (id) => ({
        data: await client.json(selectJsonObjectSql(`
select
  id,
  service_id,
  label,
  resource_kind as kind,
  status = 'available' as is_active,
  capacity,
  metadata
from public.reservable_resources
where id = ${sqlUuid(id)}
limit 1
`)),
        error: null,
      }),
      getResourceLayout: async (id) => ({
        data: await client.json(selectJsonObjectSql("select * from public.resource_layouts where id = " + sqlUuid(id) + " limit 1")),
        error: null,
      }),
    },

    availabilityRepository: {
      async readAvailability({ serviceId: requestedServiceId, date }) {
        const service = normalizeService(await getServiceRow(requestedServiceId));
        if (!service) {
          throw Object.assign(new Error("Service not found"), { status: 404 });
        }
        const bookings = (await client.json(selectJsonArraySql(`
${listBookingsSql}
where bookings.service_id = ${sqlUuid(requestedServiceId)}
  and bookings.booking_date = ${sqlString(date)}::date
  and bookings.status = 'confirmed'
order by bookings.created_at
`))).map(normalizeBooking);
        const maintenanceRows = await client.json(selectJsonArraySql(`
select seat_label
from public.service_seat_maintenance
where service_id = ${sqlUuid(requestedServiceId)}
  and is_active is true
order by seat_label
`));
        return {
          service,
          bookings,
          maintenanceResourceLabels: maintenanceRows.map((row) => row.seat_label).filter(Boolean),
        };
      },
    },

    reservationReadRepository: {
      async listReservations() {
        return {
          data: (await client.json(selectJsonArraySql(`${listBookingsSql} order by bookings.booking_date desc, bookings.created_at desc`))).map(normalizeBooking),
          error: null,
        };
      },
      async getReservationsSummary({ today }) {
        const row = await client.json(selectJsonObjectSql(`
select
  count(*)::int as total_reservations,
  count(*) filter (where booking_date = ${sqlString(today)}::date)::int as today_reservations,
  count(*) filter (where status = 'confirmed')::int as upcoming_reservations
from public.bookings
`));
        return {
          data: {
            total: row?.total_reservations ?? 0,
            today: row?.today_reservations ?? 0,
            upcoming: row?.upcoming_reservations ?? 0,
          },
          error: null,
        };
      },
      async readReservationById(reservationId) {
        return {
          data: normalizeBooking(await client.json(selectJsonObjectSql(`
${listBookingsSql}
where bookings.id = ${sqlUuid(reservationId)}
limit 1
`))),
          error: null,
        };
      },
    },

    reservationCreateRepository: {
      async createReservationAtomic({ reservation }) {
        const bookingId = randomUUID();
        const firstItem = reservation.items?.[0] ?? {};
        const resourceRow = firstItem.resource_id
          ? await client.json(selectJsonObjectSql(`select label from public.reservable_resources where id = ${sqlUuid(firstItem.resource_id)} limit 1`))
          : null;
        const resourceLabel = firstItem.resource_label ?? resourceRow?.label ?? reservation.seat_labels?.[0] ?? null;
        await client.exec(`
insert into public.bookings (
  id,
  service_id,
  user_name,
  user_email,
  user_phone,
  booking_date,
  start_time,
  end_time,
  seats_booked,
  seat_labels,
  status,
  interface_type
)
values (
  ${sqlUuid(bookingId)},
  ${sqlUuid(reservation.service_id)},
  ${sqlString(reservation.customer_name)},
  ${sqlString(reservation.customer_email)},
  ${sqlString(reservation.customer_phone ?? null)},
  ${sqlString(reservation.booking_date)}::date,
  ${sqlString(reservation.start_time)}::time,
  ${sqlString(reservation.end_time)}::time,
  ${Number.isFinite(reservation.quantity) ? reservation.quantity : 1},
  array[${sqlString(resourceLabel ?? "Proof Station 1")}],
  'confirmed',
  ${sqlString(reservation.interface_type ?? "form")}
);

insert into public.reservation_items (
  booking_id,
  service_id,
  resource_id,
  resource_label,
  quantity,
  metadata
)
values (
  ${sqlUuid(bookingId)},
  ${sqlUuid(reservation.service_id)},
  ${firstItem.resource_id ? sqlUuid(firstItem.resource_id) : "null"},
  ${sqlString(resourceLabel)},
  ${Number.isFinite(firstItem.quantity) ? firstItem.quantity : 1},
  '{"proof":"db-backed-standalone-live-parity"}'::jsonb
);
`);
        const booking = normalizeBooking(await client.json(selectJsonObjectSql(`${listBookingsSql} where bookings.id = ${sqlUuid(bookingId)} limit 1`)));
        return {
          ok: true,
          atomic: true,
          booking,
          reservation,
          validation: { ok: true },
        };
      },
    },

    reservationMutationRepository: {
      async updateReservation({ reservationId, patch }) {
        const updates = [];
        if (patch.user_name) updates.push(`user_name = ${sqlString(patch.user_name)}`);
        if (patch.user_email) updates.push(`user_email = ${sqlString(patch.user_email)}`);
        if (patch.status) updates.push(`status = ${sqlString(patch.status)}`);
        if (patch.booking_date) updates.push(`booking_date = ${sqlString(patch.booking_date)}::date`);
        if (patch.start_time) updates.push(`start_time = ${sqlString(patch.start_time)}::time`);
        if (patch.end_time) updates.push(`end_time = ${sqlString(patch.end_time)}::time`);
        if (patch.seats_booked) updates.push(`seats_booked = ${Number(patch.seats_booked)}`);
        updates.push(`updated_at = ${sqlString(patch.updated_at)}::timestamptz`);
        const data = await client.json(`
with updated as (
update public.bookings
set ${updates.join(", ")}
where id = ${sqlUuid(reservationId)}
returning *
)
select coalesce((select to_jsonb(updated) from updated), 'null'::jsonb)::text
`);
        return { data: normalizeBooking(data), error: null };
      },
    },

    resourceMaintenanceRepository: {
      async listActiveMaintenance(requestedServiceId) {
        return {
          data: await client.json(selectJsonArraySql(`
select *
from public.service_seat_maintenance
where service_id = ${sqlUuid(requestedServiceId)}
  and is_active is true
order by seat_label
`)),
          error: null,
        };
      },
      async resolveResource(input) {
        if (!input.resource_id) {
          return {
            serviceId: input.service_id,
            label: typeof input.metadata?.resource_label === "string" ? input.metadata.resource_label : undefined,
          };
        }
        const row = await client.json(selectJsonObjectSql(`
select service_id, label
from public.reservable_resources
where id = ${sqlUuid(input.resource_id)}
limit 1
`));
        if (!row) {
          throw Object.assign(new Error("Resource not found"), { status: 404 });
        }
        return { serviceId: row.service_id, label: row.label };
      },
      async loadService(requestedServiceId) {
        return { data: normalizeService(await getServiceRow(requestedServiceId)), error: null };
      },
      async createMaintenance(row) {
        const id = randomUUID();
        const data = await client.json(`
with created as (
insert into public.service_seat_maintenance (
  id,
  service_id,
  seat_label,
  reason,
  is_active,
  created_by
)
values (
  ${sqlUuid(id)},
  ${sqlUuid(row.service_id)},
  ${sqlString(row.seat_label)},
  ${sqlString(row.reason)},
  true,
  ${row.created_by ? sqlUuid(row.created_by) : "null"}
)
on conflict (service_id, seat_label)
do update set
  reason = excluded.reason,
  is_active = true,
  updated_at = now()
returning *
)
select coalesce((select to_jsonb(created) from created), 'null'::jsonb)::text
`);
        return { data, error: null };
      },
      async endMaintenance(id, input = {}) {
        const data = await client.json(`
with ended as (
update public.service_seat_maintenance
set
  is_active = false,
  reason = coalesce(${sqlString(input.reason ?? null)}, reason),
  updated_at = now()
where id = ${sqlUuid(id)}
returning *
)
select coalesce((select to_jsonb(ended) from ended), 'null'::jsonb)::text
`);
        return { data, error: null };
      },
    },

    idempotencyRepository: {
      async claimInProgress(record) {
        const row = await client.json(selectJsonObjectSql(`
select *
from public.platform_claim_idempotency_record(
  ${sqlString(record.key)},
  ${sqlString(record.tenantId ?? null)},
  ${sqlString(record.method)},
  ${sqlString(record.path)},
  ${sqlString(record.fingerprint)}
)
limit 1
`));
        if (!row || row.claimed === true) {
          return null;
        }
        return {
          key: row.key,
          ...(row.tenant_id && row.tenant_id !== "__reservation_platform_unscoped__" ? { tenantId: row.tenant_id } : {}),
          method: row.method,
          path: row.path,
          fingerprint: row.fingerprint,
          status: row.status,
          ...(row.status === "completed" && typeof row.response_status === "number"
            ? { response: { status: row.response_status, body: row.response_body } }
            : {}),
        };
      },
      async storeCompleted(record) {
        await client.json(`
select coalesce(to_jsonb(public.platform_store_idempotency_record(
  ${sqlString(record.key)},
  ${sqlString(record.tenantId ?? null)},
  ${sqlString(record.method)},
  ${sqlString(record.path)},
  ${sqlString(record.fingerprint)},
  ${Number(record.response.status)},
  ${sqlJson(record.response.body)}
)), 'null'::jsonb)::text
`);
      },
    },
  };
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function assertProofServerPreflight(baseUrl, options = {}) {
  const healthResponse = await fetch(`${baseUrl}/v1/health`);
  if (!healthResponse.ok) {
    throw new Error(`standalone proof server health preflight returned ${healthResponse.status}`);
  }

  const proofServiceApiKey = options.serviceApiKey ?? serviceApiKey;
  const serviceResponse = await fetch(`${baseUrl}/v1/services/${encodeURIComponent(serviceId)}`, {
    headers: {
      Accept: "application/json",
      ...(proofServiceApiKey ? { Authorization: `Bearer ${proofServiceApiKey}` } : {}),
      "X-Reservation-Tenant-Id": tenantId,
      "X-Correlation-Id": "db-backed-standalone-proof-preflight",
    },
  });
  const serviceText = await serviceResponse.text();
  if (!serviceResponse.ok) {
    throw new Error(`standalone proof server service preflight returned ${serviceResponse.status}: ${serviceText.slice(0, 500)}`);
  }
  console.log("PASS DB-backed standalone backend proof server preflight reached health and service routes.");
}

export async function prepareDbBackedStandaloneProofDatabase(parsed) {
  let psqlCommand = "";
  if (!parsed.values[databaseLiveDockerContainerEnvName]) {
    psqlCommand = await resolvePsqlCommand(parsed.values.RESERVATION_DATABASE_LIVE_PSQL);
  }

  const databaseConfig = {
    databaseUrl: parsed.values.RESERVATION_DATABASE_LIVE_URL,
    psqlCommand,
    dockerContainer: parsed.values[databaseLiveDockerContainerEnvName],
  };
  const plan = await loadMigrationProofPlan({
    includeAiRetrieval: parsed.values.RESERVATION_DATABASE_LIVE_INCLUDE_AI_RETRIEVAL === "1",
    includeDevelopmentSeeds: parsed.values.RESERVATION_DATABASE_LIVE_INCLUDE_DEVELOPMENT_SEEDS === "1",
  });
  await runPsqlPlan(databaseConfig, plan);
  await runDatabaseBehaviorProof(databaseConfig);

  const client = new PsqlJsonClient(databaseConfig);
  await seedProofData(client);

  return { client, databaseConfig };
}

export async function startDbBackedStandaloneProofServer(input) {
  const { client, authServiceApiKey = serviceApiKey, corsAllowedOrigins = [] } = input;
  const { createStandaloneNodeServer } = await tsImport(
    pathToFileURL(path.join(process.cwd(), "apps", "api", "src", "server.ts")).href,
    import.meta.url,
  );
  const { createStandaloneApiHandler } = await tsImport(
    pathToFileURL(path.join(process.cwd(), "apps", "api", "src", "routes.ts")).href,
    import.meta.url,
  );
  const repositories = createDbBackedRepositories(client);
  const standaloneHandler = createStandaloneApiHandler({
    ...repositories,
    ...(authServiceApiKey ? { auth: { serviceApiKey: authServiceApiKey } } : {}),
  });
  const server = createStandaloneNodeServer(async (request) => {
    const response = await standaloneHandler(request);
    if (response.status >= 400 && request.path?.includes("/v1/resource-maintenance")) {
      console.error("DB-backed standalone proof resource-maintenance failure", JSON.stringify({
        method: request.method,
        path: request.path,
        body: request.body,
        response: response.body,
      }));
    }
    return response;
  }, {
    cors: { allowedOrigins: corsAllowedOrigins },
  });
  server.on("clientError", (error) => {
    console.error(`WARN DB-backed standalone proof server client error: ${error.message}`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!port) {
    await closeServer(server);
    throw new Error("Standalone backend proof server did not expose a local port.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await closeServer(server);
    },
  };
}

async function main() {
  const parsed = readLiveDatabaseConfig(process.env, process.argv.slice(2));
  console.log("DB-backed standalone live parity env contract checked.");

  if (parsed.errors.length > 0) {
    const message = parsed.errors.join(" ");
    if (strict) {
      fail(message);
      return;
    }
    skip(`${message} No database, backend, or SDK parity calls were made.`);
    return;
  }

  if (!parsed.ready) {
    const details = [
      `missing ${parsed.missing.join(", ")}`,
      parsed.configured.length > 0 ? `configured ${parsed.configured.join(", ")}` : "no live database env configured",
    ].join("; ");
    if (strict) {
      fail(`required live database config is incomplete: ${details}.`);
      return;
    }
    skip(`required live database config is incomplete: ${details}. No database, backend, or SDK parity calls were made.`);
    return;
  }

  const { client } = await prepareDbBackedStandaloneProofDatabase(parsed);
  const proofServer = await startDbBackedStandaloneProofServer({ client, authServiceApiKey: serviceApiKey });
  const baseUrl = proofServer.baseUrl;
  console.log(`DB-backed standalone backend proof server listening on ${baseUrl}`);
  await assertProofServerPreflight(baseUrl);

  try {
    await runProcess(process.execPath, ["scripts/verify-live-backend-parity.mjs", "--strict"], {
      stdio: "inherit",
      env: {
        ...process.env,
        RESERVATION_PLATFORM_LIVE_BASE_URL: baseUrl,
        RESERVATION_PLATFORM_LIVE_TENANT_ID: tenantId,
        RESERVATION_PLATFORM_LIVE_API_KEY: serviceApiKey,
        RESERVATION_PLATFORM_LIVE_SERVICE_ID: serviceId,
        RESERVATION_PLATFORM_LIVE_RESOURCE_ID: resourceId,
        RESERVATION_PLATFORM_LIVE_START_AT: startAt,
        RESERVATION_PLATFORM_LIVE_END_AT: endAt,
        RESERVATION_PLATFORM_LIVE_QUANTITY: "1",
        RESERVATION_PLATFORM_LIVE_CHAT_MODE: "disabled",
        RESERVATION_PLATFORM_LIVE_ALLOW_MUTATIONS: "1",
        RESERVATION_PLATFORM_LIVE_STRICT: "1",
      },
    });
  } finally {
    await proofServer.close();
  }

  console.log("PASS DB-backed standalone live parity proof verified database-backed /v1 routes through SDK/direct HTTP parity.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
