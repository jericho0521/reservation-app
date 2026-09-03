-- Resolve the replace RPC's seat_label output-variable/column conflict.
-- Apply this to databases created before the base schema included the fix.

begin;

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
#variable_conflict use_column
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
  order by (substring(maintenance.seat_label from 3))::integer;
end;
$$;

revoke all on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) from public;
grant execute on function public.replace_service_seat_maintenance(uuid, text[], text, uuid) to authenticated;

commit;
