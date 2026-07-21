-- Tenant- and venue-scoped hybrid knowledge retrieval for web chat and
-- WhatsApp. Embeddings are produced by the worker; the database owns durable
-- source lifecycle, exact cosine search, lexical search, and atomic indexing.

create extension if not exists vector;

alter table public.platform_jobs
drop constraint if exists platform_jobs_kind_check;

alter table public.platform_jobs
add constraint platform_jobs_kind_check check (kind in (
  'notification.email',
  'whatsapp.start_session',
  'whatsapp.restore_session',
  'whatsapp.logout_session',
  'whatsapp.process_inbound',
  'whatsapp.deliver_outbound',
  'conversation.process_ai',
  'knowledge.index_source',
  'knowledge.test_search'
));

create table public.platform_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  kind text not null check (kind in ('faq', 'text', 'pdf')),
  title text not null check (length(trim(title)) between 1 and 160),
  source_label text not null check (length(trim(source_label)) between 1 and 160),
  normalized_content text not null check (length(trim(normalized_content)) between 1 and 250000),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'indexing', 'ready', 'failed', 'archived')),
  content_version integer not null default 1 check (content_version > 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  indexed_at timestamptz,
  faq_knowledge_id uuid unique
    references public.platform_experience_knowledge(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade
);

create unique index platform_knowledge_sources_active_checksum_key
on public.platform_knowledge_sources (tenant_id, venue_id, content_sha256)
where status <> 'archived';

create index platform_knowledge_sources_scope_status_idx
on public.platform_knowledge_sources (tenant_id, venue_id, status, updated_at desc, id);

create trigger platform_knowledge_sources_updated_at
before update on public.platform_knowledge_sources
for each row execute function public.set_updated_at();

create or replace function public.platform_limit_active_knowledge_sources()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'platform-knowledge:' || new.tenant_id || ':' || new.venue_id::text,
    0
  ));
  if new.status <> 'archived' and (
    tg_op = 'INSERT' or old.status = 'archived'
  ) and (
    select count(*)
    from public.platform_knowledge_sources source
    where source.tenant_id = new.tenant_id
      and source.venue_id = new.venue_id
      and source.status <> 'archived'
      and source.id <> new.id
  ) >= 100 then
    raise exception 'The venue already has 100 active knowledge sources.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger platform_knowledge_sources_limit_active
before insert or update of status on public.platform_knowledge_sources
for each row execute function public.platform_limit_active_knowledge_sources();

create table public.platform_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.platform_knowledge_sources(id) on delete cascade,
  tenant_id text not null,
  venue_id uuid not null,
  source_version integer not null check (source_version > 0),
  ordinal integer not null check (ordinal >= 0),
  content text not null check (length(trim(content)) between 1 and 8000),
  content_search tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding vector(384) not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (source_id, source_version, ordinal),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade
);

create index platform_knowledge_chunks_scope_idx
on public.platform_knowledge_chunks (tenant_id, venue_id, source_id, ordinal);

create index platform_knowledge_chunks_lexical_idx
on public.platform_knowledge_chunks using gin (content_search);

create table public.platform_knowledge_search_tests (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  venue_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  matches jsonb not null default '[]'::jsonb check (jsonb_typeof(matches) = 'array'),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, venue_id) references public.venues(tenant_id, id) on delete cascade
);

create index platform_knowledge_search_tests_expiry_idx
on public.platform_knowledge_search_tests (expires_at);

create trigger platform_knowledge_search_tests_updated_at
before update on public.platform_knowledge_search_tests
for each row execute function public.set_updated_at();

alter table public.platform_knowledge_sources enable row level security;
alter table public.platform_knowledge_chunks enable row level security;
alter table public.platform_knowledge_search_tests enable row level security;
revoke all on table public.platform_knowledge_sources from public, anon, authenticated;
revoke all on table public.platform_knowledge_chunks from public, anon, authenticated;
revoke all on table public.platform_knowledge_search_tests from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_knowledge_sources to service_role;
grant select, insert, update, delete on table public.platform_knowledge_chunks to service_role;
grant select, insert, update, delete on table public.platform_knowledge_search_tests to service_role;

