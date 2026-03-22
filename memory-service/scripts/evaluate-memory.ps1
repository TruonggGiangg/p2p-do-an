param(
  [string]$BaseUrl = "http://localhost:5055",
  [string]$DatasetPath = "./scripts/eval-dataset.json",
  [string]$ReportDir = "./tmp/eval-reports",
  [ValidateSet("default", "golive")]
  [string]$QualityProfile = "default",
  [int]$Limit = 8,
  [int]$TopK = 5,
  [switch]$SkipAnswer,
  [double]$MinRetrievalHitRate = 0.75,
  [double]$MinAnswerKeywordRate = 0.60,
  [int]$MinCaseCount = 0,
  [switch]$SkipReport,
  [switch]$Enforce
)

$ErrorActionPreference = 'Stop'

function Normalize-Text {
  param([string]$Text)
  if (-not $Text) { return '' }
  return $Text.ToLowerInvariant()
}

function Has-AnyPathHit {
  param(
    [array]$Chunks,
    [array]$PathHints,
    [int]$TopKLocal
  )

  if (-not $Chunks -or $Chunks.Count -eq 0) { return $false }
  if (-not $PathHints -or $PathHints.Count -eq 0) { return $false }

  $top = $Chunks | Select-Object -First $TopKLocal
  foreach ($chunk in $top) {
    $path = Normalize-Text $chunk.path
    foreach ($hint in $PathHints) {
      $h = Normalize-Text $hint
      if ($h -and $path.Contains($h)) {
        return $true
      }
    }
  }

  return $false
}

function Get-KeywordCoverage {
  param(
    [string]$Answer,
    [array]$Keywords
  )

  if (-not $Keywords -or $Keywords.Count -eq 0) {
    return 1.0
  }

  $ans = Normalize-Text $Answer
  if (-not $ans) {
    return 0.0
  }

  $matched = 0
  foreach ($kw in $Keywords) {
    $k = Normalize-Text $kw
    if ($k -and $ans.Contains($k)) {
      $matched += 1
    }
  }

  return [double]$matched / [double]$Keywords.Count
}

if (-not (Test-Path $DatasetPath)) {
  throw "Dataset not found: $DatasetPath"
}

if ($QualityProfile -eq "golive") {
  $MinRetrievalHitRate = 0.90
  $MinAnswerKeywordRate = 0.85
  if ($MinCaseCount -lt 50) {
    $MinCaseCount = 50
  }
}

$datasetRaw = Get-Content -Path $DatasetPath -Raw
$dataset = $datasetRaw | ConvertFrom-Json
if (-not $dataset -or $dataset.Count -eq 0) {
  throw "Dataset is empty: $DatasetPath"
}

Write-Output "==== Memory Evaluation ===="
Write-Output "Dataset: $DatasetPath"
Write-Output "ReportDir: $ReportDir"
Write-Output "QualityProfile: $QualityProfile"
Write-Output "Cases: $($dataset.Count)"
Write-Output "TopK: $TopK"
Write-Output ""

$rows = @()

foreach ($item in $dataset) {
  $q = [string]$item.question
  $body = @{ question = $q; limit = $Limit } | ConvertTo-Json -Compress

  $ctx = Invoke-RestMethod -Method POST -Uri "$BaseUrl/agent/context" -ContentType "application/json" -Body $body
  $retrieval = $ctx.result

  $pathHit = Has-AnyPathHit -Chunks $retrieval.chunks -PathHints $item.expectedPathHints -TopKLocal $TopK

  $answerCoverage = 0.0
  $providerUsed = "(skipped)"
  if (-not $SkipAnswer) {
    $ansBody = @{ question = $q; debug = $true; limit = $Limit } | ConvertTo-Json -Compress
    $ans = Invoke-RestMethod -Method POST -Uri "$BaseUrl/agent/answer" -ContentType "application/json" -Body $ansBody
    $providerUsed = [string]$ans.debug.providerUsed
    $answerCoverage = Get-KeywordCoverage -Answer ([string]$ans.answer) -Keywords $item.expectedAnswerKeywords
  }

  $rows += [PSCustomObject]@{
    id = [string]$item.id
    type = [string]$item.type
    mode = [string]$retrieval.mode
    strategy = [string]$retrieval.strategy
    totalMs = [int]$retrieval.timings.totalMs
    retrievalHit = $pathHit
    answerKeywordCoverage = [Math]::Round($answerCoverage, 2)
    providerUsed = $providerUsed
    topPath = if ($retrieval.chunks.Count -gt 0) { [string]$retrieval.chunks[0].path } else { "(none)" }
  }
}

