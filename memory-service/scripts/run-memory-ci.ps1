param(
  [string]$BaseUrl = "http://localhost:5055",
  [int]$Limit = 6,
  [string]$EvalDatasetPath = "./scripts/eval-dataset.json",
  [string]$GoLiveDatasetPath = "./scripts/eval-dataset-golive.json",
  [string]$EvalReportDir = "./tmp/eval-reports",
  [ValidateSet("default", "golive")]
  [string]$EvalQualityProfile = "default",
  [double]$EvalMinRetrievalHitRate = 0.75,
  [double]$EvalMinAnswerKeywordRate = 0.60,
  [int]$EvalMinCaseCount = 0,
  [switch]$SkipIngest,
  [switch]$SkipResetRecent,
  [switch]$CheckDocRules,
  [switch]$EnforceDocRules,
  [switch]$RunEval,
  [switch]$EnforceEval,
  [switch]$SkipEvalReport,
  [switch]$GoLiveGate,
  [double]$MaxAvgMs = 250,
  [double]$MaxP95Ms = 500,
  [switch]$EnforceThresholds,
  [string]$Secret = ""
)

if ($GoLiveGate) {
  $MaxAvgMs = 100
  $MaxP95Ms = 150
  $EvalQualityProfile = "golive"
  $EvalMinRetrievalHitRate = 0.90
  $EvalMinAnswerKeywordRate = 0.85
  if ($EvalMinCaseCount -lt 50) {
    $EvalMinCaseCount = 50
  }
  if (Test-Path $GoLiveDatasetPath) {
    $EvalDatasetPath = $GoLiveDatasetPath
  }
}

if (-not $Secret -and $env:MEMORY_WEBHOOK_SECRET) {
  $Secret = $env:MEMORY_WEBHOOK_SECRET
}

if (-not $Secret) {
  $Secret = "change-this-secret"
}

$headers = @{ "Content-Type" = "application/json" }
if ($Secret) {
  $headers["x-memory-secret"] = $Secret
}

function Invoke-MemoryApi {
  param(
    [string]$Method,
    [string]$Url,
    [string]$Body = "",
    [hashtable]$CustomHeaders
  )

  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $CustomHeaders -Body $Body
  }

  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $CustomHeaders
}

$queries = @(
  "flow giai ngan tu escrow sang borrower nam o dau",
  "api nao tao transfer accounttransfers va tinh fee",
  "vi sao co 2 buoc main to investment roi investment to escrow",
  "loan approve-check endpoint nam o file nao",
  "cho nao build payload transferDate cho fineract",
  "logic default rate dashboard lay tu dau",
  "tim symbol transferFunds duoc goi o dau",
  "webhook loan approved route o file nao",
  "fineract escrow account client id duoc xac dinh ra sao",
  "ham nao map pending loans thanh notifications"
)

Write-Output "==== Memory Service CI ===="
Write-Output "Benchmark thresholds: avg<=$MaxAvgMs, p95<=$MaxP95Ms"
Write-Output "Eval dataset: $EvalDatasetPath"

if ($CheckDocRules -or $EnforceDocRules) {
  Write-Output "Running doc rule check..."
  $docScript = Join-Path $PSScriptRoot "check-doc-rules.ps1"
  if (Test-Path $docScript) {
    if ($EnforceDocRules) {
      & $docScript -Enforce
      if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
      }
    } else {
      & $docScript
    }
  } else {
    Write-Warning "Doc rule script not found: $docScript"
  }
}

$health = Invoke-MemoryApi -Method GET -Url "$BaseUrl/health" -CustomHeaders @{}
if (-not $health.ok) {
  throw "Health check failed"
}
Write-Output "Health: OK ($($health.service))"

if (-not $SkipResetRecent) {
  try {
    $resetBody = @{ scope = "recent" } | ConvertTo-Json -Compress
    $resetRes = Invoke-MemoryApi -Method POST -Url "$BaseUrl/metrics/reset" -Body $resetBody -CustomHeaders $headers
    Write-Output "Metrics reset: $($resetRes.scope)"
  } catch {
    Write-Warning "Metrics reset skipped/failed: $($_.Exception.Message)"
  }
}

