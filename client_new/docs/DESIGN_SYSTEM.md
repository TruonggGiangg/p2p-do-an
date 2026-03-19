# 📐 P2P Fintech — Design System & UI Standards

> **Bản thiết kế quy chuẩn giao diện** cho toàn bộ ứng dụng P2P Fintech Mobile.
> Mọi component, screen, và feature mới **BẮT BUỘC** tuân thủ tài liệu này.

---

## 1. 🎨 Hệ Màu (Color System)

### Brand Identity
- **Primary**: `#CDEA2D` (Lime Green) — CTA, active states, accent
- **Accent**: `#14342B` (Dark Teal) — headers, card backgrounds, branding

### Dark Mode

| Token | Hex | Sử dụng |
|---|---|---|
| `background` | `#0B1A14` | Nền chính |
| `backgroundSecondary` | `#14261E` | Nền card, tab bar |
| `backgroundTertiary` | `#1A3028` | Nền segmented tabs |
| `surface` | `#1A3028` | Card, dialog |
| `surfaceLight` | `#1E3D30` | Search bar, avatar bg |
| `textPrimary` | `#EAECEF` | Text chính |
| `textSecondary` | `#7A8A82` | Text phụ, subtitle |
| `textMuted` | `#5A6B62` | Placeholder, hint |
| `textDim` | `#3D4F46` | Disabled, icon nhạt |
| `border` | `#1E3D30` | Viền card, divider |

### Light Mode

| Token | Hex | Sử dụng |
|---|---|---|
| `background` | `#F5F5F0` | Nền chính |
| `backgroundSecondary` | `#FFFFFF` | Nền card, tab bar |
| `backgroundTertiary` | `#EAEBE6` | Nền segmented tabs |
| `surface` | `#FFFFFF` | Card, dialog |
| `surfaceLight` | `#F8F8F4` | Search bar, avatar bg |
| `textPrimary` | `#111111` | Text chính |
| `textSecondary` | `#374151` | Text phụ, subtitle |
| `textMuted` | `#6B7280` | Placeholder, hint |
| `textDim` | `#9CA3AF` | Disabled, icon nhạt |
| `border` | `#E8E8E4` | Viền card, divider |

### Semantic Colors

| Token | Hex | Sử dụng |
|---|---|---|
| `success` | `#0ECB81` | Giao dịch thành công, active status |
| `error` | `#F6465D` | Lỗi, validation, locked |
| `warning` | `#F0B90B` | Cảnh báo, pending |
| `primary` | `#CDEA2D` | CTA buttons, active tab |

> [!IMPORTANT]
> **KHÔNG sử dụng màu hardcode** trong component. Luôn dùng `theme.colors.xxx` thông qua `useTheme()` hook.

### Quy tắc Glass Effect

| Token | Dark | Light |
|---|---|---|
| `primaryGlass` | `rgba(205,234,45, 0.12)` | `rgba(205,234,45, 0.15)` |
| `successGlass` | `rgba(14,203,129, 0.12)` | `rgba(14,203,129, 0.1)` |
| `errorGlass` | `rgba(246,70,93, 0.12)` | `rgba(246,70,93, 0.1)` |
| `warningGlass` | `rgba(240,185,11, 0.12)` | `rgba(240,185,11, 0.1)` |

---

## 2. 📝 Typography

### Font Family
Sử dụng **Poppins** từ Google Fonts:

| Weight | Family Name | Sử dụng |
|---|---|---|
| 400 | `Poppins_400Regular` | Body text, input value |
| 500 | `Poppins_500Medium` | Floating label |
| 600 | `Poppins_600SemiBold` | Label, tab text, subtitle, button |
| 700 | `Poppins_700Bold` | Balance, heading nhỏ, active tab |
| 800 | `800` (system) | Section title, greeting name |

### Font Size Scale

| Level | Size | Weight | Dùng cho |
|---|---|---|---|
| **H1** | `26px` | `800` | Greeting name (HomeScreen) |
| **H2** | `20px` | `800` | Section title ("Dịch vụ", "Tiện ích") |
| **H3** | `18px` | `Poppins_600SemiBold` | Screen title (header) |
| **H4** | `16px` | `800` | Banner title, balance |
| **Body** | `14px` | `Poppins_400Regular` | Input text, card description |
| **Caption** | `13px` | `Poppins_600SemiBold` | Input label, greeting text |
| **Small** | `12px` | `Poppins_400Regular` | Search text, error, banner CTA |
| **Tiny** | `11px` | `600` | Quick action label, service label, tab label |
| **Micro** | `10px` | `Poppins_600SemiBold` | Badge text, status |
| **Nano** | `9px` | `700` | Default badge, extra small labels |

