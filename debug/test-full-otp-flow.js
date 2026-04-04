/**
 * TEST 3: FULL OTP FLOW (E2E Simulation)
 *
 * Mục đích: Mô phỏng toàn bộ luồng Smart OTP từ đầu đến cuối
 *   - Device Registration (Bind)
 *   - Session Creation
 *   - OTP Generation + Signing
 *   - Server Verification (5 checks)
 *   - Session Consumption
 *   - Attack scenarios
 *
 * Chạy: node debug/test-full-otp-flow.js
 */

const crypto = require('crypto');
const { ec: EC } = require('elliptic');
const { generateSync, generateSecret, verifySync } = require('otplib');

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

// ===== Server-side Mock Database =====
const DB = {
  devices: [],
  sessions: [],
  users: [{ _id: 'user123', smartOTP: { enabled: false, lockedUntil: null } }],
};

// ===== Server-side Functions =====
const TOTP_CONFIG = { digits: 6, step: 30, window: 2 };
const SESSION_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const TIMESTAMP_TOLERANCE = 120;

function serverRegisterDevice(userId, publicKey, deviceId) {
  const totpSecret = generateSecret({ length: 32 });
  DB.devices.push({
    userId, deviceId, publicKey, totpSecret,
    status: 'ACTIVE', createdAt: new Date(),
  });
  return { deviceId, totpSecret };
}

function serverCreateSession(userId, deviceId, actionType, actionData) {
  const device = DB.devices.find(d => d.userId === userId && d.deviceId === deviceId && d.status === 'ACTIVE');
  if (!device) throw new Error('Device not trusted');

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
  DB.sessions.push({
    sessionId, userId, deviceId, actionType, actionData,
    status: 'PENDING', expiresAt, attempts: 0,
  });
  return { sessionId, expiresAt };
}

function serverVerifyOtp(userId, sessionId, otp, signature, timestamp, deviceId, actionType) {
  // CHECK 1: Session
  const session = DB.sessions.find(s => s.sessionId === sessionId && s.userId === userId);
  if (!session) return { valid: false, message: 'Session không tồn tại', check: 1 };
  if (session.status !== 'PENDING') return { valid: false, message: 'Session đã used/expired', check: 1 };
  if (session.expiresAt < new Date()) return { valid: false, message: 'Session hết hạn', check: 1 };
  if (session.actionType !== actionType) return { valid: false, message: 'Action type mismatch', check: 1 };
  if (session.attempts >= MAX_ATTEMPTS) return { valid: false, message: 'Max attempts reached', check: 1 };

  // CHECK 2: Device
  const device = DB.devices.find(d => d.userId === userId && d.deviceId === deviceId && d.status === 'ACTIVE');
  if (!device) return { valid: false, message: 'Device not trusted', check: 2 };

  // CHECK 3: ECDSA Signature
  const payload = `${otp}:${timestamp}:${actionType}`;
  try {
    const hash = crypto.createHash('sha256').update(payload).digest();
    const key = ec.keyFromPublic(device.publicKey, 'hex');
    const sigBuffer = Buffer.from(signature, 'base64');
    const sigValid = key.verify(hash, sigBuffer);
    if (!sigValid) {
      session.attempts++;
      return { valid: false, message: 'Signature invalid', check: 3 };
    }
  } catch (e) {
    session.attempts++;
    return { valid: false, message: 'Signature error: ' + e.message, check: 3 };
  }

  // CHECK 4: Timestamp
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE) {
    session.attempts++;
    return { valid: false, message: 'Timestamp invalid', check: 4 };
  }

  // CHECK 5: TOTP
  let totpValid = false;
  const directResult = verifySync({ token: otp, secret: device.totpSecret });
  if (directResult.valid) {
    totpValid = true;
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    const currentStep = Math.floor(nowSec / TOTP_CONFIG.step);
    for (let delta = -TOTP_CONFIG.window; delta <= TOTP_CONFIG.window; delta++) {
      if (delta === 0) continue;
      const testEpoch = (currentStep + delta) * TOTP_CONFIG.step;
      const expected = generateSync({ secret: device.totpSecret, epoch: testEpoch });
      if (otp === expected) { totpValid = true; break; }
    }
  }

  if (!totpValid) {
    session.attempts++;
    if (session.attempts >= MAX_ATTEMPTS) {
      // Lock user
      const user = DB.users.find(u => u._id === userId);
      if (user) user.smartOTP.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    }
    return { valid: false, message: 'OTP invalid', check: 5, attempts: session.attempts };
  }

  // ALL PASS
  session.status = 'VERIFIED';
  session.verifiedAt = new Date();
  return { valid: true, message: 'OK', actionData: session.actionData };
}

