# Creates the vistra-api web service on Render from the local .env (values never printed).
# Usage: pwsh scripts/deploy/render_create.ps1 [-Cors "https://a.vercel.app,https://b.vercel.app"]
param([string]$Cors = "http://localhost:3000,http://localhost:3001")
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/../.."
# browser/client keys and per-environment values are not API configuration
$skip = 'VISTRA_API_KEY','VISTRA_ADMIN_KEY','WEB_VISTRA_API_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','APP_ENV','CORS_ALLOWED_ORIGINS','API_URL','APP_URL'
$envArgs = @()
Get-Content "$root/.env" | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  if ($skip -notcontains $k) { $envArgs += '--env-var'; $envArgs += "$k=$v" }
}
$envArgs += '--env-var', 'APP_ENV=production', '--env-var', 'PYTHON_VERSION=3.12.8', '--env-var', 'WORKER_EMBEDDED=true', '--env-var', "CORS_ALLOWED_ORIGINS=$Cors"
$start = 'uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers'
$out = render services create --name vistra-api --type web_service --repo https://github.com/Boredooms/Vistra --branch main `
  --runtime python --root-directory apps/api --region singapore --plan free `
  --build-command "pip install uv && uv sync --frozen --no-dev" --start-command $start --health-check-path /readyz `
  @envArgs --confirm -o json 2>&1
$txt = $out -join "`n"
try {
  $j = $txt | ConvertFrom-Json
  $s = if ($j.service) { $j.service } else { $j }
  "id=$($s.id)"; "url=$($s.serviceDetails.url)"; "dashboard=$($s.dashboardUrl)"
} catch {
  ($txt -replace '(?i)([A-Z_]*(KEY|SECRET|URL|TOKEN)[A-Z_]*)=\S+', '$1=***').Substring(0, [Math]::Min(1200, $txt.Length))
}
