# 📘 Chương 4: Luồng Device Binding (Đăng ký thiết bị)

## 4.1. Tổng quan

Device Binding là quá trình **gắn chặt** một thiết bị vật lý với tài khoản người dùng. Sau khi bind:
- Chỉ thiết bị **đã đăng ký** mới được phép tạo giao dịch
- Server lưu **Public Key** + **TOTP Secret** của thiết bị
- Client lưu **Private Key** + **TOTP Secret** trong hardware-encrypted storage

## 4.2. Luồng chi tiết (Step by Step)

```
┌─────────────────────────────────────────────────────────────────────┐
│  BƯỚC 1: Người dùng nhấn "Đăng ký thiết bị" trên ProfileScreen    │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                            ┌─────────▼─────────┐
                            │   CÓ BẬT 2FA?     │
                            └────┬──────────┬────┘
                             Có  │          │ Không
                            ┌────▼──────┐   │
                            │ Nhập mã   │   │
                            │ Google    │   │
                            │ Authenti- │   │
                            │ cator     │   │
                            └────┬──────┘   │
                                 │          │
                            ┌────▼──────────▼────┐
                            │  BƯỚC 2: Client     │
                            │  tạo ECDSA Key Pair │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  BƯỚC 3: Client     │
                            │  thu thập Device    │
                            │  Fingerprint        │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  BƯỚC 4: Gửi lên   │
                            │  Server qua HTTPS   │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  BƯỚC 5: Server     │
                            │  validate + tạo     │
                            │  TOTP Secret        │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  BƯỚC 6: Server     │
                            │  lưu MongoDB        │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  BƯỚC 7: Trả về     │
                            │  TOTP Secret cho    │
                            │  Client             │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  BƯỚC 8: Client     │
                            │  lưu SecureStore    │
                            └─────────────────────┘
```

## 4.3. Chi tiết từng bước

### Bước 1: Xác thực 2FA (nếu bật)

```
Nếu user đã bật Google Authenticator (2FA):
  → Yêu cầu nhập mã 6 số từ Google Authenticator
  → Server verify mã trước khi cho phép đăng ký device
  → Mục đích: Đảm bảo người thật đang thao tác (không phải kẻ cắp JWT)
```

**Code Client:**
```typescript
// File: SmartOTPSection.tsx dòng 46-97
const handleRegister = async () => {
  // Kiểm tra 2FA có bật không
  const freshStatus = await TwoFactorService.getStatus();
  
  if (freshStatus.enabled) {
    // Yêu cầu nhập mã Google Authenticator
    if (Platform.OS === 'ios') {
      Alert.prompt('Xác thực 2FA', 'Nhập mã từ Authenticator', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: (token) => registerWithToken(token) },
      ]);
    } else {
      setShowAuthModal(true); // Hiện modal nhập mã
    }
  } else {
    // Không có 2FA → đăng ký trực tiếp
    registerWithToken();
  }
};
```

### Bước 2: Tạo ECDSA Key Pair trên Client

```
┌───────────────────────────────────────────────────────┐
│           TRÊN THIẾT BỊ NGƯỜI DÙNG                    │
│                                                       │
│   expo-crypto.getRandomBytesAsync(32)                 │
│   → 32 bytes random (256 bit)                         │
│   → "a1b2c3d4e5f60718293a4b5c6d7e8f90..."             │
│                          │                            │
│                 elliptic: ec.keyFromPrivate()          │
│                          │                            │
│            ┌─────────────┴─────────────┐              │
│            │                           │              │
│     Private Key                  Public Key           │
│     64 hex chars                 130 hex chars         │
│     "a1b2c3d4..."               "040aeee5..."         │
│            │                           │              │
│            ▼                           ▼              │
│     SecureStore                  Gửi lên Server       │
│     (AES-256-GCM                 qua HTTPS            │
│      + hardware                                       │
│      keychain)                                        │
└───────────────────────────────────────────────────────┘
```

