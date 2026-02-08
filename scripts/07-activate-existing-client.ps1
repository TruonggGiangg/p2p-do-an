Write-Host "=== ACTIVATE CLIENT ===" -ForegroundColor Green

# --- Configuration ---
$keycloakUrl = "http://localhost:9000"
$fineractBaseUrl = "http://localhost:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123" # NOTE: Please use a secure way to handle secrets in production

# 1. Get OAuth2 token
Write-Host "`n1. Getting OAuth2 token..." -ForegroundColor Yellow
$tokenUrl = "$keycloakUrl/realms/fineract/protocol/openid-connect/token"

try {
    $tokenBody = "username=$username&password=$password&client_id=$oauthClientId&grant_type=password&client_secret=$clientSecret"
    $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody -ErrorAction Stop
    $accessToken = $tokenResponse.access_token
    Write-Host "OAuth2 token OK" -ForegroundColor Green
}
catch {
    Write-Host "Error getting OAuth2 token: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type"  = "application/json"
    "Fineract-Platform-TenantId" = "default"
    "Accept"        = "application/json"
}

# 2. Set client ID to 2 (client created in previous script)
Write-Host "`n2. Setting client ID to 2..." -ForegroundColor Yellow
$clientId = 2
Write-Host "Client ID set to: $clientId" -ForegroundColor White

# 3. Activate the client
Write-Host "`n3. Activating client..." -ForegroundColor Yellow
# Use the current date for activation
$activationDate = (Get-Date).ToString("yyyy-MM-dd")

$activateBody = @{
    activationDate = $activationDate
    locale         = "en" # Changed locale to 'en' for consistency
    dateFormat     = "yyyy-MM-dd"
} | ConvertTo-Json

try {
    $activateUrl = "$fineractBaseUrl/clients/$clientId`?command=activate"
    $activateResponse = Invoke-RestMethod -Uri $activateUrl -Method Post -Body $activateBody -Headers $headers -ErrorAction Stop
    Write-Host "Client activated successfully!" -ForegroundColor Green
    Write-Host "Response ID: $($activateResponse.resourceId)" -ForegroundColor White
}
catch {
    Write-Host "Error activating client: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== CLIENT ACTIVATION COMPLETED ===" -ForegroundColor Green
