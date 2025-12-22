# Test Registration Endpoint

## Endpoint
```
POST http://localhost:3000/auth/register
Content-Type: application/json
```

## Request Body
```json
{
  "firstName": "Test",
  "lastName": "User",
  "phoneNumber": "0912345678",
  "email": "testuser@example.com",
  "password": "SecurePassword123!",
  "userType": "borrower"
}
```

## Expected Response (Success)
```json
{
  "statusCode": 201,
  "message": "Đăng ký thành công",
  "data": {
    "username": "0912345678",
    "clientId": 5,
    "savingsId": 8
  }
}
```

## curl Command
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "phoneNumber": "0912345678",
    "email": "testuser@example.com",
    "password": "SecurePassword123!",
    "userType": "borrower"
  }'
```

## Steps to Test
1. Run curl command above
2. Check server logs for FineractSignupService logs
3. Verify Fineract client created
4. Verify savings account created and activated
5. Try login with username "0912345678" and password

## Verification in Fineract
```bash
# Check client created
curl "http://118.69.41.95:8080/fineract-provider/api/v1/clients?externalId=0912345678" \
  -H "Authorization: Basic bWlmb3M6cGFzc3dvcmQ=" \
  -H "Fineract-Platform-Tenant Id: default"
```
