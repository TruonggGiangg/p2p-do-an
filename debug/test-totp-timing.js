/**
 * TEST 1: TOTP TIMING & WINDOW
 * 
 * Mục đích: Kiểm tra cơ chế thời gian của TOTP
 *   - Window ±2 steps có hoạt động đúng?
 *   - Ranh giới 30s (boundary condition)
 *   - Clock drift simulation
 * 
 * Chạy: node debug/test-totp-timing.js
 */

const { generateSync, verifySync } = require('otplib');

const TOTP_CONFIG = {
  digits: 6,
  step: 30,
  window: 2,
};

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

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

// ===== Hàm verify giống server =====
function verifyWithWindow(secret, token) {
  // Bước 1: verifySync trực tiếp
  const directResult = verifySync({ token, secret });
  if (directResult.valid) {
    return { valid: true, source: 'direct', delta: directResult.delta };
  }

  // Bước 2: Manual window check
  const nowSec = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(nowSec / TOTP_CONFIG.step);

  for (let delta = -TOTP_CONFIG.window; delta <= TOTP_CONFIG.window; delta++) {
    if (delta === 0) continue;
    const testEpoch = (currentStep + delta) * TOTP_CONFIG.step;
    const expectedToken = generateSync({ secret, epoch: testEpoch });
    if (token === expectedToken) {
      return { valid: true, source: 'window', delta };
    }
  }

  return { valid: false, source: 'none', delta: null };
}

// ===== TEST SUITE 1: Epoch Unit =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 1.1: otplib epoch unit (s vs ms)  ║');
console.log('╚══════════════════════════════════════════╝\n');

const nowSec = Math.floor(Date.now() / 1000);
const currentStep = Math.floor(nowSec / TOTP_CONFIG.step);

const otpDefault = generateSync({ secret: SECRET });
const otpSeconds = generateSync({ secret: SECRET, epoch: currentStep * TOTP_CONFIG.step });
const otpMillis = generateSync({ secret: SECRET, epoch: currentStep * TOTP_CONFIG.step * 1000 });

console.log(`  Server time: ${new Date().toISOString()}`);
console.log(`  Current step: ${currentStep}`);
console.log(`  Remaining: ${TOTP_CONFIG.step - (nowSec % TOTP_CONFIG.step)}s`);
console.log(`  OTP (default):      ${otpDefault}`);
console.log(`  OTP (epoch=sec):    ${otpSeconds}`);
console.log(`  OTP (epoch=ms):     ${otpMillis}`);
console.log();

assert(otpDefault === otpSeconds, 'otplib uses SECONDS for epoch');
assert(otpDefault !== otpMillis, 'Milliseconds gives DIFFERENT result');

// ===== TEST SUITE 2: Window ±2 =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 1.2: Window ±2 steps              ║');
console.log('╚══════════════════════════════════════════╝\n');

for (let delta = -4; delta <= 4; delta++) {
  const epoch = (currentStep + delta) * TOTP_CONFIG.step;
  const otp = generateSync({ secret: SECRET, epoch });
  const result = verifyWithWindow(SECRET, otp);
  const shouldPass = Math.abs(delta) <= TOTP_CONFIG.window;

  assert(
    result.valid === shouldPass,
    `delta=${delta >= 0 ? '+' : ''}${delta}: OTP=${otp} → ${shouldPass ? 'ACCEPT' : 'REJECT'} (got: ${result.valid})`
  );
}

// ===== TEST SUITE 3: Clock Drift Simulation =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 1.3: Clock drift simulation        ║');
console.log('╚══════════════════════════════════════════╝\n');

const drifts = [0, 5, 15, 29, 30, 45, 59, 60, 61, 90];

for (const driftSec of drifts) {
  // Giả lập: Client ở thời điểm (now - driftSec)
  const clientTime = nowSec - driftSec;
  const clientStep = Math.floor(clientTime / TOTP_CONFIG.step);
  const clientOtp = generateSync({
    secret: SECRET,
    epoch: clientStep * TOTP_CONFIG.step,
  });

  // Server verify ở thời điểm now
  const result = verifyWithWindow(SECRET, clientOtp);
  const stepDiff = Math.abs(currentStep - clientStep);
  const shouldPass = stepDiff <= TOTP_CONFIG.window;

  assert(
    result.valid === shouldPass,
    `Drift ${driftSec}s (${stepDiff} steps): OTP=${clientOtp} → ${shouldPass ? 'ACCEPT' : 'REJECT'} (got: ${result.valid})`
  );
}

// ===== TEST SUITE 4: Boundary Condition (2-3s remaining) =====
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   TEST 1.4: Boundary condition (2-3s)     ║');
console.log('╚══════════════════════════════════════════╝\n');

// Giả lập: Client sinh OTP ở cuối step, server nhận ở đầu step tiếp theo
const boundaryStep = currentStep;
const clientOtpAtBoundary = generateSync({
  secret: SECRET,
  epoch: boundaryStep * TOTP_CONFIG.step,
});

// Server nhận sau khi step xoay (step + 1)
const serverAtNextStep = (boundaryStep + 1) * TOTP_CONFIG.step;
const serverOtpAtNextStep = generateSync({
  secret: SECRET,
  epoch: serverAtNextStep,
});

console.log(`  Client OTP (step ${boundaryStep}): ${clientOtpAtBoundary}`);
console.log(`  Server OTP (step ${boundaryStep + 1}): ${serverOtpAtNextStep}`);

// Simulate: server verify client's OTP at next step
const originalDateNow = Date.now;
Date.now = () => serverAtNextStep * 1000 + 500; // Server at start of next step

const boundaryResult = verifyWithWindow(SECRET, clientOtpAtBoundary);
Date.now = originalDateNow; // Restore

assert(
  boundaryResult.valid === true,
  `Client step N, Server step N+1: should PASS via window (delta=${boundaryResult.delta})`
);

// Test: 2 steps ahead
Date.now = () => (boundaryStep + 2) * TOTP_CONFIG.step * 1000 + 500;
const boundary2Result = verifyWithWindow(SECRET, clientOtpAtBoundary);
Date.now = originalDateNow;

assert(
  boundary2Result.valid === true,
  `Client step N, Server step N+2: should PASS via window (delta=${boundary2Result.delta})`
);

// Test: 3 steps ahead → should FAIL
Date.now = () => (boundaryStep + 3) * TOTP_CONFIG.step * 1000 + 500;
const boundary3Result = verifyWithWindow(SECRET, clientOtpAtBoundary);
Date.now = originalDateNow;

assert(
  boundary3Result.valid === false,
  `Client step N, Server step N+3: should REJECT (outside window)`
);

// ===== SUMMARY =====
console.log('\n╔══════════════════════════════════════════╗');
console.log(`║   RESULTS: ${passed} passed, ${failed} failed              ║`);
console.log('╚══════════════════════════════════════════╝\n');

if (failed > 0) {
  process.exit(1);
}
