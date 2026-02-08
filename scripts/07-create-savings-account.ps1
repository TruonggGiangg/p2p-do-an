# Script 07: Tạo Savings Account
# Sử dụng: .\07-create-savings-account.ps1

Write-Host "=== 07. TẠO SAVINGS ACCOUNT ===" -ForegroundColor Green

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
    Write-Host "✅ OAuth2 token OK" -ForegroundColor Green
    Write-Host "Token (first 50 chars): $($accessToken.Substring(0, 50))..." -ForegroundColor White
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

# 2. Lấy client active
Write-Host "`n2. Lấy client active..." -ForegroundColor Yellow
try {
    $clients = Invoke-RestMethod -Uri "$fineractBaseUrl/clients?limit=10" -Method Get -Headers $headers
    $activeClient = $clients.pageItems | Where-Object { $_.active -eq $true } | Select-Object -First 1
    
    if ($activeClient) {
        $clientId = $activeClient.id
        Write-Host "  - Client: $($activeClient.displayName) (ID: $clientId)" -ForegroundColor White
        Write-Host "  - Status: $($activeClient.status.value)" -ForegroundColor White
        Write-Host "  - Active: $($activeClient.active)" -ForegroundColor White
    } else {
        Write-Host "❌ Không có client nào active!" -ForegroundColor Red
        Write-Host "  - Chạy script 06-create-client.ps1 trước để tạo và activate client" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Lỗi lấy client: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Lấy savings product
Write-Host "`n3. Lấy savings product..." -ForegroundColor Yellow
try {
    $products = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsproducts" -Method Get -Headers $headers
    if ($products.Count -gt 0) {
        $firstProduct = $products[0]
        $productId = $firstProduct.id
        Write-Host "  - Product: $($firstProduct.name) (ID: $productId)" -ForegroundColor White
        Write-Host "  - Status: $($firstProduct.status.value)" -ForegroundColor White
    } else {
        Write-Host "❌ Không có savings product nào!" -ForegroundColor Red
        Write-Host "  - Chạy script 05-create-savings-product.ps1 trước để tạo product" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Lỗi lấy product: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 4. Tạo savings account với dữ liệu tối thiểu
Write-Host "`n4. Tạo savings account với dữ liệu tối thiểu..." -ForegroundColor Yellow
$currentDate = (Get-Date).ToString("dd MMMM yyyy")
$savingsData = @{
    clientId = $clientId
    productId = $productId
    submittedOnDate = $currentDate
    locale = "en"
    dateFormat = "dd MMMM yyyy"
} | ConvertTo-Json

Write-Host "  - Dữ liệu gửi đi:" -ForegroundColor Cyan
Write-Host "    Client ID: $clientId" -ForegroundColor White
Write-Host "    Product ID: $productId" -ForegroundColor White
Write-Host "    Submitted Date: $currentDate" -ForegroundColor White
Write-Host "    Locale: en" -ForegroundColor White

Write-Host "`n  - JSON gửi đi:" -ForegroundColor Cyan
Write-Host $savingsData -ForegroundColor White

try {
    $savingsResponse = Invoke-WebRequest -Uri "$fineractBaseUrl/savingsaccounts?tenantIdentifier=default" -Method Post -Body $savingsData -Headers $headers
    Write-Host "✅ POST /savingsaccounts thành công!" -ForegroundColor Green
    Write-Host "  - Status Code: $($savingsResponse.StatusCode)" -ForegroundColor White
    Write-Host "  - Response: $($savingsResponse.Content)" -ForegroundColor White
    
    # Parse response để lấy savings account ID
    $savingsJson = $savingsResponse.Content | ConvertFrom-Json
    if ($savingsJson.savingsId) {
        $savingsId = $savingsJson.savingsId
        Write-Host "  - Savings Account ID: $savingsId" -ForegroundColor Cyan
    }
    if ($savingsJson.resourceId) {
        Write-Host "  - Resource ID: $($savingsJson.resourceId)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Lỗi tạo savings account: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  - Status Code: $statusCode" -ForegroundColor Red
        
        # Thử lấy chi tiết lỗi
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $errorContent = $reader.ReadToEnd()
            $reader.Close()
            $errorStream.Close()
            Write-Host "  - Error Details: $errorContent" -ForegroundColor Red
        } catch {
            Write-Host "  - Không thể đọc chi tiết lỗi" -ForegroundColor Red
        }
    }
}

# 5. Lấy danh sách savings accounts để xác nhận
Write-Host "`n5. Lấy danh sách savings accounts..." -ForegroundColor Yellow
try {
    $savingsAccounts = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts" -Method Get -Headers $headers
    Write-Host "✅ GET /savingsaccounts thành công: $($savingsAccounts.Count) accounts" -ForegroundColor Green
    
    if ($savingsAccounts.Count -gt 0) {
        Write-Host "  - Danh sách savings accounts:" -ForegroundColor Cyan
        foreach ($account in $savingsAccounts) {
            Write-Host "    * ID: $($account.id), Client: $($account.clientName), Status: $($account.status.value)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Lỗi lấy danh sách savings accounts: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== HOÀN THÀNH TẠO SAVINGS ACCOUNT ===" -ForegroundColor Green
Write-Host "Savings Account: Tạo thành công" -ForegroundColor Cyan
Write-Host "Tất cả các bước đã hoàn thành!" -ForegroundColor Yellow
