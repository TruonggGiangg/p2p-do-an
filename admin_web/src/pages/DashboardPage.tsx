import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Button, Tag, Space, Spin, message } from 'antd';
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
import { adminApi } from '../api/admin';

const { Title, Text } = Typography;

/* ── Helpers ───────────────────────────────────────────── */
const PIE_COLORS = ['#4d8eff', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ef4444'];

const formatVndShort = (n: number): string => {
  if (n == null || isNaN(n)) return '₫0';
  if (n >= 1_000_000_000) return `₫${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₫${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `₫${(n / 1_000).toFixed(0)}K`;
  return `₫${n}`;
};

const formatVndFull = (n: number): string =>
  '₫' + (n ?? 0).toLocaleString('vi-VN');

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

  const [overview, setOverview] = useState<Awaited<ReturnType<typeof adminApi.getDashboardOverview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '30' | '90'>('7');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await adminApi.getDashboardOverview();
        if (!cancelled) setOverview(data);
      } catch (e: any) {
        message.error(e?.response?.data?.message || 'Không tải được số liệu Dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const disbursementData = useMemo(() => {
    if (!overview) return [] as Array<{ date: string; amount: number }>;
    if (period === '7') return overview.disbursementSeries.d7;
    if (period === '30') return overview.disbursementSeries.d30;
    return overview.disbursementSeries.d90;
  }, [overview, period]);

  const productDistData = useMemo(() => {
    if (!overview) return [] as Array<{ name: string; value: number; color: string }>;
    return overview.productDistribution.map((p, i) => ({
      name: p.name,
      value: p.percent,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [overview]);

  const recentActivities = overview?.recentActivities ?? [];

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
      <Spin spinning={loading} tip="Đang tải số liệu...">
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <KpiCard
          title="Tổng giải ngân"
          value={formatVndShort(overview?.kpi.totalDisbursedAmount ?? 0)}
          badge={`${(overview?.kpi.totalDisbursedTrend ?? 0) >= 0 ? '+' : ''}${(overview?.kpi.totalDisbursedTrend ?? 0).toFixed(1)}%`}
          badgeColor={(overview?.kpi.totalDisbursedTrend ?? 0) >= 0 ? 'green' : 'orange'}
          subtitle={`${overview?.kpi.activeLoansCount ?? 0} khoản đang hoạt động`}
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
          value={`${((overview?.kpi.nplRate ?? 0) * 100).toFixed(1)}%`}
          badge={`${(overview?.kpi.nplTrend ?? 0) >= 0 ? '+' : ''}${(overview?.kpi.nplTrend ?? 0).toFixed(1)}%`}
          badgeColor={(overview?.kpi.nplTrend ?? 0) <= 0 ? 'green' : 'orange'}
          subtitle="So với tháng trước"
          isDarkMode={isDarkMode}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {(() => {
              const npl = overview?.kpi.nplRate ?? 0;
              const dash = (1 - npl) * 125.6;
              return (
                <svg width="48" height="48" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke={isDarkMode ? '#2e3447' : '#e2e8f0'} strokeWidth="5" />
                  <circle
                    cx="24" cy="24" r="20" fill="none"
                    stroke={npl > 0.05 ? '#ef4444' : '#10b981'} strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${dash} 125.6`}
                    transform="rotate(-90 24 24)"
                  />
                  <text x="24" y="27" textAnchor="middle" fontSize="10" fontWeight="700" fill={isDarkMode ? '#dce1fb' : '#0f172a'}>
                    {(npl * 100).toFixed(1)}%
                  </text>
                </svg>
              );
            })()}
          </div>
        </KpiCard>

        <KpiCard
          title="Tiền giải ngân hôm nay"
          value={formatVndShort(overview?.kpi.disbursedToday ?? 0)}
          badge={`${overview?.kpi.disbursedTodayCount ?? 0} khoản`}
          badgeColor="orange"
          subtitle={`Tổng giải ngân tháng: ${formatVndShort(overview?.kpi.disbursedThisMonth ?? 0)}`}
          isDarkMode={isDarkMode}
        >
          <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', gap: 3, paddingBottom: 2 }}>
            {(() => {
              const last7 = overview?.disbursementSeries.d7 ?? [];
              const max = Math.max(1, ...last7.map((d) => d.amount));
              return last7.map((d, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(6, (d.amount / max) * 100)}%`,
                    background: i === last7.length - 1
                      ? 'linear-gradient(180deg, #4d8eff 0%, rgba(77,142,255,0.3) 100%)'
                      : isDarkMode ? '#2e3447' : '#cbd5e1',
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                  }}
                />
              ));
            })()}
          </div>
        </KpiCard>

        <KpiCard
          title="Chờ phê duyệt"
          value={String(overview?.kpi.pendingApprovals ?? 0)}
          badge={(overview?.kpi.pendingPriorityCount ?? 0) > 0 ? 'Ưu tiên cao' : 'Bình thường'}
          badgeColor={(overview?.kpi.pendingPriorityCount ?? 0) > 0 ? 'orange' : 'green'}
          subtitle={`${overview?.kpi.pendingPriorityCount ?? 0} khoản chờ > 7 ngày`}
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
              {(['7', '30', '90'] as const).map((key) => {
                const lbl = key === '7' ? '7 ngày' : key === '30' ? '30 ngày' : '3 tháng';
                const isActive = period === key;
                return (
                  <Button
                    key={key}
                    size="small"
                    type={isActive ? 'primary' : 'text'}
                    onClick={() => setPeriod(key)}
                    style={{
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      height: 28,
                      ...(isActive
                        ? { background: '#4d8eff', border: 'none', boxShadow: '0 2px 8px rgba(77,142,255,0.3)' }
                        : { color: mutedColor }),
                    }}
                  >
                    {lbl}
                  </Button>
                );
              })}
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
              <Text style={{ fontSize: 12, color: headingColor, fontWeight: 600, fontFamily: "'Manrope', var(--font-sans)" }}>{formatVndFull(row.amount)}</Text>
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
      </Spin>

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
