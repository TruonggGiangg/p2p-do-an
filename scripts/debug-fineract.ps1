
# Script: debug-fineract.ps1
$fineractBaseUrl = "http://127.0.0.1:8080/fineract-provider/api/v1"
$keycloakUrl = "http://127.0.0.1:9000"
$tenantId = "default"
$username = "mifos"
$password = "password"
$clientId = "community-app"
$clientSecret = "real-client-secret-123"

try {
    # 1. Get Token
    $tokenBody = "username=$username&password=$password&client_id=$clientId&grant_type=password&client_secret=$clientSecret"
    $tokenResp = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResp.access_token

    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Fineract-Platform-TenantId" = $tenantId
    }

    # 2. Get Savings Account 2 Details
    $acc2 = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts/2" -Method Get -Headers $headers
    $ownerClientId = $acc2.clientId
    Write-Host "SAVINGS_ID_2_OWNER_CLIENT_ID: $ownerClientId"

    # 3. Get Client Details
    $client = Invoke-RestMethod -Uri "$fineractBaseUrl/clients/$ownerClientId" -Method Get -Headers $headers
    Write-Host "CLIENT_NAME_2: $($client.displayName)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
