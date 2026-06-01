const axios = require('axios');
const jwt = require('jsonwebtoken');

async function main() {
  const url = 'http://localhost:9000/realms/fineract/protocol/openid-connect/token';
  const data = new URLSearchParams({
    username: '0399614016',
    password: 'kss0987AF@',
    client_id: 'community-app',
    client_secret: 'real-client-secret-123',
    grant_type: 'password'
  });

  const response = await axios.post(url, data.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const accessToken = response.data.access_token;
  console.log("ACCESS TOKEN:", accessToken);

  const decoded = jwt.decode(accessToken);
  console.log("DECODED PAYLOAD:", JSON.stringify(decoded, null, 2));
}

main().catch(console.error);
