create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('blog', 'update')),
  title text not null,
  slug text not null,
  excerpt text,
  content text not null,
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  author_id uuid references auth.users(id) on delete set null,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section, slug)
);

create index if not exists content_posts_section_status_published_idx
  on public.content_posts(section, status, published_at desc);

create index if not exists content_posts_slug_idx
  on public.content_posts(slug);

create or replace function public.set_content_posts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_posts_updated_at on public.content_posts;
create trigger content_posts_updated_at
  before update on public.content_posts
  for each row
  execute function public.set_content_posts_updated_at();

alter table public.content_posts enable row level security;

drop policy if exists "Published content is publicly readable" on public.content_posts;
create policy "Published content is publicly readable"
  on public.content_posts
  for select
  using (status = 'published');

drop policy if exists "Authenticated users can manage content" on public.content_posts;
create policy "Authenticated users can manage content"
  on public.content_posts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('blog-assets', 'blog-assets', true)
on conflict (id) do nothing;

drop policy if exists "Blog assets are publicly readable" on storage.objects;

drop policy if exists "Authenticated users can manage blog assets" on storage.objects;
create policy "Authenticated users can manage blog assets"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'blog-assets' and public.is_admin())
  with check (bucket_id = 'blog-assets' and public.is_admin());