> [!CAUTION]
> **KHÔNG** dùng font size nhỏ hơn `9px`. Không dùng font system cho text hiển thị — chỉ cho heading weight `800`.

---

## 3. 📐 Spacing & Layout

### Spacing Token

| Token | Value | Dùng cho |
|---|---|---|
| `xs` | `4px` | Micro gaps |
| `sm` | `8px` | Icon gap, small padding |
| `md` | `16px` | Section padding, input padding |
| `lg` | `24px` | Section margin, card padding |
| `xl` | `32px` | Large section gaps |

### Screen Layout Rule

```
┌─────────────────────────────┐
│ BinanceHeader (paddingH:16) │  ← pinned top, z-index: 1000
├─────────────────────────────┤
│ FintechPullToRefresh        │
│  ┌───────────────────────┐  │
│  │ Content (paddingH:16) │  │  ← standard horizontal padding
│  │  ┌─────────────────┐  │  │
│  │  │ Card (radius:20) │  │  │  ← cards always inside sections
│  │  └─────────────────┘  │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│ Bottom Tab Bar              │  ← height: iOS 60+bottom, Android 70
└─────────────────────────────┘
```

### Quy tắc padding/margin

| Vị trí | Giá trị | Ghi chú |
|---|---|---|
| Screen horizontal padding | `16px` | Qua `paddingHorizontal: 16` |
| Card padding | `20px` | Default `CommonCard` |
| Section spacing (marginTop) | `28px` | Giữa các section |
| Card borderRadius | `20px` | Standard cho tất cả card |
| Input borderRadius | `14px` | Standard cho input, button |
| Content paddingBottom | `tabBarHeight + 32` | Tránh content bị tab bar che |

---

## 4. 🔲 Border Radius

| Token | Value | Dùng cho |
|---|---|---|
| `sm` | `8px` | Segmented tab, small tag |
| `md` | `14px` | Button, input, badge |
| `lg` | `20px` | Card content, service card |
| `xl` | `24px` | Wallet card (front/back face) |
| `xxl` | `28px` | Special hero elements |
| `full` | `9999px` | Avatar, circular icon |

---

## 5. 🌑 Shadow System

### Dark Mode

```typescript
card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
}
```

### Light Mode

```typescript
card: {
    shadowColor: '#14342B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
}
```

> [!WARNING]
> **Android**: `elevation` > 10 gây lỗi rendering khi kết hợp `overflow: 'hidden'`. Giới hạn `elevation: 8` cho card có border radius.

---

## 6. 🧩 Component Standards

### CommonButton

| Prop | Giá trị | Mặc định |
|---|---|---|
| `variant` | `primary`, `secondary`, `outline`, `ghost`, `danger`, `success` | `primary` |
| `size` | `sm` (32px), `md` (48px), `lg` (56px) | `md` |
| `fullWidth` | `boolean` | `true` |
| `icon` | MaterialCommunityIcons name | — |
| `loading` | `boolean` | `false` |

```tsx
//  Đúng
<CommonButton title="Xác nhận" variant="primary" size="lg" />
<CommonButton title="Hủy" variant="outline" />

// ❌ Sai — Không tự tạo button bằng TouchableOpacity
<TouchableOpacity style={{backgroundColor: '#CDEA2D'}}>
    <Text>Submit</Text>
</TouchableOpacity>
```

---

### CommonInput

| Prop | Mô tả |
|---|---|
| `label` | Label text hiện bên trên |
| `icon` | Icon bên trái (MCIcons name) |
| `error` | Error message (hiện đỏ bên dưới) |
| `secureTextEntry` | Auto hiện eye toggle |

**Focus States:**
- Border: `#CDEA2D` (primary)
- Background: `surfaceLight`
- Icon color: `#CDEA2D`

---

### FloatingLabelInput

Cho form phức tạp (đăng nhập, đăng ký, KYC). Label tự động float lên trên khi focus/có value.

---

### CommonCard

