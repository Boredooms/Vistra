-- 0002_knowledge: knowledge bases, sources, documents, chunks, embeddings, ingestion jobs.
create table knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  application_id text references applications(id) on delete set null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  collection_id uuid not null references knowledge_collections(id) on delete cascade,
  source_type text not null check (source_type in ('markdown','text','html','url')),
  title text not null,
  url text,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  collection_id uuid not null references knowledge_collections(id) on delete cascade,
  source_id uuid references knowledge_sources(id) on delete cascade,
  title text not null,
  content_hash text not null,
  current_version_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, content_hash)
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version int not null default 1,
  content_hash text not null,
  normalized_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  collection_id uuid not null references knowledge_collections(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  document_version_id uuid not null references document_versions(id) on delete cascade,
  chunk_index int not null,
  parent_chunk_id uuid references document_chunks(id) on delete cascade,
  content text not null,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  token_count int not null,
  section_path text,
  anchor text,
  page int,
  content_hash text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table embeddings (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  chunk_id uuid not null unique references document_chunks(id) on delete cascade,
  model text not null,
  dim int not null,
  index_version int not null default 1,
  embedding vector(768) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  stage text not null default 'register',
  attempt int not null default 0,
  error text,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_kb_org on knowledge_bases (organization_id);
create index idx_collections_org on knowledge_collections (organization_id, knowledge_base_id);
create index idx_sources_org on knowledge_sources (organization_id, collection_id);
create index idx_documents_org on documents (organization_id, collection_id);
create index idx_chunks_org_col on document_chunks (organization_id, collection_id);
create index idx_chunks_doc on document_chunks (document_id, chunk_index);
create index idx_chunks_tsv on document_chunks using gin (content_tsv);
create index idx_embeddings_org on embeddings (organization_id, index_version);
create index idx_embeddings_hnsw on embeddings using hnsw (embedding vector_cosine_ops);
create index idx_ingestion_jobs_org on ingestion_jobs (organization_id, status);

do $$
declare t text;
begin
  foreach t in array array['knowledge_bases','knowledge_collections','knowledge_sources','documents','document_versions','document_chunks','embeddings','ingestion_jobs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I using (organization_id = current_setting('app.organization_id', true)) with check (organization_id = current_setting('app.organization_id', true))$p$, t);
    execute format('create trigger trg_%s_updated before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
