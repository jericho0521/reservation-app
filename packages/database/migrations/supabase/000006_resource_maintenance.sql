-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: service_seat_maintenance and replace_service_seat_maintenance
-- compatibility behavior.
-- Status: package-owned runnable migration asset; live database proof is still
-- pending.

create table if not exists public.service_seat_maintenance (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  seat_label text not null,
  reason text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_seat_maintenance_label_check check (length(trim(seat_label)) > 0)
);

alter table public.service_seat_maintenance
drop constraint if exists service_seat_maintenance_label_check;

alter table public.service_seat_maintenance
add constraint service_seat_maintenance_label_check
check (length(trim(seat_label)) > 0);

create unique index if not exists service_seat_maintenance_service_label_key
on public.service_seat_maintenance (service_id, seat_label);

create index if not exists service_seat_maintenance_active_idx
on public.service_seat_maintenance (service_id, is_active);

create or replace function public.replace_service_seat_maintenance(
  p_service_id uuid,
  p_seat_labels text[],
  p_reason text default null,
  p_created_by uuid default null
)
returns table (seat_label text)
language plpgsql
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  update public.service_seat_maintenance
  set is_active = false
  where service_id = p_service_id
    and is_active = true;

  if coalesce(array_length(p_seat_labels, 1), 0) > 0 then
    insert into public.service_seat_maintenance (
      service_id,
      seat_label,
      reason,
      is_active,
      created_by
    )
    select
      p_service_id,
      labels.seat_label,
      nullif(trim(coalesce(p_reason, '')), ''),
      true,
      p_created_by
    from unnest(p_seat_labels) as labels(seat_label)
    on conflict (service_id, seat_label)
    do update set
      reason = excluded.reason,
      is_active = true,
      created_by = excluded.created_by,
      updated_at = now();
  end if;

  return query
  select maintenance.seat_label
  from public.service_seat_maintenance as maintenance
  where maintenance.service_id = p_service_id
    and maintenance.is_active = true
  order by
    case
      when maintenance.seat_label ~ '^[[:alpha:]]+[0-9]+$' then regexp_replace(maintenance.seat_label, '[0-9]+$', '')
      else maintenance.seat_label
    end,
    case
      when maintenance.seat_label ~ '^[[:alpha:]]+[0-9]+$' then (regexp_match(maintenance.seat_label, '[0-9]+$'))[1]::integer
      else null
    end,
    maintenance.seat_label;
end;
$$;

revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public;
grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated;

drop trigger if exists set_service_seat_maintenance_updated_at on public.service_seat_maintenance;
create trigger set_service_seat_maintenance_updated_at
before update on public.service_seat_maintenance
for each row execute function public.set_updated_at();
