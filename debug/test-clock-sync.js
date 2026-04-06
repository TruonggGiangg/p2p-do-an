/**
 * TEST 4: CLOCK SYNC DIAGNOSTIC
 *
 * Mục đích: Kiểm tra đồng hồ giữa các máy
 *   - Hiển thị thời gian hiện tại theo nhiều format
 *   - Tính remaining seconds
 *   - So sánh với NTP server
 *   - Chạy trên CẢ PC lẫn điện thoại để so sánh
 *
 * Chạy trên server:  node debug/test-clock-sync.js
 * Chạy trên client:  Copy logic vào console Expo
 */

const { generateSync } = require('otplib');

const TOTP_CONFIG = { step: 30, window: 2 };
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   CLOCK DIAGNOSTIC                         ║');
console.log('╚══════════════════════════════════════════╝\n');

const now = Date.now();
const nowSec = Math.floor(now / 1000);
const currentStep = Math.floor(nowSec / TOTP_CONFIG.step);
const remaining = TOTP_CONFIG.step - (nowSec % TOTP_CONFIG.step);

console.log(`  Date.now() (ms):    ${now}`);
console.log(`  Unix epoch (sec):   ${nowSec}`);
console.log(`  ISO time:           ${new Date(now).toISOString()}`);
console.log(`  Local time:         ${new Date(now).toLocaleString('vi-VN')}`);
console.log(`  Timezone offset:    ${new Date().getTimezoneOffset()} minutes`);
console.log();
console.log(`  TOTP step:          ${currentStep}`);
console.log(`  Remaining:          ${remaining}s`);
console.log(`  Current OTP:        ${generateSync({ secret: SECRET })}`);
console.log();

// Generate OTP timeline
console.log('  ─── OTP Timeline (±5 steps) ───');
for (let d = -2; d <= 5; d++) {
  const epoch = (currentStep + d) * TOTP_CONFIG.step;
  const otp = generateSync({ secret: SECRET, epoch });
  const time = new Date(epoch * 1000).toLocaleTimeString('vi-VN');
  const marker = d === 0 ? ' ◄── NOW' : '';
  const withinWindow = Math.abs(d) <= TOTP_CONFIG.window ? ' [✓ window]' : ' [✗ outside]';
  console.log(`  ${d >= 0 ? ' ' : ''}${d}: ${time} → ${otp}${withinWindow}${marker}`);
}

console.log('\n  ─── Copy these values ───');
console.log(`  UNIX_TIMESTAMP=${nowSec}`);
console.log(`  ISO_TIME=${new Date(now).toISOString()}`);
console.log(`  TOTP_STEP=${currentStep}`);
console.log(`  REMAINING=${remaining}`);
console.log(`  OTP=${generateSync({ secret: SECRET })}`);

console.log('\n  ─── Instructions ───');
console.log('  1. Chạy script này trên PC (server)');
console.log('  2. Đồng thời chạy trên điện thoại:');
console.log('     console.log(Math.floor(Date.now()/1000))');
console.log('  3. So sánh UNIX_TIMESTAMP giữa 2 máy');
console.log('  4. Nếu lệch > 30s → đó là nguyên nhân OTP bị reject\n');

// ===== NTP Check =====
console.log('╔══════════════════════════════════════════╗');
console.log('║   NTP TIME CHECK                           ║');
console.log('╚══════════════════════════════════════════╝\n');

const https = require('http');

const checkWorldTime = () => {
  return new Promise((resolve) => {
    const req = https.get('http://worldtimeapi.org/api/timezone/Asia/Ho_Chi_Minh', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const serverUnix = Math.floor(Date.now() / 1000);
          const ntpUnix = json.unixtime;
          const drift = serverUnix - ntpUnix;

          console.log(`  NTP time:     ${json.datetime}`);
          console.log(`  Local time:   ${new Date().toISOString()}`);
          console.log(`  NTP unix:     ${ntpUnix}`);
          console.log(`  Local unix:   ${serverUnix}`);
          console.log(`  Drift:        ${drift}s`);
          console.log();

          if (Math.abs(drift) <= 2) {
            console.log('  ✅ Clock is synchronized (drift ≤ 2s)');
          } else if (Math.abs(drift) <= 30) {
            console.log(`  ⚠️  Clock drift detected: ${drift}s (within TOTP window)`);
          } else {
            console.log(`  ❌ LARGE clock drift: ${drift}s (may cause OTP failures!)`);
          }
          resolve();
        } catch (e) {
          console.log('  ⚠️  Could not parse NTP response');
          resolve();
        }
      });
    });

    req.on('error', (e) => {
      console.log('  ⚠️  Cannot reach NTP server:', e.message);
      console.log('  (This is fine for offline testing)');
      resolve();
    });

    req.setTimeout(5000, () => {
      console.log('  ⚠️  NTP request timeout');
      req.destroy();
      resolve();
    });
  });
};

checkWorldTime().then(() => {
  console.log('\n  Done!\n');
});
