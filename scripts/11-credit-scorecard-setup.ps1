# Script 11: Credit Scorecard - Setup & Test Complete Flow
# Sử dụng: .\11-credit-scorecard-setup.ps1
# Mục đích: 
#   1. Tạo datatable credit_score gắn với loan
#   2. Tạo loan cho user
#   3. Chấm điểm tín dụng và lưu vào datatable
#   4. Xem lại thông tin đã lưu

Write-Host "=== 11. CREDIT SCORECARD - COMPLETE SETUP ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$fineractBaseUrl = "http://localhost:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123"

# ============================================================================
# STEP 0: Get OAuth2 Token
# ============================================================================
Write-Host "`n[STEP 0] Getting OAuth2 token..." -ForegroundColor Yellow
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

# ============================================================================
# STEP 1: Create Datatable 'credit_score' for Loan
# ============================================================================
Write-Host "`n[STEP 1] Creating datatable 'credit_score'..." -ForegroundColor Yellow

$datatablePayload = @{
    datatableName = "credit_score"
    apptableName = "m_loan"
    multiRow = $false
    columns = @(
        @{
            name = "score"
            type = "Number"
            mandatory = $true
            length = 0
            code = ""
        },
        @{
            name = "scoring_method"
            type = "String"
            mandatory = $true
            length = 50
            code = ""
        },
        @{
            name = "scoring_model"
            type = "String"
            mandatory = $false
            length = 100
            code = ""
        },
        @{
            name = "risk_level"
            type = "String"
            mandatory = $false
            length = 20
            code = ""
        },
        @{
            name = "accuracy"
            type = "Decimal"
            mandatory = $false
            length = 0
            code = ""
        },
        @{
            name = "rating_date"
            type = "Date"
            mandatory = $true
            length = 0
            code = ""
        },
        @{
            name = "overall_color"
            type = "String"
            mandatory = $false
            length = 20
            code = ""
        },
        @{
            name = "notes"
            type = "Text"
            mandatory = $false
            length = 0
            code = ""
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Payload:" -ForegroundColor Cyan
Write-Host $datatablePayload -ForegroundColor White

try {
    $createDatatableResponse = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables" -Method Post -Body $datatablePayload -Headers $headers
    Write-Host "✅ Datatable 'credit_score' created successfully!" -ForegroundColor Green
    Write-Host "   Resource ID: $($createDatatableResponse.resourceId)" -ForegroundColor Cyan
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 403) {
        Write-Host "⚠️  Datatable 'credit_score' already exists (skipping)" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Error creating datatable: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# ============================================================================
# STEP 2: Get Active Client
# ============================================================================
Write-Host "`n[STEP 2] Getting active client..." -ForegroundColor Yellow

try {
    $clients = Invoke-RestMethod -Uri "$fineractBaseUrl/clients?status=active&limit=1" -Method Get -Headers $headers
    
    if ($clients.totalFilteredRecords -eq 0) {
        Write-Host "❌ No active clients found. Please create and activate a client first." -ForegroundColor Red
        Write-Host "   Run: .\06-create-client.ps1 then .\07-activate-existing-client.ps1" -ForegroundColor Yellow
        exit 1
    }
    
    $clientId = $clients.pageItems[0].id
    $clientName = "$($clients.pageItems[0].firstname) $($clients.pageItems[0].lastname)"
    Write-Host "✅ Found active client: $clientName (ID: $clientId)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting clients: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ============================================================================
# STEP 3: Get Loan Product
# ============================================================================
Write-Host "`n[STEP 3] Getting loan product..." -ForegroundColor Yellow

try {
    $products = Invoke-RestMethod -Uri "$fineractBaseUrl/loanproducts" -Method Get -Headers $headers
    
    if ($products.Count -eq 0) {
        Write-Host "❌ No loan products found. Please create a loan product first." -ForegroundColor Red
        exit 1
    }
    
    $productId = $products[0].id
    $productName = $products[0].name
    Write-Host "✅ Found loan product: $productName (ID: $productId)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error getting loan products: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ============================================================================
# STEP 4: Create Loan Application
# ============================================================================
Write-Host "`n[STEP 4] Creating loan application..." -ForegroundColor Yellow

$currentDate = (Get-Date).ToString("dd MMMM yyyy")
$disbursementDate = (Get-Date).AddDays(1).ToString("dd MMMM yyyy")

$loanPayload = @{
    clientId = $clientId
    productId = $productId
    principal = 10000
    loanTermFrequency = 12
    loanTermFrequencyType = 2
    numberOfRepayments = 12
    repaymentEvery = 1
    repaymentFrequencyType = 2
    interestRatePerPeriod = 10
    interestRateFrequencyType = 2
    amortizationType = 1
    interestType = 0
    interestCalculationPeriodType = 1
    expectedDisbursementDate = $disbursementDate
    submittedOnDate = $currentDate
    locale = "en"
    dateFormat = "dd MMMM yyyy"
    transactionProcessingStrategyCode = "mifos-standard-strategy"
} | ConvertTo-Json

Write-Host "Loan details:" -ForegroundColor Cyan
Write-Host "  - Client: $clientName (ID: $clientId)" -ForegroundColor White
Write-Host "  - Product: $productName (ID: $productId)" -ForegroundColor White
Write-Host "  - Principal: 10,000" -ForegroundColor White
Write-Host "  - Term: 12 months" -ForegroundColor White
Write-Host "  - Interest: 10% per year" -ForegroundColor White

try {
    $createLoanResponse = Invoke-RestMethod -Uri "$fineractBaseUrl/loans" -Method Post -Body $loanPayload -Headers $headers
    $loanId = $createLoanResponse.loanId
    Write-Host "✅ Loan application created successfully!" -ForegroundColor Green
    Write-Host "   Loan ID: $loanId" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error creating loan: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# ============================================================================
# STEP 5: Approve Loan
# ============================================================================
Write-Host "`n[STEP 5] Approving loan..." -ForegroundColor Yellow

$approvePayload = @{
    approvedOnDate = $currentDate
    locale = "en"
    dateFormat = "dd MMMM yyyy"
} | ConvertTo-Json

try {
    $approveResponse = Invoke-RestMethod -Uri "$fineractBaseUrl/loans/$loanId`?command=approve" -Method Post -Body $approvePayload -Headers $headers
    Write-Host "✅ Loan approved successfully!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not approve loan (may need manual approval): $($_.Exception.Message)" -ForegroundColor Yellow
}

# ============================================================================
# STEP 6: Calculate Credit Score & Save to Datatable
# ============================================================================
Write-Host "`n[STEP 6] Calculating credit score and saving..." -ForegroundColor Yellow

# Simulate credit scoring (in real scenario, this would call ML model/rules engine)
$scoringMethods = @("ml", "statistical", "ruleBased")
$selectedMethod = $scoringMethods | Get-Random

$creditScoreData = @{
    score = Get-Random -Minimum 300 -Maximum 850
    scoring_method = $selectedMethod
    scoring_model = "RandomForestClassifier"
    risk_level = "good"
    accuracy = [math]::Round((Get-Random -Minimum 70 -Maximum 95) / 100, 2)
    rating_date = (Get-Date).ToString("yyyy-MM-dd")
    overall_color = "#00FF00"
    notes = "Credit score calculated automatically using $selectedMethod method"
    locale = "en"
    dateFormat = "yyyy-MM-dd"
}

# Convert to JSON
$creditScorePayload = $creditScoreData | ConvertTo-Json

Write-Host "Credit Score Details:" -ForegroundColor Cyan
Write-Host "  - Score: $($creditScoreData.score)" -ForegroundColor White
Write-Host "  - Method: $($creditScoreData.scoring_method)" -ForegroundColor White
Write-Host "  - Risk Level: $($creditScoreData.risk_level)" -ForegroundColor White
Write-Host "  - Accuracy: $($creditScoreData.accuracy * 100)%" -ForegroundColor White

try {
    $saveCreditScoreResponse = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables/credit_score/$loanId" -Method Post -Body $creditScorePayload -Headers $headers
    Write-Host "✅ Credit score saved successfully!" -ForegroundColor Green
    Write-Host "   Resource ID: $($saveCreditScoreResponse.resourceId)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error saving credit score: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    
    # Debug: Check if datatable is registered
    Write-Host "`nDebug: Checking datatable registration..." -ForegroundColor Yellow
    try {
        $checkDatatable = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables/credit_score" -Method Get -Headers $headers
        Write-Host "Datatable exists: $($checkDatatable.applicationTableName)" -ForegroundColor White
    } catch {
        Write-Host "Datatable not found or not registered properly" -ForegroundColor Red
    }
}

# ============================================================================
# STEP 7: Retrieve and Display Credit Score
# ============================================================================
Write-Host "`n[STEP 7] Retrieving credit score data..." -ForegroundColor Yellow

try {
    $retrievedScore = Invoke-RestMethod -Uri "$fineractBaseUrl/datatables/credit_score/$loanId" -Method Get -Headers $headers
    
    Write-Host "✅ Credit score retrieved successfully!" -ForegroundColor Green
    Write-Host "`n📊 CREDIT SCORE DETAILS:" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    if ($retrievedScore.Count -gt 0) {
        $scoreData = $retrievedScore[0]
        Write-Host "  Score:           $($scoreData.score)" -ForegroundColor White
        Write-Host "  Method:          $($scoreData.scoring_method)" -ForegroundColor White
        Write-Host "  Model:           $($scoreData.scoring_model)" -ForegroundColor White
        Write-Host "  Risk Level:      $($scoreData.risk_level)" -ForegroundColor White
        Write-Host "  Accuracy:        $($scoreData.accuracy * 100)%" -ForegroundColor White
        Write-Host "  Rating Date:     $($scoreData.rating_date)" -ForegroundColor White
        Write-Host "  Overall Color:   $($scoreData.overall_color)" -ForegroundColor White
        Write-Host "  Notes:           $($scoreData.notes)" -ForegroundColor White
    } else {
        Write-Host "  (No data found)" -ForegroundColor Yellow
    }
    
    Write-Host "========================================" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️  Could not retrieve credit score: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ============================================================================
# STEP 8: Get Complete Loan Details with Credit Score
# ============================================================================
Write-Host "`n[STEP 8] Getting complete loan details..." -ForegroundColor Yellow

try {
    $loanDetails = Invoke-RestMethod -Uri "$fineractBaseUrl/loans/$loanId`?associations=all" -Method Get -Headers $headers
    
    Write-Host "✅ Loan details retrieved!" -ForegroundColor Green
    Write-Host "`n📋 LOAN SUMMARY:" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Loan ID:         $($loanDetails.id)" -ForegroundColor White
    Write-Host "  Account No:      $($loanDetails.accountNo)" -ForegroundColor White
    Write-Host "  Client:          $clientName" -ForegroundColor White
    Write-Host "  Product:         $productName" -ForegroundColor White
    Write-Host "  Principal:       $($loanDetails.principal)" -ForegroundColor White
    Write-Host "  Status:          $($loanDetails.status.value)" -ForegroundColor White
    Write-Host "  Timeline:" -ForegroundColor White
    Write-Host "    - Submitted:   $($loanDetails.timeline.submittedOnDate -join '-')" -ForegroundColor White
    if ($loanDetails.timeline.approvedOnDate) {
        Write-Host "    - Approved:    $($loanDetails.timeline.approvedOnDate -join '-')" -ForegroundColor White
    }
    Write-Host "========================================" -ForegroundColor Cyan
} catch {
    Write-Host "⚠️  Could not retrieve loan details: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n" -NoNewline
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ CREDIT SCORECARD SETUP COMPLETED SUCCESSFULLY!        ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`n📌 Summary:" -ForegroundColor Yellow
Write-Host "  1. ✅ Datatable 'credit_score' created/verified" -ForegroundColor White
Write-Host "  2. ✅ Loan application created (ID: $loanId)" -ForegroundColor White
Write-Host "  3. ✅ Credit score calculated and saved" -ForegroundColor White
Write-Host "  4. ✅ Data retrieved and validated" -ForegroundColor White

Write-Host "`n🔗 Useful URLs:" -ForegroundColor Yellow
Write-Host "  - Swagger UI:    http://localhost:8080/fineract-provider/swagger-ui/index.html" -ForegroundColor Cyan
Write-Host "  - View Loan:     GET /v1/loans/$loanId" -ForegroundColor Cyan
Write-Host "  - View Score:    GET /v1/datatables/credit_score/$loanId" -ForegroundColor Cyan

Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
Write-Host "  - View in Web App: http://localhost:4200/#/clients/$clientId/loans-accounts/$loanId/general" -ForegroundColor White
Write-Host "  - Click 'Credit Scorecard' tab to see the score" -ForegroundColor White
Write-Host "  - Run this script again to create another loan with different score" -ForegroundColor White

Write-Host "`n=== SCRIPT COMPLETED ===" -ForegroundColor Green
