# Script 12: View All Credit Scores
# Sử dụng: .\12-view-all-credit-scores.ps1
# Mục đích: Xem tất cả loans và credit scores của chúng

Write-Host "=== 12. VIEW ALL CREDIT SCORES ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$fineractBaseUrl = "http://localhost:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123"

# ============================================================================
# Get OAuth2 Token
# ============================================================================
Write-Host "`nGetting OAuth2 token..." -ForegroundColor Yellow
$tokenUrl = "$keycloakUrl/realms/fineract/protocol/openid-connect/token"

try {
    $tokenBody = "username=$username&password=$password&client_id=$oauthClientId&grant_type=password&client_secret=$clientSecret"
    $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResponse.access_token
    Write-Host "Token OK" -ForegroundColor Green
} catch {
    Write-Host "Error getting OAuth2 token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
    "Fineract-Platform-TenantId" = "default"
    "Accept" = "application/json"
}

# ============================================================================
# Get All Loans
# ============================================================================
Write-Host "`nFetching all loans..." -ForegroundColor Yellow

try {
    $loans = Invoke-RestMethod -Uri "$fineractBaseUrl/loans?limit=100&associations=all" -Method Get -Headers $headers
    
    if (-not $loans -or $loans.Count -eq 0) {
        Write-Host "No loans found in the system." -ForegroundColor Red
        exit 0
    }
    
    $loanCount = if ($loans -is [array]) { $loans.Count } else { 1 }
    Write-Host "Found $loanCount loan(s)" -ForegroundColor Green
} catch {
    Write-Host "Error fetching loans: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ============================================================================
# Display Results
# ============================================================================
Write-Host "`nCREDIT SCORES - ALL LOANS" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$results = @()
$loansWithScores = 0

$loanList = if ($loans -is [array]) { $loans } else { @($loans) }

foreach ($loan in $loanList) {
    $loanId = $loan.id
    $clientName = $loan.clientName
    $accountNo = $loan.accountNo
    $principal = $loan.principal
    $status = if ($loan.status) { $loan.status.value } else { "Unknown" }
    
    # Try to get credit score
    try {
        $score = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables/credit_score/$loanId" -Method Get -Headers $headers
        
        if ($score -and $score.Count -gt 0) {
            $scoreData = $score[0]
            $loansWithScores++
            
            $result = [PSCustomObject]@{
                LoanId = $loanId
                AccountNo = $accountNo
                Client = $clientName
                Principal = $principal
                Status = $status
                Score = $scoreData.score
                Method = $scoreData.scoring_method
                RiskLevel = $scoreData.risk_level
                Accuracy = if ($scoreData.accuracy) { "$([math]::Round($scoreData.accuracy * 100, 1))" } else { "N/A" }
                Color = $scoreData.overall_color
                RatingDate = $scoreData.rating_date
            }
            
            $results += $result
            
            # Display with color coding
            $color = switch ($scoreData.risk_level) {
                "good" { "Green" }
                "medium" { "Yellow" }
                "bad" { "Red" }
                default { "White" }
            }
            
            Write-Host "`nLoan $loanId - $accountNo" -ForegroundColor $color
            Write-Host "  Client: $clientName" -ForegroundColor White
            Write-Host "  Principal: $principal" -ForegroundColor White
            Write-Host "  Status: $status" -ForegroundColor White
            Write-Host "  Score: $($scoreData.score) / 850" -ForegroundColor $color
            Write-Host "  Risk Level: $($scoreData.risk_level.ToUpper())" -ForegroundColor $color
            Write-Host "  Method: $($scoreData.scoring_method)" -ForegroundColor White
            Write-Host "  Accuracy: $($result.Accuracy)%" -ForegroundColor White
            Write-Host "  Rated: $($scoreData.rating_date)" -ForegroundColor White
        }
    } catch {
        # No credit score for this loan
    }
}

# ============================================================================
# Summary Statistics
# ============================================================================
Write-Host "`n`nSUMMARY STATISTICS" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

Write-Host "`nOverall:" -ForegroundColor Yellow
$totalLoans = if ($loans -is [array]) { $loans.Count } else { 1 }
Write-Host "  Total Loans: $totalLoans" -ForegroundColor White
Write-Host "  Loans with Scores: $loansWithScores" -ForegroundColor White
Write-Host "  Loans without Scores: $($totalLoans - $loansWithScores)" -ForegroundColor White

if ($results.Count -gt 0) {
    $avgScore = [math]::Round(($results | Measure-Object -Property Score -Average).Average, 0)
    $goodCount = ($results | Where-Object { $_.RiskLevel -eq "good" }).Count
    $mediumCount = ($results | Where-Object { $_.RiskLevel -eq "medium" }).Count
    $badCount = ($results | Where-Object { $_.RiskLevel -eq "bad" }).Count
    
    Write-Host "`nScore Distribution:" -ForegroundColor Yellow
    Write-Host "  Average Score: $avgScore / 850" -ForegroundColor White
    Write-Host "  Good Risk (>700): $goodCount loan(s)" -ForegroundColor Green
    Write-Host "  Medium Risk (500-700): $mediumCount loan(s)" -ForegroundColor Yellow
    Write-Host "  Bad Risk (<500): $badCount loan(s)" -ForegroundColor Red
    
    Write-Host "`nScoring Methods:" -ForegroundColor Yellow
    $methods = $results | Group-Object -Property Method
    foreach ($method in $methods) {
        Write-Host "  $($method.Name): $($method.Count) loan(s)" -ForegroundColor White
    }
}

# ============================================================================
# Export Option
# ============================================================================
if ($results.Count -gt 0) {
    $exportPath = "credit-scores-export-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv"
    $results | Export-Csv -Path $exportPath -NoTypeInformation -Encoding UTF8
    Write-Host "`nData exported to: $exportPath" -ForegroundColor Cyan
}

# ============================================================================
# URLs
# ============================================================================
Write-Host "`nUseful URLs:" -ForegroundColor Yellow
Write-Host "  - Swagger UI: http://localhost:8080/fineract-provider/swagger-ui/index.html" -ForegroundColor Cyan
Write-Host "  - Web App Loans: http://localhost:4200/#/loans" -ForegroundColor Cyan

Write-Host "`nScript Completed" -ForegroundColor Green
