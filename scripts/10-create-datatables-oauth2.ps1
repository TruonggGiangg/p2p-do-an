# Script: 10-create-datatables-oauth2.ps1
# Muc dich: Tao cac datatable (saved_cards, invoice, merchant) tren Fineract bang OAuth2 Bearer token
# Su dung: .\10-create-datatables-oauth2.ps1

Write-Host "`n=== 10. CREATE FINERACT DATATABLES (OAuth2) ===" -ForegroundColor Green

# Cau hinh server (co the override qua bien moi truong)
$keycloakUrl     = if ($env:KEYCLOAK_URL) { $env:KEYCLOAK_URL } else { "http://192.168.1.9:9000" }
$fineractBaseUrl = if ($env:FINERACT_API_URL) { $env:FINERACT_API_URL } else { "http://192.168.1.9:8080/fineract-provider/api/v1" }
$tenantId        = if ($env:FINERACT_TENANT_ID) { $env:FINERACT_TENANT_ID } else { "default" }

# Thong tin OAuth2 (co the override qua env var)
$username     = if ($env:OAUTH_USERNAME) { $env:OAUTH_USERNAME } else { "mifos" }
$password     = if ($env:OAUTH_PASSWORD) { $env:OAUTH_PASSWORD } else { "password" }
$clientId     = if ($env:OAUTH_CLIENT_ID) { $env:OAUTH_CLIENT_ID } else { "community-app" }
$clientSecret = if ($env:OAUTH_CLIENT_SECRET) { $env:OAUTH_CLIENT_SECRET } else { "real-client-secret-123" }

# 0) Lay OAuth2 Access Token tu Keycloak
Write-Host "`n0) Lay OAuth2 token tu Keycloak..." -ForegroundColor Yellow
try {
    $tokenBody = "username=$username&password=$password&client_id=$clientId&grant_type=password&client_secret=$clientSecret"
    $tokenResp = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResp.access_token
    if (-not $accessToken) { throw "Khong nhan duoc access_token" }
    Write-Host "   ✅ Lay token OK" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Loi lay token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Fineract-Platform-TenantId" = $tenantId
    "Content-Type" = "application/json"
    "Accept" = "application/json"
}

function Create-DatatableJson {
    param(
        [string]$datatableName,
        [array]$columns,
        [string]$apptableName = "m_client",
        [string]$entitySubType = "client",
        [bool]$multiRow = $true
    )

    return (@{
        datatableName = $datatableName
        apptableName = $apptableName
        entitySubType = $entitySubType
        multiRow = $multiRow
        columns = $columns
    } | ConvertTo-Json -Depth 10)
}

function New-Datatable {
    param(
        [string]$name,
        [string]$payloadJson
    )

    Write-Host "- Creating '$name' datatable..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod -Uri "$fineractBaseUrl/datatables" -Method Post -Headers $headers -Body $payloadJson | Out-Null
        Write-Host "   ✅ Created '$name'" -ForegroundColor Green
    } catch {
        $msg = $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            try {
                $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
                $detail = $errObj.defaultUserMessage
                if ($detail -match "already exists") {
                    Write-Host "   ⚠️ '$name' already exists" -ForegroundColor Yellow
                    return
                }
                Write-Host "   ❌ $detail" -ForegroundColor Red
            } catch {
                Write-Host "   ❌ $msg" -ForegroundColor Red
            }
        } else {
            if ($msg -match "already exists") {
                Write-Host "   ⚠️ '$name' already exists" -ForegroundColor Yellow
            } else {
                Write-Host "   ❌ $msg" -ForegroundColor Red
            }
        }
    }
}

Write-Host "`n1) Creating datatable: saved_cards" -ForegroundColor Cyan
$savedCardsCols = @(
    @{ name = "firstName"; type = "String"; length = 100; mandatory = $true },
    @{ name = "lastName";  type = "String"; length = 100; mandatory = $true },
    @{ name = "cardNumber"; type = "String"; length = 16;  mandatory = $true },
    @{ name = "cvv";       type = "String"; length = 4;   mandatory = $true },
    @{ name = "expiryDate"; type = "String"; length = 10;  mandatory = $true },
    @{ name = "backgroundColor"; type = "String"; length = 20; mandatory = $false }
)
$savedCardsJson = Create-DatatableJson -datatableName "saved_cards" -columns $savedCardsCols
New-Datatable -name "saved_cards" -payloadJson $savedCardsJson

Write-Host "`n2) Creating datatable: invoice" -ForegroundColor Cyan
$invoiceCols = @(
    @{ name = "title";       type = "String";  length = 200; mandatory = $true },
    @{ name = "amount";      type = "Decimal";               mandatory = $true },
    @{ name = "itemsBought"; type = "String";  length = 500; mandatory = $false },
    @{ name = "status";      type = "String";  length = 50;  mandatory = $false },
    @{ name = "date";        type = "Date";                  mandatory = $false },
    @{ name = "consumerId";  type = "String";  length = 100; mandatory = $false },
    @{ name = "consumerName";type = "String";  length = 200; mandatory = $false }
)
$invoiceJson = Create-DatatableJson -datatableName "invoice" -columns $invoiceCols
New-Datatable -name "invoice" -payloadJson $invoiceJson

Write-Host "`n3) Creating datatable: merchant" -ForegroundColor Cyan
$merchantCols = @(
    @{ name = "name";       type = "String"; length = 200; mandatory = $true },
    @{ name = "externalId"; type = "String"; length = 100; mandatory = $false },
    @{ name = "accountNo";  type = "String"; length = 50;  mandatory = $false },
    @{ name = "email";      type = "String"; length = 200; mandatory = $false },
    @{ name = "mobileNo";   type = "String"; length = 20;  mandatory = $false }
)
$merchantJson = Create-DatatableJson -datatableName "merchant" -columns $merchantCols
New-Datatable -name "merchant" -payloadJson $merchantJson

Write-Host "`n=== DATATABLES: DONE ===" -ForegroundColor Green
Write-Host "Base URL: $fineractBaseUrl" -ForegroundColor DarkGray
Write-Host "Tenant  : $tenantId" -ForegroundColor DarkGray
Write-Host "Keycloak: $keycloakUrl" -ForegroundColor DarkGray


