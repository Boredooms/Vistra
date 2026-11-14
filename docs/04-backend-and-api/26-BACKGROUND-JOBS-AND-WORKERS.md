# Background Jobs and Workers

**Doc ID:** 26 · **Status:** Approved · **Area:** Backend
**Depends on:** [22](22-BACKEND-ARCHITECTURE.md) · **Related:** [25](25-REALTIME-AND-EVENT-ARCHITECTURE.md), [36](../06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md), [46](../07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md)

---

## 1. Purpose

Specify durable background processing: job model, claiming, heartbeats, retries, dead letter, cancellation,
worker commands, scaling, and shutdown. Long work must survive deploys and crashes without duplicate side
effects.

## 2. Job model

Every background unit is a row (source of truth) plus a Redis signal (latency optimization).

```sql
-- generic jobs table (backend internals); ingestion uses its typed table
create table jobs (
  id uuid primary key,
  organization_id text not null,
  type text not null,                  -- agent.run, webhook.deliver, usage.rollup, knowledge.ingest
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','dead','cancelled')),
  priority smallint not null default 100,
  attempt integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_by text, locked_at timestamptz, heartbeat_at timestamptz,
  dedupe_key text,
  error_code text, error_detail text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (dedupe_key)
);
create index idx_jobs_claim on jobs (priority, run_after) where status in ('queued','failed');
```

Ingestion uses `ingestion_jobs` (doc 16) with the same semantics plus stage tracking.

## 3. Claim loop

```python
while not stopping:
    job = await claim_next(worker_id)          # SKIP LOCKED, priority, run_after <= now()
    if job is None:
        await wait_for_signal(timeout=5)       # Redis BRPOP or sleep
        continue
    try:
        await handlers[job.type](job)
        await mark_succeeded(job)
    except RetryableError as e:
        await schedule_retry(job, e)
    except PermanentError as e:
        await mark_failed(job, e)
    except CancelledError:
        await mark_cancelled(job)
```

```sql
-- claim (atomic)
update jobs set status='running', locked_by=:wid, locked_at=now(), heartbeat_at=now(),
                attempt=attempt+1
where id = (
  select id from jobs
  where status in ('queued','failed') and run_after <= now()
  order by priority, run_after
  for update skip locked
  limit 1
)
returning *;
```

## 4. Heartbeats and reclamation

- Long jobs update `heartbeat_at` every 15 s.
- A reaper (pg_cron, every minute) resets jobs with `heartbeat_at < now() - interval '90 seconds'` to
  `status='failed'` with `error_code=WORKER_LOST`; retry policy applies.
- Handlers **must be resumable**: on retry, they check existing progress (e.g. chunks already indexed,
  steps already executed) and continue rather than restart from zero.
- Side effects use idempotency keys so a reclaimed job cannot duplicate them (doc 45).

## 5. Retry policy

| Error class | Retry | Backoff | Notes |
|---|---|---|---|
| `RetryableError` (5xx, timeout, 429) | yes | exponential + jitter, base 2 s, cap 5 min | respects `Retry-After` |
| `PermanentError` (validation, unsupported file, 4xx) | no | — | surface to user |
| `PolicyError` | no | — | recorded in trace |
| `WorkerLost` | yes | immediate (1 attempt burned) | resume semantics |
| `CancelledByUser` | no | — | `cancelled` |

Max attempts: 3 default, 5 for ingestion, 8 for webhooks. After exhaustion: `dead`, an `error_events` row,
and a metric/alert.

## 6. Queues and priorities

| Queue | Handler examples | Concurrency (per replica) | Priority band |
|---|---|---|---|
| `agent` | run steps, resume, workflow steps | 8 | 10–30 |
| `ingestion` | fetch, parse, chunk, embed, index | 4 | 40 |
| `webhook` | delivery attempts | 32 | 60 |
| `maintenance` | retention, rollups, reindex, reaper | 2 | 90 |
| `evaluation` | suite runs | 2 | 80 |

Priority bands prevent interactive work from starving behind bulk ingestion. Each queue has its own worker
deployment so scaling is independent.