create or replace function public.platform_validate_knowledge_chunk_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.platform_knowledge_sources source
    where source.id = new.source_id
      and source.tenant_id = new.tenant_id
      and source.venue_id = new.venue_id
      and source.content_version = new.source_version
  ) then
    raise exception 'Knowledge chunk is outside the source scope or version.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger platform_knowledge_chunks_validate_scope
before insert or update on public.platform_knowledge_chunks
for each row execute function public.platform_validate_knowledge_chunk_scope();

create or replace function public.platform_knowledge_chunk_id(
  p_source_id uuid,
  p_source_version integer,
  p_ordinal integer
)
returns uuid
language sql
immutable
strict
set search_path = public
as $$
  select (
    substr(md5(p_source_id::text || ':' || p_source_version::text || ':' || p_ordinal::text), 1, 8)
    || '-' || substr(md5(p_source_id::text || ':' || p_source_version::text || ':' || p_ordinal::text), 9, 4)
    || '-5' || substr(md5(p_source_id::text || ':' || p_source_version::text || ':' || p_ordinal::text), 14, 3)
    || '-a' || substr(md5(p_source_id::text || ':' || p_source_version::text || ':' || p_ordinal::text), 18, 3)
    || '-' || substr(md5(p_source_id::text || ':' || p_source_version::text || ':' || p_ordinal::text), 21, 12)
  )::uuid;
$$;

