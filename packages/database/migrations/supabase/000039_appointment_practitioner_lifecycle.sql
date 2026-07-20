-- Keep appointment practitioner resources, staff profiles, and assignments
-- synchronized when owners edit or deactivate practitioners.

alter function public.platform_enqueue_appointment_notification_jobs()
security definer;
revoke all on function public.platform_enqueue_appointment_notification_jobs()
from public, anon, authenticated;

create or replace function public.platform_update_appointment_practitioner_resource(
  p_tenant_id text,
  p_venue_id uuid,
  p_resource_id uuid,
  p_service_id uuid,
  p_display_name text,
  p_active boolean,
  p_archive_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.platform_staff_profiles%rowtype;
  v_resource public.reservable_resources%rowtype;
begin
  if nullif(trim(p_display_name), '') is null then
    raise exception 'Practitioner display name is required.' using errcode = '23514';
  end if;

  perform 1
  from public.services as service
  join public.venues as venue on venue.id = service.venue_id
  where service.id = p_service_id
    and service.venue_id = p_venue_id
    and service.booking_mode = 'appointment'
    and coalesce((service.metadata ->> 'is_active')::boolean, true)
    and venue.tenant_id = p_tenant_id
  for share of service, venue;
  if not found then
    raise exception 'Active appointment service is outside the requested tenant and venue.' using errcode = '23514';
  end if;

  select staff.* into v_staff
  from public.platform_staff_profiles as staff
  join public.reservable_resources as resource
    on resource.id = staff.reservable_resource_id
  join public.services as current_service
    on current_service.id = resource.service_id
  join public.venues as current_venue
    on current_venue.id = current_service.venue_id
  where staff.reservable_resource_id = p_resource_id
    and staff.tenant_id = p_tenant_id
    and current_service.venue_id = p_venue_id
    and current_venue.tenant_id = p_tenant_id
  for update of staff, resource;
  if not found then
    raise exception 'Appointment practitioner is outside the requested tenant and venue.' using errcode = '23514';
  end if;

  update public.reservable_resources
  set
    service_id = p_service_id,
    label = trim(p_display_name),
    resource_kind = 'custom',
    capacity = 1,
    status = case when p_active then 'available' else 'inactive' end,
    metadata = metadata
      || jsonb_build_object(
        'platform_staff_id', v_staff.id::text,
        'practitioner_display_name', trim(p_display_name)
      )
      || case
        when p_active then jsonb_build_object('archive_reason', null)
        else jsonb_build_object('archive_reason', nullif(trim(p_archive_reason), ''))
      end
  where id = p_resource_id
  returning * into v_resource;

  update public.platform_staff_profiles
  set
    display_name = trim(p_display_name),
    status = case when p_active then 'active' else 'inactive' end,
    updated_at = now()
  where id = v_staff.id;

  delete from public.platform_staff_services
  where staff_id = v_staff.id;
  insert into public.platform_staff_services (staff_id, service_id)
  values (v_staff.id, p_service_id);

  delete from public.platform_staff_locations
  where staff_id = v_staff.id;
  insert into public.platform_staff_locations (staff_id, venue_id)
  values (v_staff.id, p_venue_id);

  return to_jsonb(v_resource);
end;
$$;

revoke all on function public.platform_update_appointment_practitioner_resource(
  text, uuid, uuid, uuid, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.platform_update_appointment_practitioner_resource(
  text, uuid, uuid, uuid, text, boolean, text
) to service_role;

notify pgrst, 'reload schema';