**Code Client:**
```typescript
// File: smart-otp.service.ts dòng 107-132
const generateKeyPair = async () => {
  // 1. Tạo entropy (nguồn ngẫu nhiên)
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  // randomBytes = Uint8Array(32) [167, 178, 195, 212, ...]
  // Nguồn: /dev/urandom (Linux/Android) hoặc SecRandomCopyBytes (iOS)
  // → Hardware random number generator (TRNG)

  // 2. Chuyển sang hex string
  const privateKeyHex = Array.from(randomBytes)
    .map(c => c.toString(16).padStart(2, '0'))
    .join('');
  // → "a7b2c3d4e5f60718..."

  // 3. Derive Public Key (Q = k × G)
  const key = ec.keyFromPrivate(privateKeyHex, 'hex');
  const privateKey = key.getPrivate('hex');
  const publicKey = key.getPublic('hex');
  // publicKey format: "04" + x(64 hex) + y(64 hex) = 130 hex

  // 4. Lưu vào hardware-encrypted storage
  await SecureStore.setItemAsync('smart_otp_private_key', privateKey);
  await SecureStore.setItemAsync('smart_otp_public_key', publicKey);

  return { privateKey, publicKey };
};
```

### Bước 3: Thu thập Device Fingerprint

```
Device Fingerprint = Thông tin nhận dạng thiết bị:

{
  deviceId:    "d4ecf176..."   ← SHA256(deviceName|model|os|...)
  deviceName:  "sdk_gphone64_x86_64"
  model:       "sdk_gphone64_x86_64"
  brand:       "google"
  os:          "Android"
  osVersion:   "15"
  appVersion:  "1.0.0"
  buildNumber: "1"
}
```

**Code Client:**
```typescript
// File: smart-otp.service.ts dòng 58-101
const getDeviceId = async (): Promise<string> => {
  let deviceId = await SecureStore.getItemAsync('smart_otp_device_id');
  
  if (!deviceId) {
    // Tạo mới từ thông tin thiết bị
    const deviceInfo = [
      Device.deviceName,           // "iPhone 15 Pro Max"
      Device.modelName,            // "iPhone16,2"
      Device.osName,               // "iOS"
      Device.osVersion,            // "18.0"
      Application.applicationId,   // "com.p2p.app"
      Date.now().toString(),       // Timestamp (đảm bảo unique)
    ].join('|');
    // → "iPhone 15 Pro Max|iPhone16,2|iOS|18.0|com.p2p.app|1743889200"

    deviceId = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      deviceInfo,
    );
    // → "d4ecf17695448b8eeed660a196ef4669a202bf7972aaeb1f7bbea4cc..."

    await SecureStore.setItemAsync('smart_otp_device_id', deviceId);
  }
  
  return deviceId;
};
```

### Bước 4: Gửi lên Server

```
POST /api/otp/register-device
Authorization: Bearer <JWT>

{
  "publicKey": "040aeee59c257c03...7215d21e",
  "deviceFingerprint": {
    "deviceId": "d4ecf176...",
    "deviceName": "sdk_gphone64_x86_64",
    "os": "Android",
    "osVersion": "15",
    "model": "sdk_gphone64_x86_64",
    "brand": "google"
  },
  "verificationToken": "695139"    ← Mã 2FA (nếu bật)
}
```

### Bước 5-6: Server xử lý và lưu DB

