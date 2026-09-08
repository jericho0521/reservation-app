create role anon;
create role authenticated;
create role service_role bypassrls;
create schema extensions;
alter database postgres set search_path = public, extensions;
