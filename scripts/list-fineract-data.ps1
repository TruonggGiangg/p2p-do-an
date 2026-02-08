
# Script: list-fineract-data.ps1
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

    Write-Host "--- ALL SAVINGS ACCOUNTS ---"
    $accounts = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts" -Method Get -Headers $headers
    $accounts.pageItems | ForEach-Object {
        Write-Host "SavingsID: $($_.id) | AccountNo: $($_.accountNo) | ClientID: $($_.clientId) | ClientName: $($_.clientName)"
    }

    Write-Host "`n--- ALL CLIENTS ---"
    $clients = Invoke-RestMethod -Uri "$fineractBaseUrl/clients" -Method Get -Headers $headers
    $clients.pageItems | ForEach-Object {
        Write-Host "ClientID: $($_.id) | Name: $($_.displayName) | ExtID: $($_.externalId)"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
