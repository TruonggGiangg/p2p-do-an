
# Script: update-client-externalid.ps1
$fineractBaseUrl = "http://127.0.0.1:8080/fineract-provider/api/v1"
$keycloakUrl = "http://127.0.0.1:9000"
$tenantId = "default"
$username = "mifos"
$password = "password"
$clientId = "community-app"
$clientSecret = "real-client-secret-123"

$targetPhone = "0799000001"
$targetClientId = 1

try {
    # 1. Get Token
    $tokenBody = "username=$username&password=$password&client_id=$clientId&grant_type=password&client_secret=$clientSecret"
    $tokenResp = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
    $accessToken = $tokenResp.access_token

    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Fineract-Platform-TenantId" = $tenantId
        "Content-Type" = "application/json"
    }

    # 2. Update Client 1
    Write-Host "Updating Client $targetClientId External ID to $targetPhone..."
    $payload = @{
        externalId = $targetPhone
        mobileNo = $targetPhone
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$fineractBaseUrl/clients/$targetClientId" -Method Put -Headers $headers -Body $payload
    Write-Host "✅ Update SUCCESS!"
    Write-Host "Response: $($resp | ConvertTo-Json)"
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)"
}