```typescript
// File: device-binding.service.ts dòng 34-138
async registerDevice(userId, publicKey, deviceFingerprint, ipAddress) {
  const { deviceId, deviceName, ...fingerprint } = deviceFingerprint;

  // 1. Kiểm tra user tồn tại
  const user = await this.userModel.findById(userId);

  // 2. Kiểm tra giới hạn thiết bị (max 10)
  const existingDevices = await this.deviceBindingModel.countDocuments({
    userId, status: 'active', deviceId: { $ne: deviceId }
  });
  if (existingDevices >= 10) throw 'Đã đạt giới hạn';

  // 3. Kiểm tra device đã đăng ký chưa (nếu có → re-activate)
  const existingDevice = await this.deviceBindingModel.findOne({ userId, deviceId });
  
  if (existingDevice) {
    // Re-activate: cập nhật key mới
    existingDevice.status = 'active';
    existingDevice.publicKey = publicKey;
    existingDevice.totpSecret = this.totpService.generateSecret();
    await existingDevice.save();
    return { deviceId, totpSecret: existingDevice.totpSecret };
  }

  // 4. Tạo TOTP Secret mới
  const totpSecret = this.totpService.generateSecret();
  // totpSecret = "42KX6PQI3IKNVGCHIBZOY55YCAPOJLBT..."

  // 5. Lưu vào MongoDB
  const newDevice = new this.deviceBindingModel({
    userId,
    deviceId,          // SHA256 hash
    deviceName,        // "iPhone 15"
    publicKey,         // ECDSA P-256 (130 hex chars)
    totpSecret,        // Base32 encoded (32 chars)
    fingerprint,       // { os, model, brand, ... }
    status: 'active',
    registeredFromIP: ipAddress,
  });
  await newDevice.save();

  // 6. Cập nhật user profile
  await this.userModel.findByIdAndUpdate(userId, {
    'smartOTP.enabled': true,
    'smartOTP.registeredDevices': activeCount + 1,
  });

  return { deviceId, totpSecret };
}
```

### Bước 7-8: Client nhận và lưu TOTP Secret

```typescript
// File: smart-otp.service.ts dòng 262-310
const registerDevice = async (verificationToken?: string) => {
  const { privateKey, publicKey } = await generateKeyPair();
  const deviceFingerprint = await getDeviceFingerprint();

  // Gọi API
  const response = await api.post('/otp/register-device', {
    publicKey,
    deviceFingerprint,
    verificationToken,
  });

  const { totpSecret } = response.data.data;
  
  // Lưu TOTP Secret vào SecureStore
  await SecureStore.setItemAsync('smart_otp_totp_secret', totpSecret);
  // → Hardware-encrypted, chỉ app hiện tại đọc được
  
  return true;
};
```

## 4.4. Dữ liệu sau khi Binding thành công

```
┌─────────────────────────────────────────────────────┐
│               CLIENT (SecureStore)                   │
│                                                     │
│  smart_otp_private_key = "a7b2c3d4..."  (64 hex)   │
│  smart_otp_public_key  = "040aeee5..."  (130 hex)   │
│  smart_otp_totp_secret = "42KX6PQI..."  (32 chars)  │
│  smart_otp_device_id   = "d4ecf176..."  (64 hex)    │
│                                                     │
│  ⚠️ Private Key KHÔNG BAO GIỜ rời khỏi thiết bị!   │
│     Ngay cả Server cũng không biết Private Key!     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│               SERVER (MongoDB)                       │
│                                                     │
│  Collection: device_bindings                        │
│  {                                                  │
│    userId:     ObjectId("6989b9f8...")               │
│    deviceId:   "d4ecf176..."                         │
│    deviceName: "sdk_gphone64_x86_64"                │
│    publicKey:  "040aeee5..." (130 hex)  ← CHỈCÓ CÁI NÀY │
│    totpSecret: "42KX6PQI..." (32 chars)             │
│    status:     "active"                              │
│    fingerprint: { os: "Android", model: "..." }     │
│  }                                                  │
│                                                     │
│  ⚠️ Server có Public Key, KHÔNG có Private Key!     │
│     → Nếu DB bị hack, hacker vẫn KHÔNG giả mạo được │
└─────────────────────────────────────────────────────┘
```

## 4.5. Bảo mật Device Binding

| Kịch bản | Hậu quả | Giải pháp |
|----------|---------|-----------|
| Database bị leak | Hacker có publicKey + totpSecret | Không thể ký (thiếu privateKey) |
| JWT bị đánh cắp | Hacker gọi API với token | deviceId không khớp → bị chặn |
| Thiết bị bị mất | Kẻ cắp có tất cả keys | User revoke device từ thiết bị khác |
| Re-install app | SecureStore bị xóa | Đăng ký lại (cần 2FA) |
| Root/Jailbreak | Có thể đọc SecureStore | App detect + cảnh báo |

---

> **Tiếp theo:** [Chương 5: Luồng Verify OTP](./05-luong-verify-otp.md)
