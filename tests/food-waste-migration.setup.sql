-- Isolated PostgreSQL fixture for the ANIMO food-waste migration.
-- This runs only inside a disposable GitHub Actions PostgreSQL service.

do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

create schema auth;
create schema private;
create schema storage;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.businesses (
  id uuid primary key
);

create table public.business_members (
  business_id uuid not null references public.businesses(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'manager', 'employee')),
  active boolean not null default true,
  primary key (business_id, user_id)
);

alter table public.business_members enable row level security;
grant usage on schema auth, private, storage, public to authenticated;
grant select on public.business_members to authenticated;

create or replace function public.is_business_member(target_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = target_business
      and m.user_id = (select auth.uid())
      and m.active is true
  )
$$;

create policy "members read memberships"
on public.business_members
for select
to authenticated
using (active is true and public.is_business_member(business_id));

create or replace function private.can_access_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = (select auth.uid())
      and bm.active is true
  )
$$;

grant execute on function private.can_access_business(uuid) to authenticated;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb
);

alter table storage.objects enable row level security;
grant select, insert, update on storage.objects to authenticated;

create or replace function storage.foldername(object_name text)
returns text[]
language sql
immutable
as $$
  select case
    when strpos(object_name, '/') = 0 then array[]::text[]
    else string_to_array(regexp_replace(object_name, '/[^/]*$', ''), '/')
  end
$$;

-- Test identities and two independent businesses.
insert into public.businesses (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

insert into public.business_members (business_id, user_id, role, active) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'employee', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'manager', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'owner', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'employee', true);