| Prop | Giá trị | Mặc định |
|---|---|---|
| `variant` | `default`, `surface`, `outline` | `default` |
| `padding` | number | `20` |
| `onPress` | Nếu có → Tự wrap `TouchableOpacity` | — |

---

### CommonTabs

| Prop | Giá trị | Mặc định |
|---|---|---|
| `variant` | `segmented`, `underline` | `segmented` |
| `tabs` | `[{key, title}]` | — |

---

### CommonBadge

| Variant | Dùng cho |
|---|---|
| `success` | Trạng thái Active, Approved |
| `error` | Locked, Rejected |
| `warning` | Pending, Processing |
| `info` | Neutral info |
| `primary` | Highlighted feature |
| `muted` | Disabled, archived |

---

### BinanceHeader

| Mode | Hiển thị |
|---|---|
| `dashboard` | Avatar + Search bar + Bell + Theme toggle + Headset |
| `standard` | Back arrow + Title + Theme toggle + Menu |

```tsx
// Trang chủ
<BinanceHeader mode="dashboard" onAvatarPress={fn} />

// Trang con
<BinanceHeader title="Chi tiết vay" />
```

> [!IMPORTANT]
> **Mọi screen** phải dùng `BinanceHeader` — KHÔNG tự tạo header riêng.

---

### FintechPullToRefresh

Wrapper ScrollView với Vento loading indicator. **Bắt buộc** dùng cho mọi screen có nội dung cuộn.

```tsx
<FintechPullToRefresh
    onRefresh={onRefresh}
    refreshing={refreshing}
    primaryColor={c.primary}
    glowColor={c.primaryLight}
    contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
>
    {/* Content */}
</FintechPullToRefresh>
```

---

### FintechScreenSkeleton

Skeleton loading cho lúc fetch dữ liệu lần đầu. Variant: `home`, `profile`, default.

```tsx
{loading ? <FintechScreenSkeleton variant="home" /> : /* content */}
```

---

### FloatingActionButton

FAB cố định góc phải dưới. Dùng cho action chính (tạo mới, scan QR...).

```tsx
<FloatingActionButton
    icon="plus"
    backgroundColor="#CDEA2D"
    iconColor="#14342B"
    onPress={handleCreate}
/>
```

---

## 7. 🗂️ Grid Layout Rules

### Service Grid (3 cột)

```tsx
// Container
servicesCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 0,
}

// Item wrapper — PHẢI đặt width trên outermost View
serviceItemWrap: { width: '33.33%' }

// Item content
serviceItem: { alignItems: 'center' }
```

> [!CAUTION]
> **Khi dùng `flexWrap`**, width `%` phải đặt trên **View ngoài cùng** (direct child của flex container). Nếu wrap bằng `Animated.View`, đặt width trên `Animated.View`, KHÔNG phải inner element.

### Quick Actions (Horizontal row)

```tsx
quickActionsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
}
```

---

## 8. 🧭 Navigation Standards

### Bottom Tab Bar

| Tab | Screen | Icon (focused/unfocused) | Label |
|---|---|---|---|
| Home | HomeScreen | `home`/`home-outline` | Trang chủ |
| Loan | LoanScreen | `wallet`/`wallet-outline` | Vay vốn |
| BNPL | BNPLScreen | `card`/`card-outline` | Trả góp |
| Profile | ProfileScreen | `person`/`person-outline` | Tài khoản |