$retrievalHits = ($rows | Where-Object { $_.retrievalHit }).Count
$retrievalHitRate = [double]$retrievalHits / [double]$rows.Count

$avgMs = [Math]::Round((($rows | Measure-Object -Property totalMs -Average).Average), 2)
$sorted = $rows | Sort-Object totalMs
$p95Index = [Math]::Floor($rows.Count * 0.95)
$p95Ms = [double]($sorted[[Math]::Min($p95Index, $sorted.Count - 1)].totalMs)

$answerKeywordRate = 1.0
if (-not $SkipAnswer) {
  $answerKeywordRate = [Math]::Round((($rows | Measure-Object -Property answerKeywordCoverage -Average).Average), 4)
}

Write-Output "==== Case Results ===="
$rows | Format-Table -AutoSize

Write-Output ""
Write-Output "==== Summary ===="
Write-Output ("Retrieval hit rate: {0:P2} ({1}/{2})" -f $retrievalHitRate, $retrievalHits, $rows.Count)
if (-not $SkipAnswer) {
  Write-Output ("Answer keyword rate: {0:P2}" -f $answerKeywordRate)
}
Write-Output ("Avg total ms: {0}" -f $avgMs)
Write-Output ("P95 total ms: {0}" -f $p95Ms)
Write-Output ("Min retrieval hit rate: {0:P2}" -f $MinRetrievalHitRate)
if (-not $SkipAnswer) {
  Write-Output ("Min answer keyword rate: {0:P2}" -f $MinAnswerKeywordRate)
}
Write-Output ("Min case count: {0}" -f $MinCaseCount)

$retrievalPass = $retrievalHitRate -ge $MinRetrievalHitRate
$answerPass = $true
if (-not $SkipAnswer) {
  $answerPass = $answerKeywordRate -ge $MinAnswerKeywordRate
}
$caseCountPass = $rows.Count -ge $MinCaseCount

if ($retrievalPass -and $answerPass -and $caseCountPass) {
  Write-Output "Result: PASS"
} else {
  Write-Warning ("Result: FAIL | retrievalHitRate>={0} answerKeywordRate>={1} caseCount>={2}" -f $MinRetrievalHitRate, $MinAnswerKeywordRate, $MinCaseCount)
}

$resultLabel = if ($retrievalPass -and $answerPass -and $caseCountPass) { 'PASS' } else { 'FAIL' }

if (-not $SkipReport) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  if (-not (Test-Path $ReportDir)) {
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
  }

  $detailsPath = Join-Path $ReportDir "eval-$timestamp-details.json"
  $detailsCsvPath = Join-Path $ReportDir "eval-$timestamp-cases.csv"
  $summaryPath = Join-Path $ReportDir "eval-$timestamp-summary.json"
  $latestSummaryPath = Join-Path $ReportDir "latest-summary.json"

  $summary = [PSCustomObject]@{
    timestamp = (Get-Date).ToString("o")
    datasetPath = $DatasetPath
    baseUrl = $BaseUrl
    qualityProfile = $QualityProfile
    cases = $rows.Count
    topK = $TopK
    skipAnswer = [bool]$SkipAnswer
    retrievalHitRate = [Math]::Round($retrievalHitRate, 4)
    retrievalHits = $retrievalHits
    answerKeywordRate = [Math]::Round($answerKeywordRate, 4)
    caseCountPass = $caseCountPass
    avgMs = $avgMs
    p95Ms = $p95Ms
    minRetrievalHitRate = $MinRetrievalHitRate
    minAnswerKeywordRate = $MinAnswerKeywordRate
    minCaseCount = $MinCaseCount
    result = $resultLabel
  }

  $detailsObj = [PSCustomObject]@{
    summary = $summary
    rows = $rows
  }

  $detailsObj | ConvertTo-Json -Depth 8 | Set-Content -Path $detailsPath -Encoding UTF8
  $rows | Export-Csv -Path $detailsCsvPath -NoTypeInformation -Encoding UTF8
  $summary | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryPath -Encoding UTF8
  $summary | ConvertTo-Json -Depth 6 | Set-Content -Path $latestSummaryPath -Encoding UTF8

  Write-Output ""
  Write-Output "==== Report Artifacts ===="
  Write-Output "Details JSON: $detailsPath"
  Write-Output "Cases CSV:    $detailsCsvPath"
  Write-Output "Summary JSON: $summaryPath"
  Write-Output "Latest JSON:  $latestSummaryPath"
}

if ($Enforce -and (-not ($retrievalPass -and $answerPass -and $caseCountPass))) {
  exit 1
}

if ($Enforce) {
  exit 0
}