## 7. Worker commands

```bash
python -m app.workers.agent        --queues agent --concurrency 8
python -m app.workers.ingestion    --queues ingestion --concurrency 4
python -m app.workers.webhook      --queues webhook --concurrency 32
python -m app.workers.maintenance  --queues maintenance
python -m app.workers.evaluation   --queues evaluation
```

Common flags: `--drain-timeout 25`, `--heartbeat 15`, `--once` (tests), `--metrics-port 9101`.

## 8. Shutdown behavior

1. `SIGTERM` → set `stopping=true`, stop claiming.
2. Finish the current unit if it can complete within 20 s; otherwise checkpoint and requeue (status back to
   `queued`, attempt not incremented for graceful release).
3. Flush telemetry, close DB/Redis pools.
4. Exit 0 within 25 s (Render's grace window). If exceeded, the process is killed and the reaper recovers.

## 9. Cancellation

- User cancel sets `agent_runs.cancel_requested_at` and publishes a control message on the Redis channel
  `run:{id}:control`.
- The orchestrator checks the flag at every step boundary and before each side effect.
- Ingestion cancel is checked between documents/pages; partial artifacts are cleaned.
- Cancellation is never implemented by killing a thread (unsafe with DB transactions).

## 10. Deduplication

`dedupe_key` examples:
- `knowledge.ingest:{document_id}:{content_hash}`
- `agent.run:{run_id}:{step_index}`
- `webhook.deliver:{delivery_id}:{attempt_bucket}`
- `usage.rollup:{org_id}:{hour}`

A duplicate enqueue is a no-op returning the existing job id. This is the last line of defense behind
idempotency keys.

## 11. Scheduling

`pg_cron` (or a maintenance worker with an interval) creates scheduled jobs:

| Schedule | Job |
|---|---|
| every 1 min | reaper, outbox dispatch, delivery due scan |
| hourly | usage rollups, session idle-close |
| daily 03:00 UTC | retention sweep, orphan file sweep, reindex checks |
| weekly | backup verification, index bloat check, eval regression suite |

Scheduled jobs are idempotent and safe to run twice.

## 12. Observability

Metrics per queue: depth, oldest job age, throughput, success/failure/dead counts, p95 duration, retries.
Per job type: attempt histogram, error codes. Alerts: depth > 1000 for 10 min, oldest > 10 min for interactive
queues, dead > 0 for webhook/ingestion, worker heartbeat missing.

## 13. Failure scenarios

| Scenario | Behavior |
|---|---|
| Worker crash mid-job | Heartbeat expires → reclaim → resume from checkpoint |
| Poison payload | Fails validation → `dead` immediately, alert |
| DB connection lost | Job requeued; retries with backoff |
| Redis down | Claim loop continues via DB polling with 5 s sleep |
| Duplicate enqueue | Deduped |
| Deploy during long ingestion | Graceful release → another replica resumes |
| Clock skew | All times from DB `now()`, never local time |

## 14. Testing

- Unit: retry classification, backoff calculation, dedupe.
- Integration: claim concurrency (N workers, one job), reaper reclaim, cancellation, SIGTERM drain.
- Chaos: kill -9 mid-run; verify resume without duplicate side effect.
- Load: ingestion throughput and queue latency at 4× expected depth.

## 15. Acceptance criteria

- [ ] No background work exists outside a persisted job row.
- [ ] Every handler is idempotent or refuses retry.
- [ ] Graceful shutdown completes within 25 s and never loses a claimed job.
- [ ] Dead jobs are visible and alertable.
- [ ] Scheduled jobs are safe to run concurrently.

## 16. Related documents

[22](22-BACKEND-ARCHITECTURE.md) · [25](25-REALTIME-AND-EVENT-ARCHITECTURE.md) ·
[36](../06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) ·
[43](../07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) ·
[69](../12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md)

## 17. References

- PostgreSQL `SKIP LOCKED` — https://www.postgresql.org/docs/current/sql-select.html
- Render background workers — https://render.com/docs/background-workers
