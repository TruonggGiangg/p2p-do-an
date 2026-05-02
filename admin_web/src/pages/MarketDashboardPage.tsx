import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Tag, Input, Button, Tooltip, Pagination, Empty, Tabs } from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  RiseOutlined,
  FallOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  LockOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  BarChartOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTheme } from '../App';
import {
  marketApi,
  type MarketStats,
  type MarketAsk,
  type MarketBid,
  type MarketTapeEntry,
  type MatchedAsk,
  type MatchedBid,
  type PaginationMeta,
  type MarketQueryParams,
} from '../api/market';

const { Text } = Typography;

/* ── Font & Color tokens ─────────────────────────────── */

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

// Accent colors (Emerald/Binance inspired)
const ACCENT = {
  ask: { dark: '#ff4d4f', light: '#f5222d', bg: 'rgba(255, 77, 79, 0.1)' },   // red
  bid: { dark: '#00cc88', light: '#00a870', bg: 'rgba(0, 204, 136, 0.1)' },   // green
  primary: { dark: '#4488ff', light: '#1890ff', bg: 'rgba(68, 136, 255, 0.1)' }, // blue
};

/* ── Utilities ──────────────────────────────────────── */

function fmtNum(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function fmtCompact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} tỷ`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} tr`;
  return fmtNum(value);
}

