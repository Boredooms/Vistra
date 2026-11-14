# Actions and security

The model proposes, policy decides, and execution is verified. A model never grants itself permission.

## Actions

To let the assistant act, give your application a tool base URL and register tools such as create_project. VISTRA calls your endpoint at the tool base URL followed by /api/vistra/tools/ and the tool name. Every call carries an HMAC-SHA256 signature of the tool name, arguments, run id and timestamp. Reject calls older than 60 seconds and any signature you have already seen.

## Policy and approval

Each tool has a policy: allow, require approval, or deny. A tool that is not registered is always denied with the code POLICY_DENIED. When approval is required the user sees the exact arguments. The approval is bound to a SHA-256 hash of those arguments, so changing them invalidates it.

## Verification

After a tool runs, VISTRA reads the state back from your application and checks that the record really exists. Only then is the action marked verified. If verification fails the run is reported as failed and the interface says so.

## Tenant isolation

Every tenant table carries an organization id and row level security is enabled and forced. A second organization can never read another's documents, runs or keys. Cross-tenant lookups return 404 rather than 403 so existence is not leaked.

## Secrets

API keys are stored as SHA-256 hashes and shown once. Browsers only hold short-lived session tokens. Per-application tool signing secrets are encrypted at rest.

## Provider failover

Answers are served by Gemini by default. If it fails with a retryable error, VISTRA retries twice with jitter, trips a circuit breaker after five failures, and falls back to NVIDIA NIM when the fallback supports the capability. The run page shows which provider served each call.
