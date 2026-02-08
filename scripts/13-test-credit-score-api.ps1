# Script 13: Test Credit Score API
# Kiểm tra datatable và credit score data

Write-Host "=== 13. TEST CREDIT SCORE API ===" -ForegroundColor Green

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
    Write-Host "Token OK" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
    "Fineract-Platform-TenantId" = "default"
    "Accept" = "application/json"
}

# Step 1: List all datatables
Write-Host "`n[STEP 1] List all datatables:" -ForegroundColor Yellow
try {
    $datatables = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables" -Method Get -Headers $headers
    Write-Host "Response:" -ForegroundColor Cyan
    $datatables | ConvertTo-Json | Write-Host
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 2: Get all loans
Write-Host "`n[STEP 2] Get all loans:" -ForegroundColor Yellow
try {
    $loans = Invoke-RestMethod -Uri "$fineractBaseUrl/loans?limit=100" -Method Get -Headers $headers
    Write-Host "Loans response:" -ForegroundColor Cyan
    if ($loans -is [array]) {
        Write-Host "Found array with $($loans.Count) items"
        $loans | ForEach-Object { Write-Host "  - Loan ID: $($_.id), Client: $($_.clientName)" }
    } else {
        Write-Host "Single loan object:"
        Write-Host "  - Loan ID: $($loans.id), Client: $($loans.clientName)"
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Test datatable query for each loan
Write-Host "`n[STEP 3] Query credit_score datatable for each loan:" -ForegroundColor Yellow

$loanList = if ($loans -is [array]) { $loans } else { @($loans) }

foreach ($loan in $loanList) {
    $loanId = $loan.id
    Write-Host "`nLoan ID: $loanId" -ForegroundColor Cyan
    
    # Try different endpoints
    $endpoints = @(
        "/datatables/credit_score/$loanId",
        "/datatables/credit_score?loanId=$loanId",
        "/datatables/credit_score"
    )
    
    foreach ($endpoint in $endpoints) {
        Write-Host "  Trying: GET $endpoint" -ForegroundColor White
        try {
            $result = Invoke-RestMethod -Uri "$fineractBaseUrl$endpoint" -Method Get -Headers $headers
            Write-Host "    Success! Response:" -ForegroundColor Green
            if ($result -is [array]) {
                $result | ForEach-Object { 
                    Write-Host "      Score: $($_.score), Method: $($_.scoring_method), Risk: $($_.risk_level)"
                }
            } else {
                Write-Host "      $($result | ConvertTo-Json)"
            }
        } catch {
            Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# Step 4: Check m_loan table structure
Write-Host "`n[STEP 4] Get loan details with all associations:" -ForegroundColor Yellow

foreach ($loan in $loanList) {
    $loanId = $loan.id
    Write-Host "`nLoan ID: $loanId" -ForegroundColor Cyan
    try {
        $loanDetail = Invoke-RestMethod -Uri "$fineractBaseUrl/loans/$loanId`?associations=all" -Method Get -Headers $headers
        Write-Host "Full loan object keys:" -ForegroundColor White
        $loanDetail.PSObject.Properties | ForEach-Object { Write-Host "  - $($_.Name)" }
        
        # Check if there's a credit_score property
        if ($loanDetail.credit_score) {
            Write-Host "Found credit_score property:" -ForegroundColor Green
            Write-Host $loanDetail.credit_score | ConvertTo-Json
        } else {
            Write-Host "No credit_score property in loan object" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nTest Completed" -ForegroundColor Green
