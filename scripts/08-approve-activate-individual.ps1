# Script approve/activate từng account riêng biệt
Write-Host "=== 11. APPROVE/ACTIVATE TỪNG ACCOUNT ===" -ForegroundColor Green

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

# 2. Approve và activate Account 1 (vừa tạo)
Write-Host "`n2. Approve và activate Account 1..." -ForegroundColor Yellow

# Approve Account 1
Write-Host "  - Approving Account 1..." -ForegroundColor Cyan
$currentDate = (Get-Date).ToString("dd MMMM yyyy")
$approveData = @{
    approvedOnDate = $currentDate
    dateFormat = "dd MMMM yyyy"
    locale = "en"
} | ConvertTo-Json

try {
    $approveResponse = Invoke-WebRequest -Uri "$fineractBaseUrl/savingsaccounts/1?command=approve&tenantIdentifier=default" -Method Post -Body $approveData -Headers $headers
    Write-Host "  - Approve Account 1 thành công!" -ForegroundColor Green
} catch {
    Write-Host "  - Lỗi approve Account 1: $($_.Exception.Message)" -ForegroundColor Red
}

# Activate Account 1
Write-Host "  - Activating Account 1..." -ForegroundColor Cyan
$activateData = @{
    activatedOnDate = $currentDate
    dateFormat = "dd MMMM yyyy"
    locale = "en"
} | ConvertTo-Json

try {
    $activateResponse = Invoke-WebRequest -Uri "$fineractBaseUrl/savingsaccounts/1?command=activate&tenantIdentifier=default" -Method Post -Body $activateData -Headers $headers
    Write-Host "  - Activate Account 1 thành công!" -ForegroundColor Green
} catch {
    Write-Host "  - Lỗi activate Account 1: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Kiểm tra trạng thái cuối cùng
Write-Host "`n3. Kiểm tra trạng thái cuối cùng..." -ForegroundColor Yellow
try {
    $finalAccounts = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts?tenantIdentifier=default" -Method Get -Headers $headers
    Write-Host "Trạng thái cuối cùng:" -ForegroundColor Green
    
    foreach ($account in $finalAccounts.pageItems) {
        Write-Host "  - Account $($account.id): $($account.status.value)" -ForegroundColor White
    }
} catch {
    Write-Host "Lỗi kiểm tra trạng thái: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== HOÀN THÀNH APPROVE/ACTIVATE ===" -ForegroundColor Green
Write-Host "Tiếp theo: .\08-fund-accounts.ps1" -ForegroundColor Yellow
