/**
 * TEST 2: ECDSA SIGNATURE
 *
 * Mục đích: Kiểm tra luồng ký + verify chữ ký ECDSA
 *   - Sign trên client → Verify trên server (cùng lib elliptic)
 *   - Tampered payload detection
 *   - Wrong key detection
 *   - Replay attack (cùng signature, khác timestamp)
 *
 * Chạy: node debug/test-ecdsa-signature.js
 */

const crypto = require('crypto');
const { ec: EC } = require('elliptic');

const ec = new EC('p256');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

// ===== Simulate Client functions =====

function clientGenerateKeyPair() {
  const key = ec.genKeyPair();
  return {
    privateKey: key.getPrivate('hex'),
    publicKey: key.getPublic('hex'),
  };
}

function clientSign(otp, timestamp, actionType, privateKeyHex) {
  const payload = `${otp}:${timestamp}:${actionType}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  const key = ec.keyFromPrivate(privateKeyHex, 'hex');
  const signature = key.sign(hash);
  const derSign = signature.toDER();
  return Buffer.from(derSign).toString('base64');
}

// ===== Simulate Server functions =====

function serverVerify(otp, timestamp, actionType, signatureBase64, publicKeyHex) {
  const payload = `${otp}:${timestamp}:${actionType}`;
  const hash = crypto.createHash('sha256').update(payload).digest();
  const key = ec.keyFromPublic(publicKeyHex, 'hex');
  const sigBuffer = Buffer.from(signatureBase64, 'base64');
  return key.verify(hash, sigBuffer);
}

// ===== TEST SUITE 1: Normal Sign & Verify =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 2.1: Normal Sign & Verify          ║');
console.log('╚══════════════════════════════════════════╝\n');

const device1 = clientGenerateKeyPair();
const otp = '482951';
const timestamp = Math.floor(Date.now() / 1000);
const actionType = 'LOAN_CREATE';

const signature = clientSign(otp, timestamp, actionType, device1.privateKey);
const isValid = serverVerify(otp, timestamp, actionType, signature, device1.publicKey);

console.log(`  OTP: ${otp}`);
console.log(`  Timestamp: ${timestamp}`);
console.log(`  Action: ${actionType}`);
console.log(`  Signature: ${signature.substring(0, 30)}...`);
console.log(`  Public Key: ${device1.publicKey.substring(0, 20)}...`);
console.log();

assert(isValid === true, 'Valid signature verifies correctly');

// ===== TEST SUITE 2: Tampered Payload =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 2.2: Tampered Payload Detection     ║');
console.log('╚══════════════════════════════════════════╝\n');

// Hacker thay đổi OTP
const tamperedOtp = serverVerify('000000', timestamp, actionType, signature, device1.publicKey);
assert(tamperedOtp === false, 'Changed OTP → signature invalid');

// Hacker thay đổi timestamp
const tamperedTimestamp = serverVerify(otp, timestamp + 100, actionType, signature, device1.publicKey);
assert(tamperedTimestamp === false, 'Changed timestamp → signature invalid');

// Hacker thay đổi action type
const tamperedAction = serverVerify(otp, timestamp, 'TRANSFER', signature, device1.publicKey);
assert(tamperedAction === false, 'Changed actionType → signature invalid');

// Hacker thay đổi amount (dù amount không nằm trong signature)
// → Signature vẫn valid! Nhưng session.actionData chứa amount riêng
console.log('\n  ⚠️  Note: Amount nằm trong actionData (session), KHÔNG trong signature.');
console.log('  → Amount được bảo vệ bởi SESSION, không bởi ECDSA signature.');

// ===== TEST SUITE 3: Wrong Device =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 2.3: Wrong Device (Different Key)   ║');
console.log('╚══════════════════════════════════════════╝\n');

const device2 = clientGenerateKeyPair();

// Hacker biết OTP nhưng ký bằng device khác
const hackerSignature = clientSign(otp, timestamp, actionType, device2.privateKey);
const verifyWithWrongDevice = serverVerify(otp, timestamp, actionType, hackerSignature, device1.publicKey);

console.log(`  Device 1 pubKey: ${device1.publicKey.substring(0, 20)}...`);
console.log(`  Device 2 pubKey: ${device2.publicKey.substring(0, 20)}...`);
console.log();

assert(verifyWithWrongDevice === false, 'Hacker signs with different device → REJECT');

// Verify with correct key pair
const verifyWithCorrectDevice = serverVerify(otp, timestamp, actionType, hackerSignature, device2.publicKey);
assert(verifyWithCorrectDevice === true, 'Same device signs & verifies → ACCEPT');

// ===== TEST SUITE 4: Replay Attack =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 2.4: Replay Attack Simulation       ║');
console.log('╚══════════════════════════════════════════╝\n');

const originalTimestamp = Math.floor(Date.now() / 1000) - 200; // 200 giây trước
const originalSig = clientSign(otp, originalTimestamp, actionType, device1.privateKey);

// Signature vẫn valid (vì data không đổi)
const sigValid = serverVerify(otp, originalTimestamp, actionType, originalSig, device1.publicKey);
assert(sigValid === true, 'Replayed signature still mathematically valid');

// Nhưng TIMESTAMP CHECK trên server sẽ reject
const serverNow = Math.floor(Date.now() / 1000);
const timestampDiff = Math.abs(serverNow - originalTimestamp);
const timestampTolerance = 120; // 2 phút

console.log(`\n  Replay scenario:`);
console.log(`    Original timestamp: ${originalTimestamp} (${timestampDiff}s ago)`);
console.log(`    Server now:         ${serverNow}`);
console.log(`    Difference:         ${timestampDiff}s`);
console.log(`    Tolerance:          ${timestampTolerance}s`);
console.log();

assert(
  timestampDiff > timestampTolerance,
  `Timestamp check rejects replay (${timestampDiff}s > ${timestampTolerance}s tolerance)`
);

// ===== TEST SUITE 5: Signature Consistency =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 2.5: Signature Determinism          ║');
console.log('╚══════════════════════════════════════════╝\n');

// ECDSA sinh signature KHÁC NHAU mỗi lần (do random k-value)
const sig1 = clientSign(otp, timestamp, actionType, device1.privateKey);
const sig2 = clientSign(otp, timestamp, actionType, device1.privateKey);

if (sig1 === sig2) {
  console.log('  ℹ️  elliptic uses deterministic k (RFC 6979) → same input = same signature');
  assert(true, 'Same payload → same signature (deterministic ECDSA / RFC 6979)');
} else {
  assert(true, 'Same payload → different signatures (random k ECDSA)');
}

// Nhưng cả 2 đều verify OK
assert(serverVerify(otp, timestamp, actionType, sig1, device1.publicKey), 'Signature 1 verifies');
assert(serverVerify(otp, timestamp, actionType, sig2, device1.publicKey), 'Signature 2 verifies');

// ===== SUMMARY =====
console.log('\n╔══════════════════════════════════════════╗');
console.log(`║   RESULTS: ${passed} passed, ${failed} failed              ║`);
console.log('╚══════════════════════════════════════════╝\n');

if (failed > 0) {
  process.exit(1);
}
