
# Script: verify-client-1.ps1
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

    # 2. Get Client 1
    Write-Host "Fetching Client 1..."
    $client = Invoke-RestMethod -Uri "$fineractBaseUrl/clients/1" -Method Get -Headers $headers
    $client | ConvertTo-Json -Depth 2
    
    # 3. Update Client 1 explicitly again
    Write-Host "`nUpdating Client 1 External ID to 0799000001..."
    $updateHeaders = $headers.Clone()
    $updateHeaders.Add("Content-Type", "application/json")
    $payload = @{
        externalId = "0799000001"
        mobileNo = "0799000001"
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$fineractBaseUrl/clients/1" -Method Put -Headers $updateHeaders -Body $payload
    Write-Host "Update Result: $($resp | ConvertTo-Json)"

} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
