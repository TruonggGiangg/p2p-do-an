Write-Host "=== CREATE MIFOS USER ===" -ForegroundColor Green

$keycloakUrl = "http://localhost:9000"
$adminUser = "admin"
$adminPassword = "admin"
$realmName = "fineract"
$username = "mifos"
$password = "password"

# 1. Get admin token
Write-Host "`n1. Getting admin token..." -ForegroundColor Yellow
try {
    $adminTokenBody = "client_id=admin-cli&username=$adminUser&password=$adminPassword&grant_type=password"
    $adminTokenResponse = Invoke-RestMethod -Uri "$keycloakUrl/realms/master/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $adminTokenBody -ErrorAction Stop
    $adminAccessToken = $adminTokenResponse.access_token
    Write-Host "Admin token OK" -ForegroundColor Green
}
catch {
    Write-Host "Error getting admin token. Please check Keycloak URL, username, and password." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit
}


$adminHeaders = @{
    "Authorization" = "Bearer $adminAccessToken"
    "Content-Type"  = "application/json"
}

# 2. Create 'mifos' user
Write-Host "`n2. Creating user mifos..." -ForegroundColor Yellow
$userConfig = @{
    username      = $username
    enabled       = $true
    firstName     = "Mifos"
    lastName      = "User"
    email         = "mifos@example.com"
    emailVerified = $true
    credentials   = @(
        @{
            type      = "password"
            value     = $password
            temporary = $false
        }
    )
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$keycloakUrl/admin/realms/$realmName/users" -Method Post -Headers $adminHeaders -Body $userConfig -ErrorAction Stop
    Write-Host "User 'mifos' created successfully." -ForegroundColor Green
}
catch {
    # Check the HTTP status code in a safer way
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        
        if ($statusCode -eq 409) { # HTTP 409 Conflict
            Write-Host "User 'mifos' already exists." -ForegroundColor Green
        }
        else {
            # Report other HTTP errors
            Write-Host "An HTTP error $($statusCode) occurred while creating the user:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    }
    else {
        # Report non-HTTP errors
        Write-Host "An unknown error occurred while creating the user:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

Write-Host "`n=== COMPLETED ===" -ForegroundColor Green
Write-Host "User: mifos/password" -ForegroundColor Cyan

# Run the script: .\02a-create-user-mifos.ps1
