-- Opaque, hashed, expiring customer reservation-management tokens.

create table if not exists public.platform_reservation_management_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or revocation_reason in ('cancelled', 'revoked')),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists platform_reservation_management_tokens_booking_idx
on public.platform_reservation_management_tokens (booking_id, expires_at desc);

create or replace function public.read_managed_reservation(
  p_public_slug text,
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token public.platform_reservation_management_tokens;
  v_booking public.bookings;
begin
  select tokens.*
  into v_token
  from public.platform_reservation_management_tokens tokens
  join public.bookings bookings on bookings.id = tokens.booking_id
  join public.services services on services.id = bookings.service_id
  join public.platform_business_profiles profiles on profiles.venue_id = services.venue_id
  where profiles.public_slug = lower(trim(p_public_slug))
    and tokens.token_hash = lower(trim(p_token_hash));

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;
  if v_token.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error_code', 'expired');
  end if;
  if v_token.revoked_at is not null and v_token.revocation_reason <> 'cancelled' then
    return jsonb_build_object('ok', false, 'error_code', 'revoked');
  end if;

  select * into v_booking from public.bookings where id = v_token.booking_id;
  return jsonb_build_object(
    'ok', true,
    'booking', to_jsonb(v_booking),
    'expires_at', v_token.expires_at,
    'revoked', v_token.revoked_at is not null
  );
end;
$$;

create or replace function public.cancel_managed_reservation(
  p_public_slug text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.platform_reservation_management_tokens;
  v_booking public.bookings;
  v_timezone text;
  v_starts_at timestamptz;
begin
  select tokens.*
  into v_token
  from public.platform_reservation_management_tokens tokens
  join public.bookings bookings on bookings.id = tokens.booking_id
  join public.services services on services.id = bookings.service_id
  join public.platform_business_profiles profiles on profiles.venue_id = services.venue_id
  where profiles.public_slug = lower(trim(p_public_slug))
    and tokens.token_hash = lower(trim(p_token_hash))
  for update of tokens;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'not_found');
  end if;

  select bookings.*
  into v_booking
  from public.bookings bookings
  where bookings.id = v_token.booking_id
  for update;

  if v_token.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error_code', 'expired');
  end if;
  if v_token.revoked_at is not null then
    if v_token.revocation_reason = 'cancelled' and v_booking.status = 'cancelled' then
      return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking), 'replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'revoked');
  end if;

  select coalesce(settings.timezone, 'UTC')
  into v_timezone
  from public.services services
  left join public.platform_availability_settings settings on settings.venue_id = services.venue_id
  where services.id = v_booking.service_id;
  v_timezone := coalesce(v_timezone, 'UTC');
  v_starts_at := (v_booking.booking_date + v_booking.start_time) at time zone v_timezone;

  if v_starts_at <= now() then
    return jsonb_build_object('ok', false, 'error_code', 'cancellation_closed');
  end if;

  update public.bookings
  set status = 'cancelled'
  where id = v_booking.id
  returning * into v_booking;

  update public.platform_reservation_management_tokens
  set revoked_at = now(), revocation_reason = 'cancelled'
  where id = v_token.id;

  return jsonb_build_object('ok', true, 'booking', to_jsonb(v_booking), 'replayed', false);
end;
$$;

alter table public.platform_reservation_management_tokens enable row level security;
revoke all on table public.platform_reservation_management_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_reservation_management_tokens to service_role;

revoke all on function public.read_managed_reservation(text, text) from public, anon, authenticated;
revoke all on function public.cancel_managed_reservation(text, text) from public, anon, authenticated;
grant execute on function public.read_managed_reservation(text, text) to service_role;
grant execute on function public.cancel_managed_reservation(text, text) to service_role;