function fmtTime(dateStr: string): string {
  if (!dateStr) return '--:--';
  const val = new Date(dateStr);
  if (isNaN(val.getTime())) return '--:--';
  return val.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/* ── Sort Header ────────────────────────────────────── */

function SortHeader({ label, field, params, onChange, style }: {
  label: string; field: string; params: MarketQueryParams;
  onChange: (p: MarketQueryParams) => void; style?: React.CSSProperties;
}) {
  const isActive = params.sortBy === field;
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', fontFamily: FONT, ...style }}
      onClick={() => {
        const newOrder = isActive && params.order === 'asc' ? 'desc' : 'asc';
        onChange({ ...params, sortBy: field, order: newOrder, page: 1 });
      }}
    >
      <span>{label}</span>
      {isActive && (params.order === 'asc'
        ? <SortAscendingOutlined style={{ fontSize: 10, color: ACCENT.primary.dark }} />
        : <SortDescendingOutlined style={{ fontSize: 10, color: ACCENT.primary.dark }} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                    */
/* ═══════════════════════════════════════════════════ */

export default function MarketDashboardPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  // ── Colors ──
  const baseBg = isDarkMode ? '#0c1324' : '#F1F5F9';
  const cardBg = isDarkMode ? '#191f31' : '#FFFFFF';
  const borderColor = isDarkMode ? 'rgba(66, 71, 84, 0.15)' : '#E2E8F0';
  const headingColor = isDarkMode ? '#dce1fb' : '#0f172a';
  const mutedColor = isDarkMode ? '#8c909f' : '#64748b';
  const hoverBg = isDarkMode ? '#1e2536' : '#f1f5f9';

  // ── State ──
  const [activeTab, setActiveTab] = useState('market');
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Live panels
  const [liveAsks, setLiveAsks] = useState<{ asks: MarketAsk[]; pagination?: PaginationMeta }>({ asks: [] });
  const [liveBids, setLiveBids] = useState<{ bids: MarketBid[]; pagination?: PaginationMeta }>({ bids: [] });
  const [liveTape, setLiveTape] = useState<{ tape: MarketTapeEntry[]; pagination?: PaginationMeta }>({ tape: [] });
  const [liveAsksParams, setLiveAsksParams] = useState<MarketQueryParams>({ page: 1, pageSize: 10, sortBy: 'createdAt', order: 'desc' });
  const [liveBidsParams, setLiveBidsParams] = useState<MarketQueryParams>({ page: 1, pageSize: 10, sortBy: 'createdAt', order: 'desc' });
  const [liveTapeParams, setLiveTapeParams] = useState<MarketQueryParams>({ page: 1, pageSize: 10, sortBy: 'updatedAt', order: 'desc' });

  // Matched tabs
  const [matchedAsks, setMatchedAsks] = useState<{ asks: MatchedAsk[]; pagination?: PaginationMeta }>({ asks: [] });
  const [matchedBids, setMatchedBids] = useState<{ bids: MatchedBid[]; pagination?: PaginationMeta }>({ bids: [] });
  const [matchedAsksParams, setMatchedAsksParams] = useState<MarketQueryParams>({ page: 1, pageSize: 10, sortBy: 'updatedAt', order: 'desc' });
  const [matchedBidsParams, setMatchedBidsParams] = useState<MarketQueryParams>({ page: 1, pageSize: 10, sortBy: 'updatedAt', order: 'desc' });

  // ── Fetch ──
  const fetchStats = useCallback(async () => {
    try { const s = await marketApi.getStats(); setStats(s); } catch (e) { console.error('[Market] stats error', e); }
  }, []);

  const fetchLiveAsks = useCallback(async () => {
    try { const d = await marketApi.getAsks(liveAsksParams); setLiveAsks(d); } catch (e) { console.error('[Market] asks error', e); }
  }, [liveAsksParams]);

  const fetchLiveBids = useCallback(async () => {
    try { const d = await marketApi.getBids(liveBidsParams); setLiveBids(d); } catch (e) { console.error('[Market] bids error', e); }
  }, [liveBidsParams]);

  const fetchLiveTape = useCallback(async () => {
    try { const d = await marketApi.getTape(liveTapeParams); setLiveTape(d); } catch (e) { console.error('[Market] tape error', e); }
  }, [liveTapeParams]);

  const fetchMatchedAsks = useCallback(async () => {
    try { const d = await marketApi.getMatchedAsks(matchedAsksParams); setMatchedAsks(d); } catch (e) { console.error('[Market] matched asks error', e); }
  }, [matchedAsksParams]);

  const fetchMatchedBids = useCallback(async () => {
    try { const d = await marketApi.getMatchedBids(matchedBidsParams); setMatchedBids(d); } catch (e) { console.error('[Market] matched bids error', e); }
  }, [matchedBidsParams]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchLiveAsks(), fetchLiveBids(), fetchLiveTape()]);
    setLoading(false);
  }, [fetchStats, fetchLiveAsks, fetchLiveBids, fetchLiveTape]);

  // Initial load + auto-refresh
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchMatchedAsks(); }, [fetchMatchedAsks]);
  useEffect(() => { fetchMatchedBids(); }, [fetchMatchedBids]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchStats();
      if (activeTab === 'market') { fetchLiveAsks(); fetchLiveBids(); fetchLiveTape(); }
    }, 10_000);
    return () => clearInterval(timer);
  }, [activeTab, fetchStats, fetchLiveAsks, fetchLiveBids, fetchLiveTape]);

  // ── Render ──
  return (
    <div style={{ margin: -32, padding: 28, background: baseBg, minHeight: 'calc(100vh - 152px)' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: isDarkMode ? '#252d42' : '#e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BarChartOutlined style={{ color: isDarkMode ? '#94a3b8' : '#475569', fontSize: 17 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 18, color: headingColor, fontFamily: FONT, display: 'block', lineHeight: 1.2 }}>
              P2P Market
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor, fontFamily: FONT }}>Hệ thống khớp lệnh tập trung</Text>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            background: isDarkMode ? 'rgba(59,130,246,0.08)' : 'rgba(30,64,175,0.06)',
            border: `1px solid ${isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(30,64,175,0.1)'}`,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: isDarkMode ? ACCENT.primary.dark : ACCENT.primary.light,
              display: 'inline-block',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? ACCENT.primary.dark : ACCENT.primary.light, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: FONT }}>Live</span>
          </div>
          <Tooltip title="Làm mới dữ liệu">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={fetchAll}
              style={{
                background: isDarkMode ? '#2e3447' : '#E2E8F0',
                color: isDarkMode ? '#dce1fb' : '#475569',
                border: 'none', borderRadius: 8, height: 36,
              }}
            />
          </Tooltip>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Tổng đã khớp" value={stats ? fmtCompact(stats.totalMatched) : '---'} sub={stats ? `${fmtNum(stats.totalMatched)} VND` : undefined} isDarkMode={isDarkMode} />
        <StatCard label="Vốn ĐT sẵn sàng" value={stats ? fmtCompact(stats.availableInvestment) : '---'} sub={stats ? `${fmtNum(stats.availableInvestment)} VND` : undefined} color="emerald" isDarkMode={isDarkMode} />
        <StatCard label="Vốn vay chờ khớp" value={stats ? fmtCompact(stats.pendingLoans) : '---'} sub={stats ? `${stats.pendingLoansCount} khoản` : undefined} color="rose" isDarkMode={isDarkMode} />
        <StatCard label="Lệnh hoạt động" value={stats ? String(stats.activeOrders) : '---'} sub="Asks + Bids" color="blue" isDarkMode={isDarkMode} />
      </div>

      {/* ── Tabs ── */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'matched-asks',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleOutlined /> Asks 100%
              </span>
            ),
            children: (
              <MatchedAsksTable
                data={matchedAsks.asks} pagination={matchedAsks.pagination}
                params={matchedAsksParams} onParamsChange={setMatchedAsksParams}
                isDarkMode={isDarkMode} cardBg={cardBg} borderColor={borderColor}
                headingColor={headingColor} mutedColor={mutedColor} hoverBg={hoverBg}
              />
            ),
          },
          {
            key: 'market',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ThunderboltOutlined /> Market Live
              </span>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <AsksPanel
                    data={liveAsks.asks} pagination={liveAsks.pagination}
                    params={liveAsksParams} onParamsChange={setLiveAsksParams}
                    isDarkMode={isDarkMode} cardBg={cardBg} borderColor={borderColor}
                    headingColor={headingColor} mutedColor={mutedColor} hoverBg={hoverBg}
                  />
                  <BidsPanel
                    data={liveBids.bids} pagination={liveBids.pagination}
                    params={liveBidsParams} onParamsChange={setLiveBidsParams}
                    isDarkMode={isDarkMode} cardBg={cardBg} borderColor={borderColor}
                    headingColor={headingColor} mutedColor={mutedColor} hoverBg={hoverBg}
                  />
                </div>
                <TapePanel
                  data={liveTape.tape} pagination={liveTape.pagination}
                  params={liveTapeParams} onParamsChange={setLiveTapeParams}
                  isDarkMode={isDarkMode} cardBg={cardBg} borderColor={borderColor}
                  headingColor={headingColor} mutedColor={mutedColor} hoverBg={hoverBg}
                />
              </div>
            ),
          },
          {
            key: 'matched-bids',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LockOutlined /> Bids 100%
              </span>
            ),
            children: (
              <MatchedBidsTable
                data={matchedBids.bids} pagination={matchedBids.pagination}
                params={matchedBidsParams} onParamsChange={setMatchedBidsParams}
                isDarkMode={isDarkMode} cardBg={cardBg} borderColor={borderColor}
                headingColor={headingColor} mutedColor={mutedColor} hoverBg={hoverBg}
              />
            ),
          },
        ]}
        style={{ marginTop: -8 }}
      />

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  STAT CARD                                         */
/* ═══════════════════════════════════════════════════ */

