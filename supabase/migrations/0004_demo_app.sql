-- 0004_demo_app: tables owned by the CUSTOMER demo app (Acme Workspace), not by VISTRA.
-- Kept in a separate schema; the VISTRA API role (vistra_app) has no access to it. The demo's server
-- route handlers reach it through their own connection string.
create schema if not exists demo;

create table demo.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'acme',
  name text not null,
  status text not null default 'active' check (status in ('active','overdue','archived')),
  owner text not null default 'unassigned',
  created_by_run uuid,
  created_at timestamptz not null default now()
);

create table demo.team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'acme',
  name text not null,
  email text not null,
  role text not null default 'member',
  status text not null default 'active' check (status in ('active','invited')),
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

-- Replay protection for signed tool calls.
create table demo.tool_nonces (
  signature text primary key,
  run_id text,
  tool text not null,
  seen_at timestamptz not null default now()
);

revoke all on schema demo from vistra_app;
