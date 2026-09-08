-- Project Play knowledge-base RAG setup.
-- Run this in the Supabase SQL editor before seeding with `pnpm seed:knowledge`.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(768) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_knowledge(
  query_embedding vector(768),
  filter jsonb default '{}'::jsonb,
  match_threshold float default 0.3,
  match_count int default 3
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.content,
    knowledge_chunks.metadata,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  where knowledge_chunks.metadata @> filter
    and 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  order by knowledge_chunks.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.knowledge_chunks enable row level security;

drop policy if exists "Public can read knowledge chunks" on public.knowledge_chunks;
create policy "Public can read knowledge chunks"
  on public.knowledge_chunks
  for select
  using (true);

-- Replace the complete dataset only after every embedding has been generated.
create or replace function public.replace_knowledge_chunks(chunks jsonb)
returns void language plpgsql
set search_path = public, extensions
as $$
begin
  if jsonb_typeof(chunks) <> 'array' or jsonb_array_length(chunks) = 0 then
    raise exception 'Knowledge replacement must not be empty';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('knowledge_chunks replacement', 0));
  delete from public.knowledge_chunks;
  insert into public.knowledge_chunks (content, embedding, metadata)
    select item->>'content', (item->>'embedding')::vector(768), coalesce(item->'metadata', '{}'::jsonb)
    from jsonb_array_elements(chunks) item;
end;
$$;
revoke all on function public.replace_knowledge_chunks(jsonb) from public, anon, authenticated;
grant execute on function public.replace_knowledge_chunks(jsonb) to service_role;
