
# Script: check-fineract-clients.ps1
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

    # 2. List first 10 clients
    Write-Host "Listing first 10 clients..."
    $clients = Invoke-RestMethod -Uri "$fineractBaseUrl/clients?limit=10" -Method Get -Headers $headers
    $clients.pageItems | ForEach-Object {
        Write-Host "ID: $($_.id) | Name: $($_.displayName) | ExtID: $($_.externalId)"
    }

    # 3. Test Search by External ID
    $targetExtId = "0799000001"
    Write-Host "`nSearching by externalId=$targetExtId..."
    $search1 = Invoke-RestMethod -Uri "$fineractBaseUrl/clients?externalId=$targetExtId" -Method Get -Headers $headers
    Write-Host "Search 1 Result Type: $($search1.GetType().Name)"
    Write-Host "Search 1 PageItems Count: $($search1.pageItems.Count)"
    
    # 4. Test Search by Mobile No
    Write-Host "`nSearching by mobileNo=$targetExtId..."
    $search2 = Invoke-RestMethod -Uri "$fineractBaseUrl/clients?mobileNo=$targetExtId" -Method Get -Headers $headers
    Write-Host "Search 2 Result Type: $($search2.GetType().Name)"
    Write-Host "Search 2 PageItems Count: $($search2.pageItems.Count)"

} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
