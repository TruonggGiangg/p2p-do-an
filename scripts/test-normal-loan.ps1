### TEST CREATE NORMAL LOAN (NO ML SCORING) ###

# 1. Get token
$authResponse = Invoke-RestMethod -Uri "http://localhost:9000/realms/fineract/protocol/openid-connect/token" `
    -Method POST `
    -ContentType "application/x-www-form-urlencoded" `
    -Body @{
        client_id = "community-app"
        client_secret = "real-client-secret-123"
        grant_type = "password"
        username = "mifos"
        password = "password"
        scope = "openid profile email"
    }

$token = $authResponse.access_token
Write-Host "Token OK" -ForegroundColor Green

# 2. Create loan WITHOUT scorecard
$loanData = @{
    clientId = 1
    productId = 1
    principal = 20
    loanTermFrequency = 20
    loanTermFrequencyType = 2
    numberOfRepayments = 20
    repaymentEvery = 1
    repaymentFrequencyType = 2
    interestRatePerPeriod = 20
    interestRateFrequencyType = 2
    amortizationType = 1
    interestType = 0
    interestCalculationPeriodType = 1
    transactionProcessingStrategyCode = "creocore-strategy"
    submittedOnDate = "28 November 2025"
    expectedDisbursementDate = "29 November 2025"
    locale = "en"
    dateFormat = "dd MMMM yyyy"
    loanType = "individual"
} | ConvertTo-Json

Write-Host "`nTesting loan creation WITHOUT scorecard..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/fineract-provider/api/v1/loans" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
            "Fineract-Platform-TenantId" = "default"
        } `
        -Body $loanData

    Write-Host "Loan created successfully" -ForegroundColor Green
    Write-Host "Loan ID: $($response.loanId)" -ForegroundColor Cyan
}
catch {
    Write-Host "Error creating loan" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}
