param(
  [string]$RepoPath = "",
  [switch]$Enforce
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

if (-not $RepoPath) {
  $RepoPath = Resolve-Path (Join-Path $PSScriptRoot "..")
}

Set-Location $RepoPath

$changedFiles = @(git -c core.safecrlf=false diff --name-only HEAD 2>$null)
if (-not $changedFiles -or $changedFiles.Count -eq 0) {
  Write-Output "Doc rule check: no changed files detected."
  exit 0
}

function HasChanged([string[]]$patterns) {
  foreach ($pattern in $patterns) {
    if ($changedFiles | Where-Object { $_ -like $pattern }) {
      return $true
    }
  }
  return $false
}

$docsChanged = @(
  'README.md',
  'IMPLEMENTATION_BLUEPRINT.vi.md',
  'AGENT_RULES.md',
  '.env.example'
)

$hasReadmeChanged = HasChanged @('README.md')
$hasAnyCoreDocChanged = HasChanged @('README.md', 'IMPLEMENTATION_BLUEPRINT.vi.md', 'AGENT_RULES.md')
$hasAnyDocChanged = HasChanged $docsChanged

$violations = @()

# A. API/contract changes
if (HasChanged @('src/server.js')) {
  if (-not $hasAnyCoreDocChanged) {
    $violations += 'Changed src/server.js but no doc updated (README.md or IMPLEMENTATION_BLUEPRINT.vi.md).'
  }
}

# B. Retrieval/ranking changes
if (HasChanged @('src/retrieval.js', 'src/answerer.js')) {
  if (-not $hasAnyCoreDocChanged) {
    $violations += 'Changed retrieval/answerer logic but no doc updated (README.md or IMPLEMENTATION_BLUEPRINT.vi.md).'
  }
}

# C. Config/env changes
if (HasChanged @('src/config.js', '.env.example', '../docker-compose.memory.yml', 'docker-compose.memory.yml')) {
  if (-not $hasReadmeChanged) {
    $violations += 'Changed config/env but README.md was not updated.'
  }
}

# D. Ingest/index schema changes
if (HasChanged @('src/indexer.js', 'src/neo4j.js', 'src/vectorStore.js')) {
  if (-not $hasAnyCoreDocChanged) {
    $violations += 'Changed ingest/index schema but no doc updated (README.md or IMPLEMENTATION_BLUEPRINT.vi.md).'
  }
}

Write-Output "==== Doc Rule Check ===="
Write-Output "Changed files: $($changedFiles.Count)"
Write-Output "Any docs changed: $hasAnyDocChanged"

if ($violations.Count -eq 0) {
  Write-Output "Result: PASS"
  exit 0
}

Write-Warning "Result: FAIL"
$violations | ForEach-Object { Write-Warning $_ }

if ($Enforce) {
  exit 1
}

exit 0
