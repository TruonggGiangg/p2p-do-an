# Script tạo savings product theo API specification
Write-Host "=== TẠO SAVINGS PRODUCT THEO API SPEC ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$fineractBaseUrl = "http://localhost:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123"

# 1. Lấy OAuth2 token
Write-Host "`n1. Lấy OAuth2 token..." -ForegroundColor Yellow
$tokenUrl = "$keycloakUrl/realms/fineract/protocol/openid-connect/token"

try {
    $tokenBody = "username=$username&password=$password&client_id=$oauthClientId&grant_type=password&client_secret=$clientSecret"
    $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResponse.access_token
    Write-Host "OAuth2 token OK" -ForegroundColor Green
} catch {
    Write-Host "Lỗi lấy OAuth2 token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
    "Fineract-Platform-TenantId" = "default"
    "Accept" = "application/json"
}

# 2. Tạo savings product theo API specification
Write-Host "`n2. Tạo savings product..." -ForegroundColor Yellow
$productData = @{
    name = "Passbook Savings"
    shortName = "PBSV"
    description = "Daily compounding using Daily Balance, 5% per year, 365 days in year"
    currencyCode = "USD"
    digitsAfterDecimal = 2
    inMultiplesOf = 0
    nominalAnnualInterestRate = 5
    interestCompoundingPeriodType = 1
    interestPostingPeriodType = 4
    interestCalculationType = 1
    interestCalculationDaysInYearType = 365
    accountingRule = 1
    enforceMinRequiredBalance = $false
    isDormancyTrackingActive = $false
    locale = "en"
    withHoldTax = $false
    withdrawalFeeForTransfers = $false
    allowOverdraft = $false
    charges = @()
} | ConvertTo-Json

Write-Host "Dữ liệu gửi đi:" -ForegroundColor Cyan
Write-Host "Name: Passbook Savings" -ForegroundColor White
Write-Host "Short Name: PBSV" -ForegroundColor White
Write-Host "Currency: USD" -ForegroundColor White
Write-Host "Interest Rate: 5%" -ForegroundColor White
Write-Host "Accounting Rule: 1 (Cash based)" -ForegroundColor White

try {
    $createProductResponse = Invoke-WebRequest -Uri "$fineractBaseUrl/savingsproducts?tenantIdentifier=default" -Method Post -Body $productData -Headers $headers
    Write-Host "Tạo savings product thành công!" -ForegroundColor Green
    Write-Host "Status Code: $($createProductResponse.StatusCode)" -ForegroundColor White
    Write-Host "Response: $($createProductResponse.Content)" -ForegroundColor White
} catch {
    Write-Host "Lỗi tạo savings product: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        if ($_.Exception.Response.Content) {
            Write-Host "Error Details: $($_.Exception.Response.Content)" -ForegroundColor Red
        }
    }
}

Write-Host "`n=== HOÀN THÀNH TẠO SAVINGS PRODUCT ===" -ForegroundColor Green
