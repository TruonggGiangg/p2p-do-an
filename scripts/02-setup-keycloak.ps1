# Script 02: Setup Keycloak OAuth2
# Sử dụng: .\02-setup-keycloak.ps1

Write-Host "=== 02. SETUP KEYCLOAK OAUTH2 ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$adminUsername = "admin"
$adminPassword = "admin"

# 1. Lấy admin token
Write-Host "`n1. Lấy admin token..." -ForegroundColor Yellow
try {
    $adminTokenBody = "username=$adminUsername&password=$adminPassword&client_id=admin-cli&grant_type=password"
    $adminTokenResponse = Invoke-RestMethod -Uri "$keycloakUrl/realms/master/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $adminTokenBody
    $adminToken = $adminTokenResponse.access_token
    Write-Host "✅ Admin token OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Lỗi lấy admin token: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Đảm bảo Keycloak đã khởi động: .\01-setup-docker.ps1" -ForegroundColor Yellow
    exit 1
}

$adminHeaders = @{
    "Authorization" = "Bearer $adminToken"
    "Content-Type" = "application/json"
}

# 2. Tạo realm "fineract"
Write-Host "`n2. Tạo realm 'fineract'..." -ForegroundColor Yellow
$realmData = @{
    realm = "fineract"
    displayName = "Fineract OAuth Realm"
    enabled = $true
    loginWithEmailAllowed = $true
    duplicateEmailsAllowed = $false
    resetPasswordAllowed = $true
    editUsernameAllowed = $true
    bruteForceProtected = $false
    permanentLockout = $false
    maxFailureWaitSeconds = 900
    minimumQuickLoginWaitSeconds = 60
    waitIncrementSeconds = 60
    quickLoginCheckMilliSeconds = 1000
    maxDeltaTimeSeconds = 43200
    failureFactor = 30
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms" -Method Post -Headers $adminHeaders -Body $realmData
    Write-Host "✅ Realm 'fineract' đã tạo" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "✅ Realm 'fineract' đã tồn tại" -ForegroundColor Green
    } else {
        Write-Host "❌ Lỗi tạo realm: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 3. Tạo user "mifos"
Write-Host "`n3. Tạo user 'mifos'..." -ForegroundColor Yellow
$userData = @{
    username = "mifos"
    email = "mifos@example.com"
    firstName = "Mifos"
    lastName = "User"
    enabled = $true
    emailVerified = $true
    credentials = @(
        @{
            type = "password"
            value = "password"
            temporary = $false
        }
    )
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/fineract/users" -Method Post -Headers $adminHeaders -Body $userData
    Write-Host "✅ User 'mifos' đã tạo" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "✅ User 'mifos' đã tồn tại" -ForegroundColor Green
    } else {
        Write-Host "❌ Lỗi tạo user: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 4. Tạo client "community-app"
Write-Host "`n4. Tạo client 'community-app'..." -ForegroundColor Yellow
$clientData = @{
    clientId = "community-app"
    name = "Community App"
    description = "Fineract Community Application"
    enabled = $true
    clientAuthenticatorType = "client-secret"
    secret = "real-client-secret-123"
    standardFlowEnabled = $true
    implicitFlowEnabled = $false
    directAccessGrantsEnabled = $true
    serviceAccountsEnabled = $false
    publicClient = $false
    protocol = "openid-connect"
    attributes = @{
        "access.token.lifespan" = "300"
        "client.session.idle.timeout" = "1800"
        "client.session.max.lifespan" = "36000"
    }
    defaultClientScopes = @("web-origins", "profile", "roles", "email")
    optionalClientScopes = @("address", "phone", "offline_access", "microprofile-jwt")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/fineract/clients" -Method Post -Headers $adminHeaders -Body $clientData
    Write-Host "✅ Client 'community-app' đã tạo" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "✅ Client 'community-app' đã tồn tại" -ForegroundColor Green
    } else {
        Write-Host "❌ Lỗi tạo client: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 5. Thêm tenant mapper
Write-Host "`n5. Thêm tenant mapper..." -ForegroundColor Yellow
try {
    $clients = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/fineract/clients" -Method Get -Headers $adminHeaders
    $communityApp = $clients | Where-Object { $_.clientId -eq "community-app" }
    
    if ($communityApp) {
        $mapperData = @{
            name = "tenant-mapper"
            protocol = "openid-connect"
            protocolMapper = "oidc-hardcoded-claim-mapper"
            config = @{
                claimName = "tenant"
                claimValue = "default"
                accessTokenClaim = $true
                idTokenClaim = $true
                userInfoTokenClaim = $true
            }
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/fineract/clients/$($communityApp.id)/protocol-mappers/models" -Method Post -Headers $adminHeaders -Body $mapperData
        Write-Host "✅ Tenant mapper đã thêm" -ForegroundColor Green
    } else {
        Write-Host "❌ Không tìm thấy client 'community-app'" -ForegroundColor Red
    }
} catch {
    if ($_.Exception.Message -like "*already exists*") {
        Write-Host "✅ Tenant mapper đã tồn tại" -ForegroundColor Green
    } else {
        Write-Host "❌ Lỗi thêm tenant mapper: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== HOÀN THÀNH SETUP KEYCLOAK ===" -ForegroundColor Green
Write-Host "Realm: fineract" -ForegroundColor Cyan
Write-Host "User: mifos/password" -ForegroundColor Cyan
Write-Host "Client: community-app" -ForegroundColor Cyan
Write-Host "Tiếp theo: .\03-test-oauth.ps1" -ForegroundColor Yellow
