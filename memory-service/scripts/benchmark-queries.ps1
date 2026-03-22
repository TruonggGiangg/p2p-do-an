param(
  [string]$BaseUrl = "http://localhost:5055",
  [int]$Limit = 6
)

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

$results = @()

foreach ($q in $queries) {
  $body = @{ question = $q; limit = $Limit } | ConvertTo-Json -Compress
  $resp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/agent/context" -ContentType "application/json" -Body $body

  $top = if ($resp.result.chunks.Count -gt 0) { $resp.result.chunks[0].path } else { "(none)" }
  $results += [PSCustomObject]@{
    query = $q
    mode = $resp.result.mode
    strategy = $resp.result.strategy
    totalMs = $resp.result.timings.totalMs
    keywordMs = $resp.result.timings.keywordMs
    vectorMs = $resp.result.timings.vectorMs
    graphMs = $resp.result.timings.graphMs
    topPath = $top
  }
}

$avg = [Math]::Round((($results | Measure-Object -Property totalMs -Average).Average), 2)
$p95Index = [Math]::Floor($results.Count * 0.95)
$sorted = $results | Sort-Object totalMs
$p95 = $sorted[[Math]::Min($p95Index, $sorted.Count - 1)].totalMs

Write-Output "==== Benchmark Summary ===="
Write-Output "Queries: $($results.Count)"
Write-Output "Avg total ms: $avg"
Write-Output "P95 total ms: $p95"
Write-Output ""
$results | Format-Table -AutoSize
