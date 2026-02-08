# Script 09: Master Fund Script (Approve -> Activate -> Deposit)
# Phiên bản: 2.0 (OAuth2 - Port 8080)
# Sử dụng: .\09-fund-accounts.ps1

Write-Host "============================================================" -ForegroundColor Green
Write-Host "   MASTER FUNDING TOOL (FINERACT P2P)" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

$keycloakUrl = "http://127.0.0.1:9000"
$fineractBaseUrl = "http://127.0.0.1:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123"

# 1. Lấy OAuth2 token
Write-Host "`n1. Đang lấy Access Token..." -ForegroundColor Yellow
try {
    $tokenBody = "username=$username&password=$password&client_id=$oauthClientId&grant_type=password&client_secret=$clientSecret"
    $tokenResponse = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $headers = @{
        "Authorization" = "Bearer $($tokenResponse.access_token)"
        "Content-Type" = "application/json"
        "Fineract-Platform-TenantId" = "default"
    }
    Write-Host "✅ Token OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Lỗi: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Lấy danh sách tài khoản
Write-Host "`n2. Đang quét danh sách tài khoản..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts" -Method Get -Headers $headers
$accounts = if ($response.pageItems) { $response.pageItems } else { $response }

# 3. Xử lý từng tài khoản
$fundAmount = if ($env:FUND_AMOUNT) { [double]$env:FUND_AMOUNT } else { 10000000.0 }
$today = (Get-Date).ToString("dd MMMM yyyy", [System.Globalization.CultureInfo]::InvariantCulture)

Write-Host "`n3. Thực hiện chu kỳ: Approve -> Activate -> Deposit" -ForegroundColor Yellow
foreach ($acc in $accounts) {
    $id = $acc.id
    $status = $acc.status.value
    Write-Host "   > [$id] $($acc.clientName) (Trạng thái: $status)" -ForegroundColor Cyan
    
    # 3.1. Approve if needed
    if ($status -eq "Submitted and pending approval") {
        Write-Host "      - Đang Approve..." -NoNewline
        try {
            $body = @{ approvedOnDate = $today; dateFormat = "dd MMMM yyyy"; locale = "en" } | ConvertTo-Json
            Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts/$id?command=approve" -Method Post -Headers $headers -Body $body | Out-Null
            Write-Host " [ OK ]" -ForegroundColor Green
            $status = "Approved"
        } catch { Write-Host " [ FAIL ]" -ForegroundColor Red }
    }
    
    # 3.2. Activate if needed
    if ($status -eq "Approved") {
        Write-Host "      - Đang Activate..." -NoNewline
        try {
            $body = @{ activatedOnDate = $today; dateFormat = "dd MMMM yyyy"; locale = "en" } | ConvertTo-Json
            Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts/$id?command=activate" -Method Post -Headers $headers -Body $body | Out-Null
            Write-Host " [ OK ]" -ForegroundColor Green
            $status = "Active"
        } catch { Write-Host " [ FAIL ]" -ForegroundColor Red }
    }
    
    # 3.3. Deposit
    if ($status -eq "Active") {
        Write-Host "      - Đang Nạp tiền ($($fundAmount.ToString('N0')))..." -NoNewline
        try {
            $body = @{
                transactionDate = $today
                transactionAmount = $fundAmount
                dateFormat = "dd MMMM yyyy"
                locale = "en"
                paymentTypeId = 1
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts/$id/transactions?command=deposit" -Method Post -Headers $headers -Body $body | Out-Null
            Write-Host " [ OK ]" -ForegroundColor Green
        } catch { Write-Host " [ FAIL ]" -ForegroundColor Red }
    } else {
        Write-Host "      - ⚠️ Bỏ qua (Trạng thái không hợp lệ: $status)" -ForegroundColor Yellow
    }
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "   HOÀN THÀNH!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