**Tab Bar Style:**
- Active color: `theme.colors.primary` (#CDEA2D)
- Inactive color: Dark `#848E9C` / Light `#474D57`
- Font: `Poppins_600SemiBold`, size `11px`
- Background: `theme.colors.backgroundSecondary`
- No border top (`borderTopWidth: 0`)

### PIN-Protected Screens

Screens cần bảo mật sử dụng `withPinGate()` HOC:
- LoanScreen → `PinGatedLoanScreen`
- BNPLScreen → `PinGatedBNPLScreen`

---

## 9. 📱 Platform-Specific Rules

### Android

| Vấn đề | Quy tắc |
|---|---|
| Shadow | Dùng `elevation` (max 8 cho card có radius) + `shadowColor` |
| `backfaceVisibility` | **KHÔNG dùng** trong Reanimated. Thay bằng opacity crossfade |
| Percentage width | Dùng `'33.33%'` string, KHÔNG dùng computed px cho grid |
| `overflow: 'hidden'` | Tránh kết hợp với `elevation > 8` |
| StatusBar | `Math.max(stableTop, StatusBar.currentHeight \|\| 24)` |

### iOS

| Vấn đề | Quy tắc |
|---|---|
| Shadow | Dùng `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius` |
| Safe Area | `useSafeAreaInsets()` cho header padding và bottom tab |
| Header padding | `insets.top` (typically 50px) |

---

## 10. 🎬 Animation Standards

### Entry Animations (Reanimated)

| Animation | Delay Pattern | Duration | Dùng cho |
|---|---|---|---|
| `FadeInDown` | 0ms | 600ms | Greeting, section title |
| `FadeInDown` | 200ms | 700ms | Card carousel |
| `FadeInDown` | 400 + idx × 60ms | 500ms | Service grid items |
| `FadeInDown` | 400 + idx × 80ms | 500ms | Quick actions |

### Card Flip (FlippableCard)

```typescript
// Spring config
{ damping: 18, stiffness: 85, mass: 0.8, overshootClamping: false }

// Front opacity: 1 → 0 at midpoint
interpolate(value, [0, 0.4, 0.5, 1], [1, 1, 0, 0])

// Back opacity: 0 → 1 at midpoint
interpolate(value, [0, 0.5, 0.6, 1], [0, 0, 1, 1])

// Scale dip at midpoint
interpolate(value, [0, 0.5, 1], [1, 0.92, 1])
```

### Haptic Feedback

| Action | Feedback Level |
|---|---|
| Button press | `ImpactFeedbackStyle.Light` |
| Card flip | `ImpactFeedbackStyle.Medium` |
| Card swipe snap | `ImpactFeedbackStyle.Light` |

---

## 11. 📋 Checklist — Trước khi merge

- [ ] Sử dụng `useTheme()` cho mọi màu sắc
- [ ] Dùng `BinanceHeader` cho header
- [ ] Dùng `FintechPullToRefresh` cho scroll screens
- [ ] Dùng `CommonButton/CommonInput/CommonCard` — không tự tạo
- [ ] Test trên cả Dark và Light mode
- [ ] Test trên Android (elevation, percentage width, haptics)
- [ ] Font chỉ dùng Poppins family
- [ ] Spacing tuân theo token system (xs/sm/md/lg/xl)
- [ ] Animation có delay stagger hợp lý
- [ ] `paddingBottom` đủ cho tab bar

---

## 12. 📁 Cấu trúc thư mục

```
src/
├── components/              # Shared components
│   ├── common/              # Base UI components
│   │   ├── CommonButton     # Button variants
│   │   ├── CommonCard       # Card container
│   │   ├── CommonInput      # Text input
│   │   ├── CommonTabs       # Tab navigation
│   │   ├── CommonBadge      # Status badges
│   │   ├── AnimatedCard     # Animated card wrapper
│   │   ├── FloatingActionButton
│   │   ├── FintechPullToRefresh
│   │   ├── FintechScreenSkeleton
│   │   ├── VentoSVGLoading  # Brand loading indicator
│   │   ├── OTPVerifyModal
│   │   ├── PinVerifyModal
│   │   └── ImagePickerSheet
│   ├── BinanceHeader        # App header (dashboard/standard)
│   ├── FloatingLabelInput   # Floating label form input
│   ├── WalletCard           # Wallet display card
│   ├── QRCodeDisplay        # QR rendering
│   ├── QRScanner            # Camera QR scanner
│   └── index.ts             # Public exports
├── theme/
│   ├── themes.ts            # Color tokens, spacing, radius, shadows
│   └── index.ts             # Re-exports + legacy compat
├── features/                # Feature modules
│   ├── home/
│   ├── loan/
│   ├── bnpl/
│   ├── wallet/
│   ├── kyc/
│   ├── profile/
│   ├── notifications/
│   └── auth/
└── navigation/
    ├── RootNavigator        # Auth/Main switch
    ├── AuthNavigator        # Login/Register flow
    └── MainNavigator        # Bottom tabs + PIN gate
```

> [!TIP]
> Khi tạo component mới, đặt trong `components/common/` nếu dùng chung, hoặc trong `features/<module>/components/` nếu chỉ dùng cho feature đó. **Luôn export** qua `index.ts`.