function serverConsumeSession(userId, sessionId, actionType) {
  const session = DB.sessions.find(s => s.sessionId === sessionId && s.userId === userId);
  if (!session) return { valid: false, message: 'Session not found' };
  if (session.status !== 'VERIFIED') return { valid: false, message: 'Session not verified' };
  if (session.actionType !== actionType) return { valid: false, message: 'Action mismatch' };
  if (session.expiresAt < new Date()) return { valid: false, message: 'Session expired' };

  session.status = 'COMPLETED';
  session.completedAt = new Date();
  return { valid: true, actionData: session.actionData };
}

// ===== Client-side Functions =====

function clientSign(otp, timestamp, actionType, privateKeyHex) {
  const payload = `${otp}:${timestamp}:${actionType}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  const key = ec.keyFromPrivate(privateKeyHex, 'hex');
  const sig = key.sign(hash);
  return Buffer.from(sig.toDER()).toString('base64');
}

// ═══════════════════════════════════════════════════════
// TEST EXECUTION
// ═══════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 3.1: Device Registration            ║');
console.log('╚══════════════════════════════════════════╝\n');

const clientKey = ec.genKeyPair();
const clientPrivateKey = clientKey.getPrivate('hex');
const clientPublicKey = clientKey.getPublic('hex');

const regResult = serverRegisterDevice('user123', clientPublicKey, 'device-001');

console.log(`  Device ID:    ${regResult.deviceId}`);
console.log(`  TOTP Secret:  ${regResult.totpSecret.substring(0, 16)}...`);
console.log(`  Public Key:   ${clientPublicKey.substring(0, 20)}...`);

assert(!!regResult.totpSecret, 'Server returns totpSecret');
assert(regResult.deviceId === 'device-001', 'Device ID matches');
assert(DB.devices.length === 1, 'Device saved in DB');

const totpSecret = regResult.totpSecret;

// ═══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 3.2: Happy Path (Full Flow)         ║');
console.log('╚══════════════════════════════════════════╝\n');

// Step 1: Create session
const session = serverCreateSession('user123', 'device-001', 'LOAN_CREATE', { amount: 50000000 });
console.log(`  Session ID: ${session.sessionId}`);
console.log(`  Expires At: ${session.expiresAt.toISOString()}`);

assert(!!session.sessionId, 'Session created');

// Step 2: Client generates OTP + signs
const otp = generateSync({ secret: totpSecret });
const timestamp = Math.floor(Date.now() / 1000);
const signature = clientSign(otp, timestamp, 'LOAN_CREATE', clientPrivateKey);

console.log(`  OTP: ${otp}`);
console.log(`  Timestamp: ${timestamp}`);
console.log(`  Signature: ${signature.substring(0, 30)}...`);

// Step 3: Verify
const verifyResult = serverVerifyOtp('user123', session.sessionId, otp, signature, timestamp, 'device-001', 'LOAN_CREATE');
console.log(`  Verify result: ${JSON.stringify(verifyResult)}`);

assert(verifyResult.valid === true, 'Full verify flow succeeds');

// Step 4: Consume
const consumeResult = serverConsumeSession('user123', session.sessionId, 'LOAN_CREATE');
assert(consumeResult.valid === true, 'Session consumed successfully');
assert(consumeResult.actionData.amount === 50000000, 'ActionData preserved');

// Step 5: Try consume again (should fail)
const consumeAgain = serverConsumeSession('user123', session.sessionId, 'LOAN_CREATE');
assert(consumeAgain.valid === false, 'Session cannot be consumed twice');

// ═══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 3.3: Attack Scenarios                ║');
console.log('╚══════════════════════════════════════════╝\n');

// Attack 1: Stolen JWT + No OTP
console.log('  --- Attack 1: Stolen JWT, no Smart OTP ---');
const session2 = serverCreateSession('user123', 'device-001', 'TRANSFER', { amount: 50000000 });
const fakeOtp = '000000';
const fakeTimestamp = Math.floor(Date.now() / 1000);
const fakeSignature = 'invalidbase64signature==';

const attack1 = serverVerifyOtp('user123', session2.sessionId, fakeOtp, fakeSignature, fakeTimestamp, 'device-001', 'TRANSFER');
assert(attack1.valid === false, `Attack 1 blocked at CHECK ${attack1.check}: ${attack1.message}`);

// Attack 2: Correct OTP but wrong device
console.log('\n  --- Attack 2: Correct OTP, wrong device ---');
const hackerKey = ec.genKeyPair();
const session3 = serverCreateSession('user123', 'device-001', 'TRANSFER', { amount: 10000000 });
const realOtp = generateSync({ secret: totpSecret });
const hackerTimestamp = Math.floor(Date.now() / 1000);
const hackerSig = clientSign(realOtp, hackerTimestamp, 'TRANSFER', hackerKey.getPrivate('hex'));

const attack2 = serverVerifyOtp('user123', session3.sessionId, realOtp, hackerSig, hackerTimestamp, 'device-001', 'TRANSFER');
assert(attack2.valid === false, `Attack 2 blocked at CHECK ${attack2.check}: ${attack2.message}`);

// Attack 3: Replay attack (old timestamp)
console.log('\n  --- Attack 3: Replay attack ---');
const session4 = serverCreateSession('user123', 'device-001', 'TRANSFER', { amount: 5000000 });
const oldTimestamp = Math.floor(Date.now() / 1000) - 200; // 200s ago
const validOtp = generateSync({ secret: totpSecret });
const replaySig = clientSign(validOtp, oldTimestamp, 'TRANSFER', clientPrivateKey);

const attack3 = serverVerifyOtp('user123', session4.sessionId, validOtp, replaySig, oldTimestamp, 'device-001', 'TRANSFER');
assert(attack3.valid === false, `Attack 3 blocked at CHECK ${attack3.check}: ${attack3.message}`);

// Attack 4: Wrong action type
console.log('\n  --- Attack 4: Changed action type ---');
const session5 = serverCreateSession('user123', 'device-001', 'REPAYMENT', { amount: 1000000 });
const validOtp2 = generateSync({ secret: totpSecret });
const ts5 = Math.floor(Date.now() / 1000);
const sig5 = clientSign(validOtp2, ts5, 'TRANSFER', clientPrivateKey); // Sign with TRANSFER

const attack4 = serverVerifyOtp('user123', session5.sessionId, validOtp2, sig5, ts5, 'device-001', 'REPAYMENT');
assert(attack4.valid === false, `Attack 4 blocked at CHECK ${attack4.check}: ${attack4.message}`);

// ═══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 3.4: Brute Force Protection         ║');
console.log('╚══════════════════════════════════════════╝\n');

const session6 = serverCreateSession('user123', 'device-001', 'TRANSFER', { amount: 100000 });

for (let attempt = 1; attempt <= 4; attempt++) {
  const wrongOtp = String(attempt).padStart(6, '0');
  const ts = Math.floor(Date.now() / 1000);
  const sig = clientSign(wrongOtp, ts, 'TRANSFER', clientPrivateKey);
  const result = serverVerifyOtp('user123', session6.sessionId, wrongOtp, sig, ts, 'device-001', 'TRANSFER');

  if (attempt <= 3) {
    assert(result.valid === false, `Attempt ${attempt}: wrong OTP rejected (${result.message})`);
  } else {
    assert(result.valid === false, `Attempt ${attempt}: blocked after max attempts (${result.message})`);
  }
}

// Check if user is locked
const user = DB.users.find(u => u._id === 'user123');
assert(
  user.smartOTP.lockedUntil !== null && user.smartOTP.lockedUntil > new Date(),
  'User locked after 3 failed attempts'
);

// ═══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 3.5: Boundary Condition (Step Xoay) ║');
console.log('╚══════════════════════════════════════════╝\n');

// Reset user lock
user.smartOTP.lockedUntil = null;

const session7 = serverCreateSession('user123', 'device-001', 'TRANSFER', { amount: 200000 });

// Client sinh OTP ở step N
const nowSec = Math.floor(Date.now() / 1000);
const currentStep = Math.floor(nowSec / TOTP_CONFIG.step);
const stepNOtp = generateSync({ secret: totpSecret, epoch: currentStep * TOTP_CONFIG.step });

// Simulate: Server verify ở step N+1 (bằng cách mock Date.now)
const originalDateNow = Date.now;
Date.now = () => ((currentStep + 1) * TOTP_CONFIG.step + 2) * 1000; // step N+1, 2 giây sau ranh giới

const ts7 = Math.floor(originalDateNow() / 1000); // timestamp thực
const sig7 = clientSign(stepNOtp, ts7, 'TRANSFER', clientPrivateKey);
const boundaryResult = serverVerifyOtp('user123', session7.sessionId, stepNOtp, sig7, ts7, 'device-001', 'TRANSFER');

Date.now = originalDateNow; // Restore

console.log(`  Client OTP (step ${currentStep}): ${stepNOtp}`);
console.log(`  Server at step: ${currentStep + 1}`);
console.log(`  Result: ${JSON.stringify(boundaryResult)}`);

assert(boundaryResult.valid === true, 'OTP from previous step accepted via window');

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════╗');
console.log(`║   RESULTS: ${passed} passed, ${failed} failed               ║`);
console.log('╚══════════════════════════════════════════╝\n');

if (failed > 0) {
  process.exit(1);
}
