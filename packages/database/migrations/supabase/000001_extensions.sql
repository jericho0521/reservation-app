-- Reservation platform database bundle artifact.
-- Source: supabase/base-schema.sql
-- Section: pgcrypto and pg_trgm extension setup.
-- Status: curated runnable package-owned migration asset; live database proof
-- is still pending.

create extension if not exists pgcrypto;

create schema if not exists extensions;

create extension if not exists pg_trgm with schema extensions;
