
# Script: get-raw-fineract.ps1
$fineractBaseUrl = "http://127.0.0.1:8080/fineract-provider/api/v1"
$keycloakUrl = "http://127.0.0.1:9000"
$tenantId = "default"
$username = "mifos"
$password = "password"
$clientId = "community-app"
$clientSecret = "real-client-secret-123"

try {
    $tokenBody = "username=$username&password=$password&client_id=$clientId&grant_type=password&client_secret=$clientSecret"
    $tokenResp = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResp.access_token

    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Fineract-Platform-TenantId" = $tenantId
    }

    Write-Host "--- SAVINGS ACCOUNT 1 RAW ---"
    $acc = Invoke-WebRequest -Uri "$fineractBaseUrl/savingsaccounts/1" -Method Get -Headers $headers
    $acc.Content
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
