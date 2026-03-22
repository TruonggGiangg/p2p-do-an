param(
  [string]$BackupRoot = "./backups",
  [string]$ComposeFile = "../docker-compose.memory.yml"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputDir = Join-Path $BackupRoot $timestamp
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Write-Output "[backup] output: $outputDir"

Push-Location (Split-Path $ComposeFile -Parent)
try {
  Write-Output "[backup] dumping Neo4j"
  docker compose -f (Split-Path $ComposeFile -Leaf) exec -T neo4j-memory neo4j-admin database dump neo4j --to-path=/tmp
  docker compose -f (Split-Path $ComposeFile -Leaf) cp neo4j-memory:/tmp/neo4j.dump "$outputDir/neo4j.dump"

  Write-Output "[backup] exporting Qdrant snapshots"
  Invoke-RestMethod -Method POST -Uri "http://localhost:6333/snapshots"
  $snapshots = Invoke-RestMethod -Method GET -Uri "http://localhost:6333/snapshots"
  if ($snapshots.result -and $snapshots.result.Count -gt 0) {
    $latest = $snapshots.result | Sort-Object { $_.creation_time } -Descending | Select-Object -First 1
    Invoke-WebRequest -Uri "http://localhost:6333/snapshots/$($latest.name)" -OutFile "$outputDir/qdrant_$($latest.name)"
  }

  Write-Output "[backup] done"
}
finally {
  Pop-Location
}
