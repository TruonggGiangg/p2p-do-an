# Script 12: View All Loans with Credit Scores
# Sử dụng: .\12-view-credit-scores.ps1
# Mục đích: Xem tất cả loans và credit scores của chúng

Write-Host "=== 12. VIEW ALL LOANS WITH CREDIT SCORES ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$fineractBaseUrl = "http://localhost:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123"

# Get OAuth2 Token
Write-Host "`nGetting OAuth2 token..." -ForegroundColor Yellow
$tokenUrl = "$keycloakUrl/realms/fineract/protocol/openid-connect/token"

try {
    $tokenBody = "username=$username&password=$password&client_id=$oauthClientId&grant_type=password&client_secret=$clientSecret"
    $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResponse.access_token
    Write-Host "✅ OAuth2 token OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting OAuth2 token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
    "Fineract-Platform-TenantId" = "default"
    "Accept" = "application/json"
}

# Get All Loans
Write-Host "`nFetching all loans..." -ForegroundColor Yellow

try {
    $loans = Invoke-RestMethod -Uri "$fineractBaseUrl/loans" -Method Get -Headers $headers
    
    if ($loans.totalFilteredRecords -eq 0) {
        Write-Host "⚠️  No loans found. Run .\11-credit-scorecard-setup.ps1 to create a loan." -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "✅ Found $($loans.totalFilteredRecords) loan(s)" -ForegroundColor Green
    
    Write-Host "`n╔═══════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                      LOANS WITH CREDIT SCORES                             ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    foreach ($loan in $loans.pageItems) {
        Write-Host "`n" -NoNewline
        Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
        Write-Host "🏦 Loan ID: $($loan.id) | Account: $($loan.accountNo)" -ForegroundColor White -BackgroundColor DarkBlue
        Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
        
        # Loan Basic Info
        Write-Host "  Client:          $($loan.clientName)" -ForegroundColor White
        Write-Host "  Product:         $($loan.loanProductName)" -ForegroundColor White
        Write-Host "  Principal:       $($loan.principal)" -ForegroundColor White
        Write-Host "  Status:          $($loan.status.value)" -ForegroundColor $(
            if ($loan.status.value -eq "Approved") { "Green" } 
            elseif ($loan.status.value -eq "Submitted and pending approval") { "Yellow" } 
            else { "White" }
        )
        
        # Try to get Credit Score
        try {
            $creditScore = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables/credit_score/$($loan.id)" -Method Get -Headers $headers -ErrorAction Stop
            
            if ($creditScore.Count -gt 0) {
                $score = $creditScore[0]
                Write-Host "`n  📊 CREDIT SCORE:" -ForegroundColor Cyan
                Write-Host "     Score:        $($score.score) $(
                    if ($score.score -ge 700) { '✅ (Good)' }
                    elseif ($score.score -ge 600) { '⚠️  (Fair)' }
                    else { '❌ (Poor)' }
                )" -ForegroundColor $(
                    if ($score.score -ge 700) { "Green" }
                    elseif ($score.score -ge 600) { "Yellow" }
                    else { "Red" }
                )
                Write-Host "     Method:       $($score.scoring_method)" -ForegroundColor White
                Write-Host "     Model:        $($score.scoring_model)" -ForegroundColor White
                Write-Host "     Risk Level:   $($score.risk_level)" -ForegroundColor $(
                    if ($score.risk_level -eq "good") { "Green" }
                    elseif ($score.risk_level -eq "medium") { "Yellow" }
                    else { "Red" }
                )
                Write-Host "     Accuracy:     $([math]::Round($score.accuracy * 100, 1))%" -ForegroundColor White
                Write-Host "     Rating Date:  $($score.rating_date)" -ForegroundColor White
            } else {
                Write-Host "`n  📊 CREDIT SCORE: Not Available" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "`n  📊 CREDIT SCORE: Not Available" -ForegroundColor Yellow
        }
    }
    
    Write-Host "`n" -NoNewline
    Write-Host "─────────────────────────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "`n✅ Total Loans: $($loans.totalFilteredRecords)" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Error fetching loans: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== COMPLETED ===" -ForegroundColor Green
