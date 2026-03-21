import React from 'react';
import { Typography, Button, Tag, Space } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  FileAddOutlined,
  DownloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useTheme } from '../App';

const { Title, Text } = Typography;

/* ── Mock Data ─────────────────────────────────────────── */
const disbursementData = [
  { date: '16/03', amount: 180 },
  { date: '17/03', amount: 220 },
  { date: '18/03', amount: 150 },
  { date: '19/03', amount: 310 },
  { date: '20/03', amount: 250 },
  { date: '21/03', amount: 190 },
  { date: '22/03', amount: 125 },
];

const productDistData = [
  { name: 'Vay sinh viên', value: 45, color: '#4d8eff' },
  { name: 'Vay tiêu dùng', value: 30, color: '#06b6d4' },
  { name: 'Vay kinh doanh', value: 25, color: '#a855f7' },
];

interface ActivityRow {
  time: string;
  activity: string;
  customer: string;
  amount: string;
  status: 'approved' | 'pending' | 'rejected';
}

const recentActivities: ActivityRow[] = [
  { time: '14:32', activity: 'Phê duyệt khoản vay', customer: 'Nguyễn Văn An', amount: '₫45,000,000', status: 'approved' },
  { time: '13:15', activity: 'Yêu cầu giải ngân', customer: 'Lê Thị Bình', amount: '₫120,000,000', status: 'pending' },
  { time: '12:08', activity: 'Từ chối khoản vay', customer: 'Trần Minh Đức', amount: '₫30,000,000', status: 'rejected' },
  { time: '11:45', activity: 'KYC được duyệt', customer: 'Phạm Thanh Hà', amount: '₫80,000,000', status: 'approved' },
  { time: '10:20', activity: 'Yêu cầu hỗ trợ nợ', customer: 'Hoàng Văn Khoa', amount: '₫55,000,000', status: 'pending' },
];

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: 'Đã duyệt', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  pending: { label: 'Chờ xử lý', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  rejected: { label: 'Từ chối', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

/* ── KPI Card ──────────────────────────────────────────── */
interface KpiProps {
  title: string;
  value: string;
  badge: string;
  badgeColor: string;
  subtitle: string;
  children?: React.ReactNode;
  isDarkMode: boolean;
}

function KpiCard({ title, value, badge, badgeColor, subtitle, children, isDarkMode }: KpiProps) {
  const cardBg = isDarkMode ? '#191f31' : '#FFFFFF';
  const borderColor = isDarkMode ? 'rgba(66, 71, 84, 0.15)' : '#E2E8F0';
  const subtitleColor = isDarkMode ? '#8c909f' : '#64748b';

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: cardBg,
      borderRadius: 12,
      padding: '22px 24px',
      border: `1px solid ${borderColor}`,
      transition: 'all 0.3s ease',
      cursor: 'default',
    }}>
      <Text style={{ fontSize: 12, color: subtitleColor, fontWeight: 500, letterSpacing: '0.02em' }}>
        {title}
      </Text>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <span style={{
          fontSize: 28, fontWeight: 800,
          color: isDarkMode ? '#dce1fb' : '#0f172a',
          fontFamily: "'Manrope', var(--font-sans)",
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          {value}
        </span>
        <Tag
          color={badgeColor === 'green' ? undefined : undefined}
          style={{
            background: badgeColor === 'green' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            color: badgeColor === 'green' ? '#10b981' : '#f59e0b',
            border: 'none',
            fontWeight: 600,
            fontSize: 11,
            padding: '1px 8px',
            borderRadius: 20,
          }}
        >
          {badge.startsWith('+') || badge.startsWith('-') ? (
            <>
              {badge.startsWith('+') ? <ArrowUpOutlined style={{ fontSize: 9, marginRight: 2 }} /> : <ArrowDownOutlined style={{ fontSize: 9, marginRight: 2 }} />}
              {badge}
            </>
          ) : badge}
        </Tag>
      </div>
      <div style={{ margin: '12px 0 4px' }}>
        {children}
      </div>
      <Text style={{ fontSize: 11, color: subtitleColor }}>
        {subtitle}
      </Text>
    </div>
  );
}

/* ── Dashboard Page ────────────────────────────────────── */
export default function DashboardPage() {
  const { isDarkMode } = useTheme();

  const baseBg = isDarkMode ? '#0c1324' : '#F1F5F9';
  const cardBg = isDarkMode ? '#191f31' : '#FFFFFF';
  const borderColor = isDarkMode ? 'rgba(66, 71, 84, 0.15)' : '#E2E8F0';
  const headingColor = isDarkMode ? '#dce1fb' : '#0f172a';
  const mutedColor = isDarkMode ? '#8c909f' : '#64748b';
  const gridColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';

  return (
    <div style={{ margin: -32, padding: 28, background: baseBg, minHeight: 'calc(100vh - 152px)' }}>
      {/* ── Top Greeting ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <Title level={3} style={{
            margin: 0, fontWeight: 700, fontSize: 22,
            color: headingColor,
            fontFamily: "'Manrope', var(--font-sans)",
          }}>
            Xin chào, {(() => { try { return JSON.parse(localStorage.getItem('admin_user') || '{}').username || 'Admin'; } catch { return 'Admin'; } })()} 👋
          </Title>
          <Text style={{ color: mutedColor, fontSize: 13, marginTop: 2, display: 'block' }}>
            22/03/2026 · Tổng quan hoạt động hệ thống
          </Text>
        </div>
        <Space size="small">
          <Button
            icon={<DownloadOutlined />}
            style={{
              background: isDarkMode ? '#2e3447' : '#E2E8F0',
              color: isDarkMode ? '#dce1fb' : '#475569',
              border: 'none',
              fontWeight: 500,
              borderRadius: 8,
              height: 38,
            }}
          >
            Xuất báo cáo
          </Button>
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            style={{
              background: '#4d8eff',
              border: 'none',
              fontWeight: 600,
              borderRadius: 8,
              height: 38,
              boxShadow: '0 4px 14px rgba(77, 142, 255, 0.35)',
            }}
          >
            Tạo khoản vay
          </Button>
        </Space>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <KpiCard
          title="Tổng khoản vay"
          value="₫2.45B"
          badge="+12.5%"
          badgeColor="green"
          subtitle="215 khoản đang hoạt động"
          isDarkMode={isDarkMode}
        >
          <div style={{ height: 36 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[{ v: 22 }, { v: 28 }, { v: 25 }, { v: 35 }, { v: 30 }, { v: 38 }, { v: 42 }]}>
                <defs>
                  <linearGradient id="sparkGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} fill="url(#sparkGreen)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </KpiCard>

        <KpiCard
          title="Tỷ lệ nợ xấu"
          value="3.2%"
          badge="-0.8%"
          badgeColor="green"
          subtitle="So với tháng trước"
          isDarkMode={isDarkMode}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke={isDarkMode ? '#2e3447' : '#e2e8f0'} strokeWidth="5" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke="#10b981" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${(1 - 0.032) * 125.6} 125.6`}
                transform="rotate(-90 24 24)"
              />
              <text x="24" y="27" textAnchor="middle" fontSize="10" fontWeight="700" fill={isDarkMode ? '#dce1fb' : '#0f172a'}>3.2%</text>
            </svg>
          </div>
        </KpiCard>

        <KpiCard
          title="Tiền giải ngân hôm nay"
          value="₫125M"
          badge="8 khoản"
          badgeColor="orange"
          subtitle="Tổng giải ngân tháng: ₫1.8B"
          isDarkMode={isDarkMode}
        >
          <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', gap: 3, paddingBottom: 2 }}>
            {[60, 80, 45, 90, 70, 55, 100].map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  background: i === 6
                    ? 'linear-gradient(180deg, #4d8eff 0%, rgba(77,142,255,0.3) 100%)'
                    : isDarkMode ? '#2e3447' : '#cbd5e1',
                  borderRadius: 3,
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </KpiCard>

        <KpiCard
          title="Chờ phê duyệt"
          value="24"
          badge="Ưu tiên cao"
          badgeColor="orange"
          subtitle="12 khoản ưu tiên cao"
          isDarkMode={isDarkMode}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#f59e0b',
              display: 'inline-block',
              boxShadow: '0 0 6px rgba(245,158,11,0.5)',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>Cần xử lý ngay</Text>
          </div>
        </KpiCard>
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {/* Disbursement chart */}
        <div style={{
          flex: 3,
          background: cardBg,
          borderRadius: 12,
          padding: '20px 24px',
          border: `1px solid ${borderColor}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text strong style={{ fontSize: 15, color: headingColor, fontFamily: "'Manrope', var(--font-sans)" }}>
              Biểu đồ giải ngân
            </Text>
            <Space size="small">
              {['7 ngày', '30 ngày', '3 tháng'].map((lbl, i) => (
                <Button
                  key={lbl}
                  size="small"
                  type={i === 0 ? 'primary' : 'text'}
                  style={{
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    height: 28,
                    ...(i === 0
                      ? { background: '#4d8eff', border: 'none', boxShadow: '0 2px 8px rgba(77,142,255,0.3)' }
                      : { color: mutedColor }),
                  }}
                >
                  {lbl}
                </Button>
              ))}
            </Space>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={disbursementData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4d8eff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4d8eff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="date" axisLine={false} tickLine={false}
                tick={{ fill: mutedColor, fontSize: 11 }}
              />
              <YAxis
                axisLine={false} tickLine={false}
                tick={{ fill: mutedColor, fontSize: 11 }}
                tickFormatter={(v: number) => `${v}M`}
              />
              <RechartsTooltip
                contentStyle={{
                  background: isDarkMode ? '#23293c' : '#fff',
                  border: `1px solid ${borderColor}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: headingColor,
                }}
                formatter={(value: any) => [`₫${value}M`, 'Giải ngân']}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#4d8eff"
                strokeWidth={2.5}
                fill="url(#gradBlue)"
                dot={{ r: 4, fill: '#4d8eff', stroke: cardBg, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#4d8eff', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Donut chart */}
        <div style={{
          flex: 2,
          background: cardBg,
          borderRadius: 12,
          padding: '20px 24px',
          border: `1px solid ${borderColor}`,
        }}>
          <Text strong style={{ fontSize: 15, color: headingColor, fontFamily: "'Manrope', var(--font-sans)", display: 'block', marginBottom: 8 }}>
            Phân bổ sản phẩm vay
          </Text>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={productDistData}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                dataKey="value"
                paddingAngle={3}
                strokeWidth={0}
              >
                {productDistData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value: string) => (
                  <span style={{ color: mutedColor, fontSize: 11, fontWeight: 500 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {productDistData.map(item => (
              <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                  <Text style={{ fontSize: 12, color: mutedColor }}>{item.name}</Text>
                </div>
                <Text strong style={{ fontSize: 12, color: headingColor }}>{item.value}%</Text>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Activities ── */}
      <div style={{
        background: cardBg,
        borderRadius: 12,
        padding: '20px 24px',
        border: `1px solid ${borderColor}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text strong style={{ fontSize: 15, color: headingColor, fontFamily: "'Manrope', var(--font-sans)" }}>
            Hoạt động gần đây
          </Text>
          <Button type="link" size="small" style={{ fontSize: 12, color: '#4d8eff', fontWeight: 500, padding: 0 }}>
            Xem tất cả <RightOutlined style={{ fontSize: 10 }} />
          </Button>
        </div>

        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 1fr 130px 110px',
          gap: 12,
          padding: '10px 16px',
          background: isDarkMode ? '#151b2d' : '#f8fafc',
          borderRadius: 8,
          marginBottom: 4,
        }}>
          {['Thời gian', 'Hoạt động', 'Khách hàng', 'Số tiền', 'Trạng thái'].map(h => (
            <Text key={h} style={{
              fontSize: 10.5, fontWeight: 700,
              color: mutedColor,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {h}
            </Text>
          ))}
        </div>

        {/* Rows */}
        {recentActivities.map((row, i) => {
          const st = statusConfig[row.status];
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 1fr 130px 110px',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 8,
                transition: 'background 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isDarkMode ? '#1e2536' : '#f1f5f9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <Text style={{ fontSize: 12, color: mutedColor, fontWeight: 500 }}>{row.time}</Text>
              <Text style={{ fontSize: 12, color: headingColor, fontWeight: 500 }}>{row.activity}</Text>
              <Text style={{ fontSize: 12, color: headingColor }}>{row.customer}</Text>
              <Text style={{ fontSize: 12, color: headingColor, fontWeight: 600, fontFamily: "'Manrope', var(--font-sans)" }}>{row.amount}</Text>
              <Tag style={{
                background: st.bg,
                color: st.color,
                border: 'none',
                borderRadius: 20,
                fontWeight: 600,
                fontSize: 11,
                padding: '1px 10px',
                width: 'fit-content',
              }}>
                {st.label}
              </Tag>
            </div>
          );
        })}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
