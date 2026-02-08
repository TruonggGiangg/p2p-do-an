
# Script: check-list-fields.ps1
$keycloakUrl = "http://127.0.0.1:9000"
$fineractBaseUrl = "http://127.0.0.1:8080/fineract-provider/api/v1"
$username = "mifos"
$password = "password"
$oauthClientId = "community-app"
$clientSecret = "real-client-secret-123"

$tokenBody = "username=$username&password=$password&client_id=$oauthClientId&grant_type=password&client_secret=$clientSecret"
$tokenResponse = Invoke-RestMethod -Uri "$keycloakUrl/realms/fineract/protocol/openid-connect/token" -Method Post -ContentType "application/x-www-form-urlencoded" -Body $tokenBody
$accessToken = $tokenResponse.access_token

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Fineract-Platform-TenantId" = "default"
}

$resp = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts?clientId=5" -Method Get -Headers $headers
$first = $resp.pageItems[0]
Write-Host "--- Fields in list item ---"
$first.psobject.properties | Select-Object Name, Value
