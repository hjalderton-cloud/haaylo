create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'Untitled page',
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft','live','unpublished')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.landing_pages to authenticated;
grant select on public.landing_pages to anon;
grant all on public.landing_pages to service_role;

alter table public.landing_pages enable row level security;

create policy "Owners manage their landing pages"
on public.landing_pages for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Anyone can read live landing pages"
on public.landing_pages for select to anon
using (status = 'live');

create trigger landing_pages_touch_updated_at
before update on public.landing_pages
for each row execute function public.touch_updated_at();

create table public.landing_page_leads (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references public.landing_pages(id) on delete cascade not null,
  first_name text,
  last_name text,
  email text not null,
  company text,
  phone text,
  created_at timestamptz not null default now()
);

grant insert on public.landing_page_leads to anon;
grant select, insert on public.landing_page_leads to authenticated;
grant all on public.landing_page_leads to service_role;

alter table public.landing_page_leads enable row level security;

create policy "Anyone can submit to a live page"
on public.landing_page_leads for insert to anon, authenticated
with check (exists (select 1 from public.landing_pages p where p.id = page_id and p.status = 'live'));

create policy "Owners read their page leads"
on public.landing_page_leads for select to authenticated
using (exists (select 1 from public.landing_pages p where p.id = page_id and p.user_id = auth.uid()));

create index landing_page_leads_page_idx on public.landing_page_leads(page_id);