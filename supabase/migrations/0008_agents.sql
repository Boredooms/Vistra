-- 0008: configurable agents (doc 16 agents / agent_versions). One published version drives an application's runs.
-- Deviation from doc 16 (recorded in ADR-031): instructions are stored inline on the version instead of in
-- prompt_versions, and application_id is text to match applications.id.
create table agents (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text not null references applications(id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null default 'orchestrator' check (kind in ('orchestrator','vision','knowledge','guide','action','workflow','live')),
  description text,
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  current_version_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (application_id, slug)
);

create table agent_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  version integer not null,
  instructions text not null default '' check (length(instructions) <= 4000),
  capabilities jsonb not null default '{"answer": true, "explain_element": true, "guide": true, "actions": true}'::jsonb,
  model_config jsonb not null default '{"planner": "fast", "answer": "fast"}'::jsonb,
  retrieval_config jsonb not null default '{"top_k": 8, "strictness": "balanced"}'::jsonb,
  guide_config jsonb not null default '{"max_steps": 6}'::jsonb,
  tool_config jsonb not null default '{}'::jsonb,
  max_steps integer not null default 8 check (max_steps between 1 and 25),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (agent_id, version)
);

alter table agents add constraint agents_current_version_id_fkey
  foreign key (current_version_id) references agent_versions(id) on delete set null;
alter table agent_runs add column agent_version_id uuid references agent_versions(id) on delete set null;

create index idx_agents_org_app on agents (organization_id, application_id);
create index idx_agent_versions_agent on agent_versions (organization_id, agent_id, version desc);
create index idx_runs_agent_version on agent_runs (organization_id, agent_version_id);

do $$
declare t text;
begin
  foreach t in array array['agents','agent_versions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I using (organization_id = current_setting('app.organization_id', true)) with check (organization_id = current_setting('app.organization_id', true))$p$, t);
    execute format('create trigger trg_%s_updated before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
grant select, insert, update, delete on agents, agent_versions to vistra_app;
