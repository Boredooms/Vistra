-- 0007: isolated schema for LangGraph checkpoints (durable agent state; tables created by AsyncPostgresSaver.setup()).
-- Not tenant data: payloads hold run state keyed by thread_id = agent_runs.id. The tenant role gets no access.
create schema if not exists agent_state;
revoke all on schema agent_state from public;
revoke all on schema agent_state from vistra_app;
