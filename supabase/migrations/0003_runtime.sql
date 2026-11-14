-- 0003_runtime: sessions, messages, events, runs, steps, tools, approvals, guides, usage, audit.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  application_session_id uuid references application_sessions(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  run_id uuid,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  citations jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  run_id uuid,
  seq bigint generated always as identity,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  intent text,
  status text not null default 'running'
    check (status in ('running','awaiting_approval','completed','failed','cancelled')),
  input text not null,
  output text,
  error_code text,
  prompt_version text not null default 'v1',
  served_by jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  step_index int not null,
  kind text not null,
  status text not null default 'completed',
  summary text,
  detail jsonb not null default '{}',
  latency_ms int,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_index)
);

create table tool_invocations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  tool text not null,
  args jsonb not null,
  args_hash text not null,
  idempotency_key text not null,
  policy_decision text not null check (policy_decision in ('allow','deny','require_approval')),
  policy_reason text,
  status text not null default 'proposed'
    check (status in ('proposed','awaiting_approval','executing','executed','verified','verification_failed','failed','rejected','denied')),
  result jsonb,
  error text,
  executed_at timestamptz,
  verified_at timestamptz,
  verification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  tool_invocation_id uuid not null references tool_invocations(id) on delete cascade,
  args_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  requested_for text,
  decided_by text,
  decided_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table guide_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete set null,
  goal text not null,
  steps jsonb not null default '[]',
  step_outcomes jsonb not null default '[]',
  status text not null default 'active' check (status in ('active','completed','cancelled','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text,
  metric text not null,
  quantity bigint not null default 1,
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table model_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  run_id uuid,
  provider text not null,
  model text not null,
  capability text not null,
  status text not null check (status in ('ok','failed')),
  error_class text,
  fallback_used boolean not null default false,
  input_tokens int,
  output_tokens int,
  latency_ms int not null,
  attempt int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  actor_type text not null,
  actor_id text,
  action text not null,
  resource_type text,
  resource_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sessions_org on sessions (organization_id, application_id);
create index idx_messages_session on session_messages (organization_id, session_id, created_at);
create index idx_events_session on session_events (organization_id, session_id, seq);
create index idx_events_run on session_events (organization_id, run_id, seq);
create index idx_runs_org on agent_runs (organization_id, session_id, created_at desc);
create index idx_steps_run on agent_run_steps (organization_id, run_id, step_index);
create index idx_tools_run on tool_invocations (organization_id, run_id);
create index idx_approvals_run on approvals (organization_id, run_id);
create index idx_guides_session on guide_flows (organization_id, session_id);
create index idx_usage_org on usage_records (organization_id, created_at);
create index idx_model_usage_org on model_usage (organization_id, run_id, created_at);
create index idx_audit_org on audit_events (organization_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['sessions','session_messages','session_events','agent_runs','agent_run_steps','tool_invocations','approvals','guide_flows','usage_records','model_usage','audit_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I using (organization_id = current_setting('app.organization_id', true)) with check (organization_id = current_setting('app.organization_id', true))$p$, t);
    execute format('create trigger trg_%s_updated before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- audit_events are append-only for the application role.
revoke update, delete on audit_events from vistra_app;
grant select, insert, update, delete on all tables in schema public to vistra_app;
revoke update, delete on audit_events from vistra_app;
grant usage, select on all sequences in schema public to vistra_app;