function StatCard({ label, value, sub, color, isDarkMode }: {
  label: string; value: string; sub?: string; color?: 'emerald' | 'rose' | 'blue'; isDarkMode: boolean;
}) {
  const dotColor = color === 'emerald'
    ? (isDarkMode ? ACCENT.bid.dark : ACCENT.bid.light)
    : color === 'rose'
      ? (isDarkMode ? ACCENT.ask.dark : ACCENT.ask.light)
      : color === 'blue'
        ? (isDarkMode ? ACCENT.primary.dark : ACCENT.primary.light)
        : (isDarkMode ? '#64748b' : '#94a3b8');
  const valueColor = isDarkMode ? '#e2e8f0' : '#1e293b';

  return (
    <div style={{
      background: isDarkMode ? '#191f31' : '#fff',
      borderRadius: 10, padding: '16px 18px',
      border: `1px solid ${isDarkMode ? 'rgba(66,71,84,0.12)' : '#e2e8f0'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', opacity: 0.8 }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FONT }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: valueColor, fontFamily: FONT, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: isDarkMode ? '#475569' : '#94a3b8', marginTop: 3, fontFamily: FONT_MONO }}>{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  SHARED PANEL TYPES                                */
/* ═══════════════════════════════════════════════════ */

interface PanelProps {
  isDarkMode: boolean; cardBg: string; borderColor: string;
  headingColor: string; mutedColor: string; hoverBg: string;
}

/* ═══════════════════════════════════════════════════ */
/*  ASKS PANEL (Live)                                 */
/* ═══════════════════════════════════════════════════ */

function AsksPanel({ data, pagination, params, onParamsChange, isDarkMode, cardBg, borderColor, headingColor, mutedColor, hoverBg }: {
  data: MarketAsk[]; pagination?: PaginationMeta; params: MarketQueryParams; onParamsChange: (p: MarketQueryParams) => void;
} & PanelProps) {
  const maxCapital = Math.max(...data.map(a => a.capital), 1);
  const [searchVal, setSearchVal] = useState('');
  const debounceRef = useRef<any>(null);
  const navigate = useNavigate();

  const handleSearch = (val: string) => {
    setSearchVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onParamsChange({ ...params, q: val, page: 1 }), 400);
  };

  return (
    <div style={{ background: cardBg, borderRadius: 12, border: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', minHeight: 440 }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FallOutlined style={{ color: isDarkMode ? ACCENT.ask.dark : ACCENT.ask.light, fontSize: 13, opacity: 0.7 }} />
          <span
            style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#334155', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FONT, cursor: 'pointer' }}
            onClick={() => navigate('/loans')}
          >
            Khoản vay · Asks <RightOutlined style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }} />
          </span>
        </div>
        <span style={{ fontSize: 10, color: mutedColor }}>{pagination?.totalCount || 0} hồ sơ</span>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 18px', borderBottom: `1px solid ${borderColor}` }}>
        <Input
          prefix={<SearchOutlined style={{ color: mutedColor, fontSize: 12 }} />}
          placeholder="Tìm mã hoặc SĐT..."
          size="small"
          value={searchVal}
          onChange={e => handleSearch(e.target.value)}
          style={{ background: 'transparent', border: 'none', fontSize: 11, boxShadow: 'none' }}
        />
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1.2fr 45px 1.2fr 55px', gap: 4, padding: '10px 18px',
        fontSize: 10, fontWeight: 700, color: mutedColor, textTransform: 'uppercase',
        letterSpacing: 0.8, borderBottom: `1px solid ${borderColor}`, fontFamily: FONT,
        background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'
      }}>
        <SortHeader label="Mã khoản vay" field="createdAt" params={params} onChange={onParamsChange} />
        <span style={{ textAlign: 'right' }}>Lãi</span>
        <SortHeader label="Số tiền yêu cầu" field="capital" params={params} onChange={onParamsChange} style={{ justifyContent: 'flex-end' }} />
        <span style={{ textAlign: 'right' }}>Khớp</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {data.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 260, gap: 12 }}>
            <Empty description={<span style={{ color: mutedColor, fontSize: 13 }}>Không có khoản vay đang chờ</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            <Button size="small" type="link" onClick={() => onParamsChange({ ...params, q: '', page: 1 })}>Xóa lọc</Button>
          </div>
        ) : data.map((ask) => (
          <div
            key={ask.id}
            onClick={() => navigate(`/loans?loanId=${ask.fineractLoanId || ask.id}`)}
            style={{
              position: 'relative', display: 'grid', gridTemplateColumns: '1.2fr 45px 1.2fr 55px',
              gap: 4, padding: '10px 18px', alignItems: 'center', cursor: 'pointer',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 1
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.background = hoverBg;
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(2px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)';
            }}
          >
            {/* Background bar */}
            <div style={{
              position: 'absolute', right: 0, top: 2, bottom: 2,
              width: `${(ask.capital / maxCapital) * 100}%`,
              background: isDarkMode ? 'rgba(255, 77, 79, 0.08)' : 'rgba(255, 77, 79, 0.05)',
              borderRight: `2px solid ${isDarkMode ? 'rgba(255, 77, 79, 0.2)' : 'rgba(255, 77, 79, 0.1)'}`,
              pointerEvents: 'none',
              zIndex: 0,
              transition: 'width 0.6s ease-out'
            }} />

            <div style={{ position: 'relative', minWidth: 0, zIndex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: headingColor, fontFamily: FONT_MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ask.loanCode}
              </div>
              {ask.phone && <div style={{ fontSize: 10, color: mutedColor, fontFamily: FONT_MONO, fontWeight: 500 }}>{ask.phone}</div>}
            </div>

            <div style={{ position: 'relative', fontSize: 12, textAlign: 'right', color: headingColor, fontWeight: 600, fontFamily: FONT_MONO, zIndex: 1 }}>
              {ask.rate.toFixed(1)}<span style={{ fontSize: 10, opacity: 0.6 }}>%</span>
            </div>

            <div style={{ position: 'relative', fontSize: 14, textAlign: 'right', fontWeight: 800, color: isDarkMode ? ACCENT.ask.dark : ACCENT.ask.light, fontFamily: FONT_MONO, zIndex: 1, letterSpacing: '-0.3px' }}>
              {fmtNum(ask.capital)}<span style={{ fontSize: 10, marginLeft: 2, fontWeight: 400 }}>₫</span>
            </div>

            <div style={{ position: 'relative', textAlign: 'right', zIndex: 1 }}>
              <Tag bordered={false} style={{
                margin: 0, fontSize: 10, fontWeight: 800, fontFamily: FONT_MONO,
                padding: '0 4px', borderRadius: 4,
                background: ask.matchPercent === 100 ? '#52c41a' : ask.matchPercent > 0 ? '#faad14' : 'transparent',
                color: ask.matchPercent > 0 ? '#fff' : mutedColor,
                minWidth: 40, textAlign: 'center'
              }}>
                {ask.matchPercent}%
              </Tag>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: mutedColor }}>Trang {pagination.currentPage}/{pagination.totalPages}</span>
          <Pagination
            size="small" current={pagination.currentPage} total={pagination.totalCount}
            pageSize={pagination.pageSize} showSizeChanger={false}
            onChange={p => onParamsChange({ ...params, page: p })}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  BIDS PANEL (Live)                                 */
/* ═══════════════════════════════════════════════════ */

function BidsPanel({ data, pagination, params, onParamsChange, isDarkMode, cardBg, borderColor, headingColor, mutedColor, hoverBg }: {
  data: MarketBid[]; pagination?: PaginationMeta; params: MarketQueryParams; onParamsChange: (p: MarketQueryParams) => void;
} & PanelProps) {
  const maxCapital = Math.max(...data.map(b => b.availableCapital), 1);
  const [searchVal, setSearchVal] = useState('');
  const debounceRef = useRef<any>(null);
  const navigate = useNavigate();

  const handleSearch = (val: string) => {
    setSearchVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onParamsChange({ ...params, q: val, page: 1 }), 400);
  };

  return (
    <div style={{ background: cardBg, borderRadius: 12, border: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', minHeight: 440 }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RiseOutlined style={{ color: isDarkMode ? ACCENT.bid.dark : ACCENT.bid.light, fontSize: 13, opacity: 0.7 }} />
          <span
            style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#334155', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FONT, cursor: 'pointer' }}
            onClick={() => navigate('/investment-orders')}
          >
            Vốn đầu tư · Bids <RightOutlined style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }} />
          </span>
        </div>
        <span style={{ fontSize: 10, color: mutedColor }}>{pagination?.totalCount || 0} lệnh</span>
      </div>

      <div style={{ padding: '8px 18px', borderBottom: `1px solid ${borderColor}` }}>
        <Input
          prefix={<SearchOutlined style={{ color: mutedColor, fontSize: 12 }} />}
          placeholder="Tìm mã hoặc SĐT..."
          size="small" value={searchVal}
          onChange={e => handleSearch(e.target.value)}
          style={{ background: 'transparent', border: 'none', fontSize: 11, boxShadow: 'none' }}
        />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1.2fr 60px 1.2fr', gap: 4, padding: '10px 18px',
        fontSize: 10, fontWeight: 700, color: mutedColor, textTransform: 'uppercase',
        letterSpacing: 0.8, borderBottom: `1px solid ${borderColor}`, fontFamily: FONT,
        background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'
      }}>
        <span>Nhà đầu tư (Investor)</span>
        <span style={{ textAlign: 'right' }}>Lãi max</span>
        <SortHeader label="Vốn nhàn rỗi" field="capital" params={params} onChange={onParamsChange} style={{ justifyContent: 'flex-end' }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {data.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 260, gap: 12 }}>
            <Empty description={<span style={{ color: mutedColor, fontSize: 13 }}>Không có vốn đầu tư sẵn sàng</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            <Button size="small" type="link" onClick={() => onParamsChange({ ...params, q: '', page: 1 })}>Xóa lọc</Button>
          </div>
        ) : data.map((bid) => (
          <div
            key={bid.id}
            onClick={() => navigate(`/investment-orders?q=${bid.investorCode}`)}
            style={{
              position: 'relative', display: 'grid', gridTemplateColumns: '1.2fr 60px 1.2fr',
              gap: 4, padding: '10px 18px', alignItems: 'center', cursor: 'pointer',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 1
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.background = hoverBg;
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(-2px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)';
            }}
          >
            <div style={{
              position: 'absolute', left: 0, top: 2, bottom: 2,
              width: `${(bid.availableCapital / maxCapital) * 100}%`,
              background: isDarkMode ? 'rgba(0, 204, 136, 0.08)' : 'rgba(0, 204, 136, 0.05)',
              borderLeft: `2px solid ${isDarkMode ? 'rgba(0, 204, 136, 0.2)' : 'rgba(0, 204, 136, 0.1)'}`,
              pointerEvents: 'none',
              zIndex: 0,
              transition: 'width 0.6s ease-out'
            }} />

            <div style={{ position: 'relative', minWidth: 0, zIndex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: headingColor, fontFamily: FONT_MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {bid.investorCode}
              </div>
              {bid.phone && <div style={{ fontSize: 10, color: mutedColor, fontFamily: FONT_MONO, fontWeight: 500 }}>{bid.phone}</div>}
            </div>

            <div style={{ position: 'relative', fontSize: 12, textAlign: 'right', color: headingColor, fontWeight: 600, fontFamily: FONT_MONO, zIndex: 1 }}>
              {bid.maxRate.toFixed(1)}<span style={{ fontSize: 10, opacity: 0.6 }}>%</span>
            </div>

            <div style={{ position: 'relative', fontSize: 14, textAlign: 'right', fontWeight: 800, color: isDarkMode ? ACCENT.bid.dark : ACCENT.bid.light, fontFamily: FONT_MONO, zIndex: 1, letterSpacing: '-0.3px' }}>
              {fmtNum(bid.availableCapital)}<span style={{ fontSize: 10, marginLeft: 2, fontWeight: 400 }}>₫</span>
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div style={{ padding: '10px 18px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: mutedColor }}>Trang {pagination.currentPage}/{pagination.totalPages}</span>
          <Pagination size="small" current={pagination.currentPage} total={pagination.totalCount} pageSize={pagination.pageSize} showSizeChanger={false} onChange={p => onParamsChange({ ...params, page: p })} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  TAPE PANEL (Live matching history)                */
/* ═══════════════════════════════════════════════════ */

function TapePanel({ data, pagination, params, onParamsChange, isDarkMode, cardBg, borderColor, headingColor, mutedColor, hoverBg }: {
  data: MarketTapeEntry[]; pagination?: PaginationMeta; params: MarketQueryParams; onParamsChange: (p: MarketQueryParams) => void;
} & PanelProps) {
  const navigate = useNavigate();
  // Group by roomId (investor)
  const grouped = data.reduce((acc, entry) => {
    if (!acc[entry.roomId]) {
      acc[entry.roomId] = { roomId: entry.roomId, investorCode: entry.investorCode, matchedAt: entry.matchedAt, totalMatchedAmount: 0, matches: [] };
    }
    acc[entry.roomId].matches.push(entry);
    acc[entry.roomId].totalMatchedAmount += entry.matchedAmount;
    return acc;
  }, {} as Record<string, { roomId: string; investorCode: string; matchedAt: string; totalMatchedAmount: number; matches: MarketTapeEntry[] }>);

  const groups = Object.values(grouped).sort((a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime());
  const maxAmount = Math.max(...groups.map(g => g.totalMatchedAmount), 1);

  // ── Colors (muted, neutral) ──
  const timelineDot = isDarkMode ? '#64748b' : '#94a3b8';
  const timelineLine = isDarkMode ? 'rgba(100,116,139,0.15)' : 'rgba(148,163,184,0.2)';
  const investorBg = isDarkMode ? 'rgba(100,116,139,0.08)' : 'rgba(100,116,139,0.05)';
  const investorBorder = isDarkMode ? 'rgba(100,116,139,0.15)' : 'rgba(100,116,139,0.12)';
  const loanCardBg = isDarkMode ? 'rgba(255,255,255,0.02)' : '#f8fafc';
  const loanCardBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0';
  const progressTrack = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  return (
    <div style={{ background: cardBg, borderRadius: 12, border: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', minHeight: 340 }}>
      {/* ── Header ── */}
      <div style={{
        padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SwapOutlined style={{ color: isDarkMode ? ACCENT.primary.dark : ACCENT.primary.light, fontSize: 13, opacity: 0.7 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#334155', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FONT }}>Khớp lệnh Live</span>
          <span style={{ fontSize: 10, color: mutedColor, fontFamily: FONT_MONO }}>TAPE</span>
        </div>
        <span style={{ fontSize: 10, color: mutedColor }}>{pagination?.totalCount || 0} lệnh</span>
      </div>

      {/* ── Timeline content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px' }}>
        {groups.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <Empty description="Chưa có lệnh khớp nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <div style={{ position: 'relative', padding: '16px 0' }}>
            {/* Vertical timeline line */}
            <div style={{
              position: 'absolute', left: 42, top: 20, bottom: 20, width: 2,
              background: isDarkMode ? 'rgba(59,130,246,0.1)' : 'rgba(30,64,175,0.05)',
              borderRadius: 1,
            }} />

            {groups.map((group, gi) => {
              const progressPct = Math.min((group.totalMatchedAmount / maxAmount) * 100, 100);
              return (
                <div
                  key={group.roomId}
                  onClick={() => navigate(`/investment-orders/${group.roomId}`)}
                  style={{
                    position: 'relative', display: 'flex', gap: 24,
                    padding: '16px 20px', marginBottom: 12,
                    borderRadius: 12, cursor: 'pointer',
                    background: isDarkMode ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.005)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}`,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background = isDarkMode ? 'rgba(59,130,246,0.04)' : 'rgba(30,64,175,0.02)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = isDarkMode ? 'rgba(59,130,246,0.2)' : 'rgba(30,64,175,0.1)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.005)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background = isDarkMode ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.005)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
                  }}
                >
                  {/* ── Timeline dot ── */}
                  <div style={{ flexShrink: 0, width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: gi === 0 ? ACCENT.primary.dark : (isDarkMode ? '#334155' : '#cbd5e1'),
                      boxShadow: gi === 0 ? `0 0 10px ${ACCENT.primary.dark}80` : 'none',
                      position: 'relative', zIndex: 2,
                      border: `2px solid ${cardBg}`
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: headingColor, fontFamily: FONT_MONO,
                      marginTop: 8, whiteSpace: 'nowrap',
                    }}>
                      {fmtTime(group.matchedAt)}
                    </span>
                  </div>

                  {/* ── Content card ── */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Investor header row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Investor badge */}
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          padding: '6px 14px', borderRadius: 8,
                          background: isDarkMode ? '#1e2536' : '#f1f5f9',
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                        }}>
                          <span style={{
                            fontSize: 13, fontWeight: 700, fontFamily: FONT_MONO,
                            color: isDarkMode ? ACCENT.bid.dark : ACCENT.bid.light,
                          }}>
                            {group.investorCode}
                          </span>
                        </div>
                        <Tag style={{
                          margin: 0, fontSize: 10, fontWeight: 500, borderRadius: 4,
                          background: isDarkMode ? 'rgba(100,116,139,0.1)' : 'rgba(100,116,139,0.06)',
                          border: `1px solid ${isDarkMode ? 'rgba(100,116,139,0.15)' : 'rgba(100,116,139,0.12)'}`,
                          color: mutedColor,
                        }}>
                          {group.matches.length} hồ sơ
                        </Tag>
                      </div>

                      {/* Total amount */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontSize: 18, fontWeight: 800, fontFamily: FONT_MONO,
                          color: headingColor, letterSpacing: '-0.5px',
                        }}>
                          {fmtNum(group.totalMatchedAmount)}<span style={{ fontSize: 11, marginLeft: 2, fontWeight: 400 }}>₫</span>
                        </div>
                        <div style={{ fontSize: 9, color: mutedColor, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1, marginTop: 1 }}>Tổng đã khớp</div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: 4, borderRadius: 2, background: progressTrack, marginBottom: 14, overflow: 'hidden',
                      border: isDarkMode ? 'none' : '1px solid #f1f5f9'
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${progressPct}%`,
                        background: `linear-gradient(90deg, ${ACCENT.primary.dark} 0%, ${ACCENT.primary.light} 100%)`,
                        boxShadow: `0 0 8px ${ACCENT.primary.dark}40`,
                        transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }} />
                    </div>

                    {/* Matched loan cards */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {group.matches.map((entry, idx) => (
                        <div
                          key={`${entry.loanCode}-${idx}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 0,
                            borderRadius: 10, overflow: 'hidden',
                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                            background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#fff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.borderColor = isDarkMode ? ACCENT.primary.dark : ACCENT.primary.light;
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLDivElement).style.borderColor = isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0';
                            (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                          }}
                        >
                          {/* Loan code */}
                          <div style={{
                            padding: '8px 12px',
                            borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                            background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                          }}>
                            <div style={{ fontSize: 12, fontFamily: FONT_MONO, fontWeight: 700, color: headingColor }}>
                              {entry.loanCode}
                            </div>
                          </div>

                          {/* Interest Rate */}
                          <div style={{ padding: '8px 10px', borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}` }}>
                            <span style={{ fontSize: 11, fontFamily: FONT_MONO, fontWeight: 600, color: ACCENT.primary.dark }}>
                              {entry.interestMax.toFixed(1)}%
                            </span>
                          </div>

                          {/* Amount */}
                          <div style={{ padding: '8px 10px', borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}` }}>
                            <span style={{ fontSize: 12, fontFamily: FONT_MONO, fontWeight: 700, color: headingColor }}>
                              {fmtNum(entry.matchedAmount)}<span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>₫</span>
                            </span>
                          </div>

                          {/* Node Badge */}
                          <div style={{
                            padding: '8px 12px',
                            background: isDarkMode ? 'rgba(68,136,255,0.1)' : 'rgba(24,144,255,0.05)',
                          }}>
                            <span style={{
                              fontSize: 10, fontWeight: 800, fontFamily: FONT_MONO,
                              color: isDarkMode ? ACCENT.primary.dark : ACCENT.primary.light,
                              letterSpacing: 0.5,
                            }}>
                              Node {entry.nodeMatch}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{
          padding: '10px 22px', borderTop: `1px solid ${borderColor}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: mutedColor }}>
            Trang <strong style={{ color: headingColor }}>{pagination.currentPage}</strong> / {pagination.totalPages}
          </span>
          <Pagination
            size="small" current={pagination.currentPage} total={pagination.totalCount}
            pageSize={pagination.pageSize} showSizeChanger={false}
            onChange={p => onParamsChange({ ...params, page: p })}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MATCHED ASKS TABLE (100%)                         */
/* ═══════════════════════════════════════════════════ */

function MatchedAsksTable({ data, pagination, params, onParamsChange, isDarkMode, cardBg, borderColor, headingColor, mutedColor, hoverBg }: {
  data: MatchedAsk[]; pagination?: PaginationMeta; params: MarketQueryParams; onParamsChange: (p: MarketQueryParams) => void;
} & PanelProps) {
  const [searchVal, setSearchVal] = useState('');
  const debounceRef = useRef<any>(null);
  const navigate = useNavigate();

  const handleSearch = (val: string) => {
    setSearchVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onParamsChange({ ...params, q: val, page: 1 }), 400);
  };

  return (
    <div style={{ background: cardBg, borderRadius: 12, border: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', minHeight: 500 }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircleOutlined style={{ color: isDarkMode ? ACCENT.ask.dark : ACCENT.ask.light, fontSize: 13, opacity: 0.7 }} />
          <span
            style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#334155', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: FONT, cursor: 'pointer' }}
            onClick={() => navigate('/loans')}
          >
            Hồ sơ vay đã khớp 100% <RightOutlined style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }} />
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Input
            prefix={<SearchOutlined style={{ color: mutedColor }} />}
            placeholder="Tìm mã hồ sơ..."
            size="small" value={searchVal}
            onChange={e => handleSearch(e.target.value)}
            style={{ width: 220, borderRadius: 8 }}
          />
          <span style={{ fontSize: 12, color: mutedColor }}>{pagination?.totalCount || 0} hồ sơ</span>
        </div>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 1fr 80px 80px', gap: 12, padding: '10px 20px', fontSize: 10, fontWeight: 600, color: mutedColor, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${borderColor}`, fontFamily: FONT }}>
        <SortHeader label="Thời gian" field="updatedAt" params={params} onChange={onParamsChange} />
        <span>Mã hồ sơ</span>
        <SortHeader label="Lãi suất" field="monthlyRatePercent" params={params} onChange={onParamsChange} style={{ justifyContent: 'flex-end' }} />
        <SortHeader label="Vốn huy động" field="capital" params={params} onChange={onParamsChange} style={{ justifyContent: 'flex-end' }} />
        <span style={{ textAlign: 'right' }}>Thời hạn</span>
        <span style={{ textAlign: 'center' }}>Trạng thái</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {data.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <Empty description="Không tìm thấy hồ sơ nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : data.map(item => (
          <div
            key={item.id}
            style={{
              display: 'grid', gridTemplateColumns: '90px 1fr 70px 1fr 80px 80px',
              gap: 12, padding: '10px 20px', alignItems: 'center', cursor: 'pointer',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: mutedColor }}>{fmtTime(item.matchedAt)}</span>
            <div>
              <div style={{ fontSize: 13, fontFamily: FONT_MONO, fontWeight: 600, color: headingColor }}>{item.loanCode}</div>
              {item.fineractLoanId && <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: mutedColor }}>#{item.fineractLoanId}</span>}
            </div>
            <span style={{ fontSize: 12, textAlign: 'right', color: mutedColor, fontFamily: FONT_MONO }}>{item.rate}%</span>
            <span style={{ fontSize: 13, textAlign: 'right', fontWeight: 600, color: isDarkMode ? ACCENT.ask.dark : ACCENT.ask.light, fontFamily: FONT_MONO, opacity: 0.85 }}>{fmtNum(item.capital)}</span>
            <span style={{ fontSize: 12, textAlign: 'right', color: mutedColor, fontFamily: FONT }}>{item.period} tháng</span>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Tag
                color={
                  (item.fineractStatus === 'CLOSED_OBLIGATIONS_MET' || item.status === 'closed') ? 'green'
                    : item.status === 'disbursed' ? 'blue' : 'orange'
                }
                style={{ fontSize: 10, fontWeight: 600, margin: 0, borderRadius: 4, fontFamily: FONT }}
              >
                {(item.fineractStatus === 'CLOSED_OBLIGATIONS_MET' || item.status === 'closed') ? 'Paid'
                  : item.status === 'disbursed' ? 'Active' : 'Matched'}
              </Tag>
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: mutedColor, fontFamily: FONT }}>
            Hiển thị <strong style={{ color: headingColor }}>{((pagination.currentPage - 1) * pagination.pageSize) + 1}-{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}</strong> trong <strong style={{ color: headingColor }}>{pagination.totalCount}</strong>
          </span>
          <Pagination current={pagination.currentPage} total={pagination.totalCount} pageSize={pagination.pageSize} showSizeChanger={false} onChange={p => onParamsChange({ ...params, page: p })} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MATCHED BIDS TABLE (100%)                         */