create or replace function public.platform_enqueue_knowledge_index(
  p_source_id uuid,
  p_expected_version integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.platform_knowledge_sources%rowtype;
  v_job_id uuid;
begin
  select * into v_source
  from public.platform_knowledge_sources
  where id = p_source_id
  for share;

  if not found or v_source.content_version <> p_expected_version
    or v_source.status = 'archived' then
    return null;
  end if;

  insert into public.platform_jobs (
    tenant_id, venue_id, kind, payload, max_attempts, idempotency_key
  ) values (
    v_source.tenant_id,
    v_source.venue_id,
    'knowledge.index_source',
    jsonb_build_object(
      'sourceId', v_source.id::text,
      'expectedVersion', v_source.content_version,
      'contentSha256', v_source.content_sha256
    ),
    5,
    'knowledge:index:' || v_source.id::text || ':' || v_source.content_version::text
  )
  on conflict (tenant_id, idempotency_key) do update
    set status = 'pending',
        attempts = 0,
        max_attempts = excluded.max_attempts,
        available_at = now(),
        leased_until = null,
        lease_owner = null,
        error_code = null,
        completed_at = null,
        failed_at = null
  returning id into v_job_id;

  return v_job_id;
end;
$$;

create or replace function public.platform_create_knowledge_source(
  p_tenant_id text,
  p_venue_id uuid,
  p_kind text,
  p_title text,
  p_source_label text,
  p_normalized_content text,
  p_content_sha256 text
)
returns setof public.platform_knowledge_sources
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.platform_knowledge_sources%rowtype;
begin
  if p_kind not in ('text', 'pdf') then
    raise exception 'Knowledge source kind is invalid.' using errcode = '23514';
  end if;

  insert into public.platform_knowledge_sources (
    tenant_id, venue_id, kind, title, source_label, normalized_content,
    content_sha256, status
  ) values (
    p_tenant_id, p_venue_id, p_kind, trim(p_title), trim(p_source_label),
    p_normalized_content, p_content_sha256, 'pending'
  )
  returning * into v_source;

  perform public.platform_enqueue_knowledge_index(v_source.id, v_source.content_version);
  return next v_source;
end;
$$;

create or replace function public.platform_replace_knowledge_source(
  p_tenant_id text,
  p_venue_id uuid,
  p_source_id uuid,
  p_kind text,
  p_title text,
  p_source_label text,
  p_normalized_content text,
  p_content_sha256 text
)
returns setof public.platform_knowledge_sources
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.platform_knowledge_sources%rowtype;
begin
  if p_kind not in ('text', 'pdf') then
    raise exception 'Knowledge source kind is invalid.' using errcode = '23514';
  end if;

  select * into v_source
  from public.platform_knowledge_sources source
  where source.id = p_source_id
    and source.tenant_id = p_tenant_id
    and source.venue_id = p_venue_id
  for update;

  if not found or v_source.status = 'archived' then
    return;
  end if;
  if v_source.kind = 'faq' then
    raise exception 'FAQ sources must be updated through the FAQ interface.'
      using errcode = '23514';
  end if;

  update public.platform_knowledge_sources
  set kind = p_kind,
      title = trim(p_title),
      source_label = trim(p_source_label),
      normalized_content = p_normalized_content,
      content_sha256 = p_content_sha256,
      content_version = content_version + 1,
      status = 'pending',
      chunk_count = 0,
      indexed_at = null,
      failure_code = null
  where id = p_source_id
  returning * into v_source;

  perform public.platform_enqueue_knowledge_index(v_source.id, v_source.content_version);
  return next v_source;
end;
$$;

create or replace function public.platform_archive_knowledge_source(
  p_tenant_id text,
  p_venue_id uuid,
  p_source_id uuid
)
returns setof public.platform_knowledge_sources
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.platform_knowledge_sources%rowtype;
begin
  update public.platform_knowledge_sources source
  set status = 'archived',
      chunk_count = 0,
      indexed_at = null,
      failure_code = null,
      archived_at = now()
  where source.id = p_source_id
    and source.tenant_id = p_tenant_id
    and source.venue_id = p_venue_id
    and source.status <> 'archived'
  returning * into v_source;

  if not found then return; end if;
  delete from public.platform_knowledge_chunks where source_id = p_source_id;
  return next v_source;
end;
$$;

create or replace function public.platform_reindex_knowledge_source(
  p_tenant_id text,
  p_venue_id uuid,
  p_source_id uuid
)
returns setof public.platform_knowledge_sources
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.platform_knowledge_sources%rowtype;
begin
  update public.platform_knowledge_sources source
  set status = 'pending',
      chunk_count = 0,
      indexed_at = null,
      failure_code = null
  where source.id = p_source_id
    and source.tenant_id = p_tenant_id
    and source.venue_id = p_venue_id
    and source.status <> 'archived'
  returning * into v_source;

  if not found then return; end if;
  perform public.platform_enqueue_knowledge_index(v_source.id, v_source.content_version);
  return next v_source;
end;
$$;

create or replace function public.platform_sync_faq_knowledge_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text;
  v_checksum text;
  v_source public.platform_knowledge_sources%rowtype;
begin
  v_content := trim(new.question) || E'\n\n' || trim(new.answer);
  v_checksum := encode(digest(convert_to(v_content, 'UTF8'), 'sha256'), 'hex');

  insert into public.platform_knowledge_sources (
    tenant_id, venue_id, kind, title, source_label, normalized_content,
    content_sha256, status, faq_knowledge_id, archived_at
  ) values (
    new.tenant_id,
    new.venue_id,
    'faq',
    left(trim(new.question), 160),
    left(coalesce(nullif(trim(new.source), ''), trim(new.question)), 160),
    v_content,
    v_checksum,
    case when new.status = 'archived' then 'archived' else 'pending' end,
    new.id,
    case when new.status = 'archived' then now() else null end
  )
  on conflict (faq_knowledge_id) do update set
    title = excluded.title,
    source_label = excluded.source_label,
    normalized_content = excluded.normalized_content,
    content_sha256 = excluded.content_sha256,
    status = excluded.status,
    archived_at = excluded.archived_at,
    content_version = case
      when platform_knowledge_sources.content_sha256 <> excluded.content_sha256
        or platform_knowledge_sources.status <> excluded.status
      then platform_knowledge_sources.content_version + 1
      else platform_knowledge_sources.content_version
    end,
    chunk_count = case
      when platform_knowledge_sources.content_sha256 <> excluded.content_sha256
        or excluded.status = 'archived'
      then 0 else platform_knowledge_sources.chunk_count
    end,
    indexed_at = case
      when platform_knowledge_sources.content_sha256 <> excluded.content_sha256
        or excluded.status = 'archived'
      then null else platform_knowledge_sources.indexed_at
    end,
    failure_code = null
  returning * into v_source;

  if v_source.status = 'archived' then
    delete from public.platform_knowledge_chunks where source_id = v_source.id;
  else
    perform public.platform_enqueue_knowledge_index(v_source.id, v_source.content_version);
  end if;
  return new;
end;
$$;

create trigger platform_experience_knowledge_sync_retrieval
after insert or update of question, answer, source, status
on public.platform_experience_knowledge
for each row execute function public.platform_sync_faq_knowledge_source();

insert into public.platform_knowledge_sources (
  tenant_id, venue_id, kind, title, source_label, normalized_content,
  content_sha256, status, faq_knowledge_id, archived_at
)
select
  knowledge.tenant_id,
  knowledge.venue_id,
  'faq',
  left(trim(knowledge.question), 160),
  left(coalesce(nullif(trim(knowledge.source), ''), trim(knowledge.question)), 160),
  trim(knowledge.question) || E'\n\n' || trim(knowledge.answer),
  encode(digest(convert_to(trim(knowledge.question) || E'\n\n' || trim(knowledge.answer), 'UTF8'), 'sha256'), 'hex'),
  case when knowledge.status = 'archived' then 'archived' else 'pending' end,
  knowledge.id,
  case when knowledge.status = 'archived' then now() else null end
from public.platform_experience_knowledge knowledge
on conflict (faq_knowledge_id) do nothing;

select public.platform_enqueue_knowledge_index(source.id, source.content_version)
from public.platform_knowledge_sources source
where source.status = 'pending';

create or replace function public.platform_begin_knowledge_index(
  p_tenant_id text,
  p_venue_id uuid,
  p_source_id uuid,
  p_expected_version integer,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.platform_knowledge_sources%rowtype;
begin
  update public.platform_knowledge_sources source
  set status = 'indexing', failure_code = null
  where source.id = p_source_id
    and source.tenant_id = p_tenant_id
    and source.venue_id = p_venue_id
    and source.content_version = p_expected_version
    and source.content_sha256 = p_content_sha256
    and source.status in ('pending', 'failed', 'indexing')
  returning * into v_source;

  if not found then return null; end if;
  return jsonb_build_object(
    'source_id', v_source.id,
    'kind', v_source.kind,
    'title', v_source.title,
    'source_label', v_source.source_label,
    'content', v_source.normalized_content,
    'content_version', v_source.content_version
  );
end;
$$;

create or replace function public.platform_replace_knowledge_chunks(
  p_tenant_id text,
  p_venue_id uuid,
  p_source_id uuid,
  p_expected_version integer,
  p_chunks jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chunk jsonb;
  v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'platform-knowledge:' || p_tenant_id || ':' || p_venue_id::text,
    0
  ));
  perform 1
  from public.platform_knowledge_sources source
  where source.id = p_source_id
    and source.tenant_id = p_tenant_id
    and source.venue_id = p_venue_id
    and source.content_version = p_expected_version
    and source.status = 'indexing'
  for update;
  if not found then return false; end if;

  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) > 10000 then
    raise exception 'Knowledge chunks are invalid.' using errcode = '23514';
  end if;
  if (
    select count(*)
    from public.platform_knowledge_chunks chunk
    where chunk.tenant_id = p_tenant_id
      and chunk.venue_id = p_venue_id
      and chunk.source_id <> p_source_id
  ) + jsonb_array_length(p_chunks) > 10000 then
    raise exception 'The venue already has the maximum indexed knowledge chunks.'
      using errcode = '23514';
  end if;

  delete from public.platform_knowledge_chunks where source_id = p_source_id;
  for v_chunk in select value from jsonb_array_elements(p_chunks)
  loop
    insert into public.platform_knowledge_chunks (
      id, source_id, tenant_id, venue_id, source_version, ordinal, content,
      embedding, metadata
    ) values (
      public.platform_knowledge_chunk_id(
        p_source_id,
        p_expected_version,
        (v_chunk ->> 'ordinal')::integer
      ),
      p_source_id,
      p_tenant_id,
      p_venue_id,
      p_expected_version,
      (v_chunk ->> 'ordinal')::integer,
      v_chunk ->> 'content',
      (v_chunk ->> 'embedding')::vector(384),
      coalesce(v_chunk -> 'metadata', '{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;

  update public.platform_knowledge_sources
  set status = 'ready', chunk_count = v_count, indexed_at = now(), failure_code = null
  where id = p_source_id;
  return true;
end;
$$;

create or replace function public.platform_fail_knowledge_index(
  p_tenant_id text,
  p_venue_id uuid,
  p_source_id uuid,
  p_expected_version integer,
  p_failure_code text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.platform_knowledge_sources
  set status = 'failed',
      failure_code = case
        when p_failure_code ~ '^[a-z][a-z0-9_]{0,63}$' then p_failure_code
        else 'indexing_failed'
      end
  where id = p_source_id
    and tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and content_version = p_expected_version
    and status <> 'archived'
  returning true;
$$;

create or replace function public.platform_match_knowledge(
  p_tenant_id text,
  p_venue_id uuid,
  p_query_embedding vector(384),
  p_query_text text,
  p_semantic_limit integer default 20,
  p_lexical_limit integer default 20,
  p_result_limit integer default 5
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_label text,
  content text,
  semantic_similarity double precision,
  semantic_rank bigint,
  lexical_rank bigint,
  combined_score double precision
)
language sql
security definer
stable
set search_path = public
as $$
  with semantic as (
    select chunk.id,
      1 - (chunk.embedding <=> p_query_embedding) as similarity,
      row_number() over (order by chunk.embedding <=> p_query_embedding, chunk.source_id, chunk.ordinal) as rank
    from public.platform_knowledge_chunks chunk
    join public.platform_knowledge_sources source on source.id = chunk.source_id
    where chunk.tenant_id = p_tenant_id
      and chunk.venue_id = p_venue_id
      and source.status = 'ready'
      and 1 - (chunk.embedding <=> p_query_embedding) >= 0.45
    order by chunk.embedding <=> p_query_embedding, chunk.source_id, chunk.ordinal
    limit greatest(1, least(p_semantic_limit, 100))
  ),
  lexical as (
    select chunk.id,
      row_number() over (
        order by ts_rank_cd(chunk.content_search, websearch_to_tsquery('simple', p_query_text)) desc,
          chunk.source_id, chunk.ordinal
      ) as rank
    from public.platform_knowledge_chunks chunk
    join public.platform_knowledge_sources source on source.id = chunk.source_id
    where chunk.tenant_id = p_tenant_id
      and chunk.venue_id = p_venue_id
      and source.status = 'ready'
      and length(trim(p_query_text)) > 0
      and chunk.content_search @@ websearch_to_tsquery('simple', p_query_text)
    order by ts_rank_cd(chunk.content_search, websearch_to_tsquery('simple', p_query_text)) desc,
      chunk.source_id, chunk.ordinal
    limit greatest(1, least(p_lexical_limit, 100))
  ),
  candidates as (
    select id from semantic
    union
    select id from lexical
  )
  select
    chunk.id,
    chunk.source_id,
    source.source_label,
    chunk.content,
    semantic.similarity,
    semantic.rank,
    lexical.rank,
    coalesce(0.7 / (60 + semantic.rank), 0)
      + coalesce(0.3 / (60 + lexical.rank), 0) as combined_score
  from candidates
  join public.platform_knowledge_chunks chunk on chunk.id = candidates.id
  join public.platform_knowledge_sources source on source.id = chunk.source_id
  left join semantic on semantic.id = chunk.id
  left join lexical on lexical.id = chunk.id
  order by combined_score desc, chunk.source_id, chunk.ordinal
  limit greatest(1, least(p_result_limit, 20));
$$;

create or replace function public.platform_enqueue_knowledge_search_test(
  p_tenant_id text,
  p_venue_id uuid,
  p_query text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if length(trim(p_query)) not between 1 and 4000 then
    raise exception 'Knowledge search query is invalid.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.venues venue
    where venue.tenant_id = p_tenant_id and venue.id = p_venue_id
  ) then
    raise exception 'Knowledge search scope is invalid.' using errcode = '23514';
  end if;

  delete from public.platform_knowledge_search_tests
  where expires_at < now();

  insert into public.platform_knowledge_search_tests (tenant_id, venue_id)
  values (p_tenant_id, p_venue_id)
  returning id into v_request_id;

  insert into public.platform_jobs (
    tenant_id, venue_id, kind, payload, max_attempts, idempotency_key
  ) values (
    p_tenant_id,
    p_venue_id,
    'knowledge.test_search',
    jsonb_build_object('requestId', v_request_id::text, 'query', trim(p_query)),
    1,
    'knowledge:test:' || v_request_id::text
  );
  return v_request_id;
end;
$$;

create or replace function public.platform_complete_knowledge_search_test(
  p_tenant_id text,
  p_venue_id uuid,
  p_request_id uuid,
  p_matches jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) > 20 then
    raise exception 'Knowledge search matches are invalid.' using errcode = '23514';
  end if;
  update public.platform_knowledge_search_tests
  set status = 'ready', matches = p_matches, failure_code = null
  where id = p_request_id
    and tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and status = 'pending'
    and expires_at >= now();
  return found;
end;
$$;

create or replace function public.platform_fail_knowledge_search_test(
  p_tenant_id text,
  p_venue_id uuid,
  p_request_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_knowledge_search_tests
  set status = 'failed',
      failure_code = case
        when p_failure_code ~ '^[a-z][a-z0-9_]{0,63}$' then p_failure_code
        else 'retrieval_unavailable'
      end
  where id = p_request_id
    and tenant_id = p_tenant_id
    and venue_id = p_venue_id
    and status = 'pending';
  return found;
end;
$$;

revoke all on function public.platform_enqueue_knowledge_index(uuid, integer) from public, anon, authenticated;
revoke all on function public.platform_knowledge_chunk_id(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.platform_create_knowledge_source(text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_replace_knowledge_source(text, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_archive_knowledge_source(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_reindex_knowledge_source(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_begin_knowledge_index(text, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.platform_replace_knowledge_chunks(text, uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.platform_fail_knowledge_index(text, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.platform_match_knowledge(text, uuid, vector, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.platform_enqueue_knowledge_search_test(text, uuid, text) from public, anon, authenticated;
revoke all on function public.platform_complete_knowledge_search_test(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.platform_fail_knowledge_search_test(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.platform_enqueue_knowledge_index(uuid, integer) to service_role;
grant execute on function public.platform_knowledge_chunk_id(uuid, integer, integer) to service_role;
grant execute on function public.platform_create_knowledge_source(text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.platform_replace_knowledge_source(text, uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.platform_archive_knowledge_source(text, uuid, uuid) to service_role;
grant execute on function public.platform_reindex_knowledge_source(text, uuid, uuid) to service_role;
grant execute on function public.platform_begin_knowledge_index(text, uuid, uuid, integer, text) to service_role;
grant execute on function public.platform_replace_knowledge_chunks(text, uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.platform_fail_knowledge_index(text, uuid, uuid, integer, text) to service_role;
grant execute on function public.platform_match_knowledge(text, uuid, vector, text, integer, integer, integer) to service_role;
grant execute on function public.platform_enqueue_knowledge_search_test(text, uuid, text) to service_role;
grant execute on function public.platform_complete_knowledge_search_test(text, uuid, uuid, jsonb) to service_role;
grant execute on function public.platform_fail_knowledge_search_test(text, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
