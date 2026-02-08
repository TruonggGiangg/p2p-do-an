
# Script: debug-deposit-today.ps1
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
    "Content-Type" = "application/json"
    "Fineract-Platform-TenantId" = "default"
}

$accId = 1
# Use TODAY instead of yesterday
$currentDate = (Get-Date).ToString("dd MMMM yyyy", [System.Globalization.CultureInfo]::InvariantCulture)

$depositData = @{
    transactionDate = $currentDate
    transactionAmount = 10000000
    dateFormat = "dd MMMM yyyy"
    locale = "en"
    paymentTypeId = 1
} | ConvertTo-Json

try {
    Write-Host "Trying deposit for Account 1 with date: $currentDate"
    $resp = Invoke-RestMethod -Uri "$fineractBaseUrl/savingsaccounts/$accId/transactions?command=deposit" -Method Post -Headers $headers -Body $depositData
    Write-Host "Success: $($resp | ConvertTo-Json)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Response Body: $body"
    }
}