/* ═══════════════════════════════════════════════════ */

function MatchedBidsTable({ data, pagination, params, onParamsChange, isDarkMode, cardBg, borderColor, headingColor, mutedColor, hoverBg }: {
  data: MatchedBid[]; pagination?: PaginationMeta; params: MarketQueryParams; onParamsChange: (p: MarketQueryParams) => void;
} & PanelProps) {
  const [searchVal, setSearchVal] = useState('');
  const debounceRef = useRef<any>(null);
  const navigate = useNavigate();

  const handleSearch = (val: string) => {
    setSearchVal(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onParamsChange({ ...params, q: val, page: 1 }), 400);
  };

  return (
    <div style={{ background: cardBg, borderRadius: 12, border: `1px solid ${borderColor}`, display: 'flex', flexDirection: 'column', minHeight: 500 }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LockOutlined style={{ color: isDarkMode ? ACCENT.bid.dark : ACCENT.bid.light, fontSize: 13, opacity: 0.7 }} />
          <span
            style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#cbd5e1' : '#334155', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: FONT, cursor: 'pointer' }}
            onClick={() => navigate('/investment-orders')}
          >
            Khoản đầu tư đã khớp đủ <RightOutlined style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }} />
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Input
            prefix={<SearchOutlined style={{ color: mutedColor }} />}
            placeholder="Tìm mã hoặc số điện thoại..."
            size="small" value={searchVal}
            onChange={e => handleSearch(e.target.value)}
            style={{ width: 220, borderRadius: 8 }}
          />
          <span style={{ fontSize: 12, color: mutedColor }}>{pagination?.totalCount || 0} khoản</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 1fr 1fr 70px', gap: 12, padding: '10px 20px', fontSize: 10, fontWeight: 600, color: mutedColor, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${borderColor}`, fontFamily: FONT }}>
        <SortHeader label="Kết thúc" field="updatedAt" params={params} onChange={onParamsChange} />
        <span>Mã NĐT</span>
        <SortHeader label="Lãi suất" field="interestRange.max" params={params} onChange={onParamsChange} style={{ justifyContent: 'flex-end' }} />
        <SortHeader label="Vốn Matched" field="matchedCapital" params={params} onChange={onParamsChange} style={{ justifyContent: 'flex-end' }} />
        <span style={{ textAlign: 'right' }}>Vốn Đăng ký</span>
        <span style={{ textAlign: 'center' }}>Nodes</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {data.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <Empty description="Không tìm thấy khoản đầu tư nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : data.map(item => (
          <div
            key={item.id}
            style={{
              display: 'grid', gridTemplateColumns: '90px 1fr 100px 1fr 1fr 70px',
              gap: 12, padding: '10px 20px', alignItems: 'center', cursor: 'pointer',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: mutedColor }}>{fmtTime(item.matchedAt)}</span>
            <span style={{ fontSize: 13, fontFamily: FONT_MONO, fontWeight: 600, color: headingColor }}>{item.investorCode}</span>
            <span style={{ fontSize: 12, textAlign: 'right', color: mutedColor, fontFamily: FONT_MONO }}>{item.rate}%</span>
            <span style={{ fontSize: 13, textAlign: 'right', fontWeight: 600, color: isDarkMode ? ACCENT.bid.dark : ACCENT.bid.light, fontFamily: FONT_MONO, opacity: 0.85 }}>{fmtNum(item.matchedCapital)}</span>
            <span style={{ fontSize: 12, textAlign: 'right', color: mutedColor, fontFamily: FONT_MONO }}>{fmtNum(item.totalCapital)}</span>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Tag color="blue" style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>{item.nodes}</Tag>
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: mutedColor, fontFamily: FONT }}>
            Hiển thị <strong style={{ color: headingColor }}>{((pagination.currentPage - 1) * pagination.pageSize) + 1}-{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}</strong> trong <strong style={{ color: headingColor }}>{pagination.totalCount}</strong>
          </span>
          <Pagination current={pagination.currentPage} total={pagination.totalCount} pageSize={pagination.pageSize} showSizeChanger={false} onChange={p => onParamsChange({ ...params, page: p })} />
        </div>
      )}
    </div>
  );
}
