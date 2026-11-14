-- 0001_core: extensions, application role, identity/tenancy, applications, keys, SDK sessions.
create extension if not exists vector;
create extension if not exists pgcrypto;

-- Non-bypass role used for every tenant request. RLS is therefore actually enforced even though the
-- connection login (postgres) can bypass RLS.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vistra_app') then
    create role vistra_app nologin noinherit nobypassrls;
  end if;
end $$;
grant vistra_app to current_user;
grant usage on schema public to vistra_app;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table organizations (
  id text primary key,
  name text not null,
  organization_id text generated always as (id) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global identity projection (Clerk ids). Allowlisted as non-tenant in doc 16.
create table users (
  id text primary key,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','developer','analyst','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table applications (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  tool_base_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table application_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  origin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, origin)
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  name text not null default 'default',
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table application_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  end_user_id text,
  end_user_role text not null default 'member',
  origin text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_application_domains_org on application_domains (organization_id, application_id);
create index idx_api_keys_org on api_keys (organization_id, application_id);
create index idx_application_sessions_org on application_sessions (organization_id, application_id);

-- RLS: enabled AND forced on every tenant table.
do $$
declare t text;
begin
  foreach t in array array['organization_members','applications','application_domains','api_keys','application_sessions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I using (organization_id = current_setting('app.organization_id', true)) with check (organization_id = current_setting('app.organization_id', true))$p$, t);
    execute format('create trigger trg_%s_updated before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

alter table organizations enable row level security;
alter table organizations force row level security;
create policy tenant_isolation on organizations
  using (id = current_setting('app.organization_id', true))
  with check (id = current_setting('app.organization_id', true));

grant select, insert, update, delete on all tables in schema public to vistra_app;
alter default privileges in schema public grant select, insert, update, delete on tables to vistra_app;
alter default privileges in schema public grant usage, select on sequences to vistra_app;
grant usage, select on all sequences in schema public to vistra_app;
