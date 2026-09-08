create schema auth;
create table auth.users (id uuid primary key);
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid, bucket_id text);
create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.is_admin', true), '') = 'true' $$;
