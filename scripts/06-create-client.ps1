# Script tạo client đơn giản
Write-Host "=== TẠO CLIENT ===" -ForegroundColor Green

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

# 2. Tạo client mới với dữ liệu tối thiểu
Write-Host "`n2. Tạo client mới..." -ForegroundColor Yellow
$clientData = @{
    officeId = 1
    legalFormId = 1
    firstname = "John"
    lastname = "Doe"
    dateOfBirth = "1990-01-01"
    locale = "en"
    dateFormat = "yyyy-MM-dd"
    active = $false
} | ConvertTo-Json

Write-Host "Dữ liệu gửi đi:" -ForegroundColor Cyan
Write-Host "First Name: John" -ForegroundColor White
Write-Host "Last Name: Doe" -ForegroundColor White
Write-Host "Date of Birth: 1990-01-01" -ForegroundColor White
Write-Host "Active: false" -ForegroundColor White

try {
    $createClientResponse = Invoke-WebRequest -Uri "$fineractBaseUrl/clients?tenantIdentifier=default" -Method Post -Body $clientData -Headers $headers
    Write-Host "Tạo client thành công!" -ForegroundColor Green
    Write-Host "Status Code: $($createClientResponse.StatusCode)" -ForegroundColor White
    Write-Host "Response: $($createClientResponse.Content)" -ForegroundColor White
} catch {
    Write-Host "Lỗi tạo client: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        if ($_.Exception.Response.Content) {
            Write-Host "Error Details: $($_.Exception.Response.Content)" -ForegroundColor Red
        }
    }
}

Write-Host "`n=== HOÀN THÀNH TẠO CLIENT ===" -ForegroundColor Green
