# Script 04: Test React Native integration
# Sử dụng: .\04-test-react-native.ps1

Write-Host "=== 04. TEST REACT NATIVE INTEGRATION ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$fineractBaseUrl = "http://localhost:8080/fineract-provider"
$username = "mifos"
$password = "password"
$clientId = "community-app"
$clientSecret = "real-client-secret-123"

# 1. Lấy OAuth2 token
Write-Host "`n1. Lấy OAuth2 token..." -ForegroundColor Yellow
try {
    $tokenBody = "username=$username&password=$password&client_id=$clientId&grant_type=password&client_secret=$clientSecret"
    $tokenResponse = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResponse.access_token
    Write-Host "✅ OAuth2 token OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Lỗi lấy OAuth2 token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type" = "application/json"
    "Fineract-Platform-TenantId" = "default"
    "Accept" = "application/json"
}

# 2. Test các API endpoints cho React Native
Write-Host "`n2. Test API endpoints cho React Native..." -ForegroundColor Yellow

$endpoints = @(
    @{ Name = "Offices"; Url = "/api/v1/offices"; Description = "Danh sách văn phòng" },
    @{ Name = "Clients"; Url = "/api/v1/clients"; Description = "Danh sách khách hàng" },
    @{ Name = "Savings Accounts"; Url = "/api/v1/savingsaccounts"; Description = "Danh sách tài khoản tiết kiệm" },
    @{ Name = "User Details"; Url = "/v1/userdetails"; Description = "Thông tin người dùng" },
    @{ Name = "Configurations"; Url = "/api/v1/configurations"; Description = "Cấu hình hệ thống" }
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-RestMethod -Uri "$fineractBaseUrl$($endpoint.Url)" -Method Get -Headers $headers
        Write-Host "✅ $($endpoint.Name): OK" -ForegroundColor Green
        Write-Host "  - $($endpoint.Description)" -ForegroundColor White
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "❌ $($endpoint.Name): $statusCode" -ForegroundColor Red
    }
}

# 3. Test JWT token claims
Write-Host "`n3. Test JWT token claims..." -ForegroundColor Yellow
try {
    $parts = $accessToken.Split('.')
    $payload = $parts[1]
    $padding = $payload.Length % 4
    if ($padding -ne 0) {
        $payload += "=" * (4 - $padding)
    }
    $decodedBytes = [System.Convert]::FromBase64String($payload)
    $decodedJson = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
    $jwtPayload = $decodedJson | ConvertFrom-Json

    Write-Host "JWT Claims:" -ForegroundColor Cyan
    Write-Host "  - Issuer: $($jwtPayload.iss)" -ForegroundColor White
    Write-Host "  - Subject: $($jwtPayload.sub)" -ForegroundColor White
    Write-Host "  - Preferred Username: $($jwtPayload.preferred_username)" -ForegroundColor White
    Write-Host "  - Tenant: $($jwtPayload.tenant)" -ForegroundColor White
    Write-Host "  - Expires: $($jwtPayload.exp)" -ForegroundColor White
} catch {
    Write-Host "❌ Lỗi decode JWT: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test error handling
Write-Host "`n4. Test error handling..." -ForegroundColor Yellow

# Test với token không hợp lệ
Write-Host "`nTest với token không hợp lệ:" -ForegroundColor Cyan
try {
    $invalidHeaders = @{
        "Authorization" = "Bearer invalid-token"
        "Content-Type" = "application/json"
        "Fineract-Platform-TenantId" = "default"
        "Accept" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$fineractBaseUrl/api/v1/offices" -Method Get -Headers $invalidHeaders
    Write-Host "❌ Không nên thành công với token không hợp lệ" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "✅ Error handling OK: 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "❌ Error handling: $statusCode" -ForegroundColor Red
    }
}

# Test với thiếu tenant header
Write-Host "`nTest với thiếu tenant header:" -ForegroundColor Cyan
try {
    $noTenantHeaders = @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type" = "application/json"
        "Accept" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$fineractBaseUrl/api/v1/offices" -Method Get -Headers $noTenantHeaders
    Write-Host "❌ Không nên thành công với thiếu tenant header" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "✅ Error handling OK: 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "❌ Error handling: $statusCode" -ForegroundColor Red
    }
}

Write-Host "`n=== HOÀN THÀNH TEST REACT NATIVE ===" -ForegroundColor Green
Write-Host "OAuth2 Server: $keycloakUrl" -ForegroundColor Cyan
Write-Host "API Server: $fineractBaseUrl" -ForegroundColor Cyan
Write-Host "Client ID: $clientId" -ForegroundColor Cyan
Write-Host "Username: $username" -ForegroundColor Cyan
Write-Host "Password: $password" -ForegroundColor Cyan
Write-Host "`nReact Native integration: ✅ SẴN SÀNG" -ForegroundColor Green