if (-not $SkipIngest) {
  $ingestBody = "{}"
  $ingestRes = Invoke-MemoryApi -Method POST -Url "$BaseUrl/memory/ingest" -Body $ingestBody -CustomHeaders $headers
  if (-not $ingestRes.ok) {
    throw "Ingest failed"
  }
  Write-Output "Ingest: OK ($($ingestRes.durationMs) ms)"
}

$results = @()
foreach ($q in $queries) {
  $body = @{ question = $q; limit = $Limit } | ConvertTo-Json -Compress
  $resp = Invoke-MemoryApi -Method POST -Url "$BaseUrl/agent/context" -Body $body -CustomHeaders $headers

  $top = if ($resp.result.chunks.Count -gt 0) { $resp.result.chunks[0].path } else { "(none)" }
  $results += [PSCustomObject]@{
    query = $q
    mode = $resp.result.mode
    strategy = $resp.result.strategy
    totalMs = [double]($resp.result.timings.totalMs)
    keywordMs = [double]($resp.result.timings.keywordMs)
    vectorMs = [double]($resp.result.timings.vectorMs)
    graphMs = [double]($resp.result.timings.graphMs)
    topPath = $top
  }
}

$avg = [Math]::Round((($results | Measure-Object -Property totalMs -Average).Average), 2)
$sorted = $results | Sort-Object totalMs
$p95Index = [Math]::Floor($results.Count * 0.95)
$p95 = [double]($sorted[[Math]::Min($p95Index, $sorted.Count - 1)].totalMs)

$metrics = Invoke-MemoryApi -Method GET -Url "$BaseUrl/metrics" -CustomHeaders @{}

Write-Output ""
Write-Output "==== Query Benchmark ===="
Write-Output "Queries: $($results.Count)"
Write-Output "Avg total ms: $avg"
Write-Output "P95 total ms: $p95"
Write-Output ""
$results | Format-Table -AutoSize

Write-Output ""
Write-Output "==== Metrics Snapshot ===="
Write-Output ("Recent retrieval: count={0}, avg={1}, p95={2}" -f $metrics.recent.retrieval.count, $metrics.recent.retrieval.avgMs, $metrics.recent.retrieval.p95Ms)
Write-Output ("Lifetime retrieval: count={0}, avg={1}" -f $metrics.lifetime.retrieval.count, $metrics.lifetime.retrieval.avgMs)

$passed = ($avg -le $MaxAvgMs) -and ($p95 -le $MaxP95Ms)
if ($passed) {
  Write-Output "Result: PASS (threshold avg<=$MaxAvgMs, p95<=$MaxP95Ms)"
} else {
  Write-Warning "Result: FAIL (threshold avg<=$MaxAvgMs, p95<=$MaxP95Ms)"
}

if ($EnforceThresholds -and -not $passed) {
  exit 1
}

if ($RunEval -or $EnforceEval) {
  Write-Output ""
  Write-Output "==== Evaluation Stage ===="
  $evalScript = Join-Path $PSScriptRoot "evaluate-memory.ps1"
  if (-not (Test-Path $evalScript)) {
    Write-Warning "Evaluation script not found: $evalScript"
    if ($EnforceEval) {
      exit 1
    }
  } else {
    $evalArgs = @{
      BaseUrl = $BaseUrl
      DatasetPath = $EvalDatasetPath
      Limit = $Limit
      ReportDir = $EvalReportDir
      QualityProfile = $EvalQualityProfile
      MinRetrievalHitRate = $EvalMinRetrievalHitRate
      MinAnswerKeywordRate = $EvalMinAnswerKeywordRate
      MinCaseCount = $EvalMinCaseCount
    }
    if ($SkipEvalReport) {
      $evalArgs.SkipReport = $true
    }

    if ($EnforceEval) {
      $evalArgs.Enforce = $true
      & $evalScript @evalArgs
      if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
      }
    } else {
      & $evalScript @evalArgs
    }
  }
}
