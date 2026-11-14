-- 0006: per-application tool signing secret (encrypted at rest). Falls back to the platform TOOL_SIGNING_SECRET when null.
alter table applications add column tool_secret_enc text;
