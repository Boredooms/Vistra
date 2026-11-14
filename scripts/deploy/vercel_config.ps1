# Configures the vistra-web and vistra-acme-demo Vercel projects (root directory + production env vars).
# Uses the Vercel CLI's own login token. Values are read from local env files and never printed.
param([string]$Api = "https://vistra-api.onrender.com", [string]$WebUrl = "https://vistra-web.vercel.app")
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/../.."
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" | ConvertFrom-Json).token
$team = (Get-Content "$root/apps/web/.vercel/project.json" | ConvertFrom-Json).orgId
$H = @{ Authorization = "Bearer $token" }

function Read-Env($path) {
  $m = @{}
  Get-Content $path | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $m[$k] = $v }
  $m
}

function Configure($project, $rootDir, [hashtable]$vars) {
  $body = @{ rootDirectory = $rootDir; framework = "nextjs"; sourceFilesOutsideRootDirectory = $true } | ConvertTo-Json
  Invoke-RestMethod -Method Patch "https://api.vercel.com/v9/projects/$project`?teamId=$team" -Headers $H -ContentType "application/json" -Body $body | Out-Null
  $list = $vars.GetEnumerator() | ForEach-Object {
    @{ key = $_.Key; value = [string]$_.Value; type = $(if ($_.Key -like "NEXT_PUBLIC_*") { "plain" } else { "encrypted" }); target = @("production", "preview") }
  }
  $json = ConvertTo-Json @($list) -Depth 4
  Invoke-RestMethod -Method Post "https://api.vercel.com/v10/projects/$project/env?upsert=true&teamId=$team" -Headers $H -ContentType "application/json" -Body $json | Out-Null
  "$project : root=$rootDir, $($vars.Count) env vars set ($((($vars.Keys | Sort-Object) -join ', ')))"
}

$web = Read-Env "$root/apps/web/.env.local"
$rootEnv = Read-Env "$root/.env"
$webVars = @{}
foreach ($k in $web.Keys) { $webVars[$k] = $web[$k] }
$webVars["NEXT_PUBLIC_VISTRA_API_URL"] = $Api
$webVars["VISTRA_API_URL"] = $Api
$webVars["NEXT_PUBLIC_SITE_URL"] = $WebUrl
$webVars["NEXT_PUBLIC_NPM_PUBLISHED"] = "1"
if ($rootEnv["WEB_VISTRA_API_KEY"]) { $webVars["VISTRA_API_KEY"] = $rootEnv["WEB_VISTRA_API_KEY"] }
Configure "vistra-web" "apps/web" $webVars

$demo = Read-Env "$root/apps/demo/.env.local"
# The demo is a separate customer site: it gets its database and the API URL; the app ID + key are pasted on /setup.
$demoVars = @{
  DEMO_DATABASE_URL                = $demo["DEMO_DATABASE_URL"]
  DEMO_INSTANCE                    = "production"
  NEXT_PUBLIC_VISTRA_DASHBOARD_URL = "$WebUrl/dashboard"
  NEXT_PUBLIC_VISTRA_API_URL       = $Api
}
Configure "vistra-acme-demo" "apps/demo" $demoVars
