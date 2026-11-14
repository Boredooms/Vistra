-- 0005: keep the raw source payload so an ingestion job can be re-run by a worker after a restart.
alter table knowledge_sources add column raw_content text;
