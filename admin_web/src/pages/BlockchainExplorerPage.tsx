import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Typography, Tag, Space, Button, Spin, Drawer, Descriptions,
  Row, Col, Empty, Tooltip, Divider, message,
} from 'antd';
import {
  ReloadOutlined, LinkOutlined, SafetyCertificateOutlined,
  ClockCircleOutlined,
  BlockOutlined, NodeIndexOutlined, FileProtectOutlined,
  DollarOutlined, FundOutlined,
} from '@ant-design/icons';
import { api } from '../api/client';
import { useTheme } from '../App';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

/* ── Types ────────────────────────────────────────────────────── */
interface NetworkStatus {
  connected: boolean;
  channel: string;
  chaincode: string;
  gateway: string;
  organization: string;
  peer: string;
}

interface BlockchainStats {
  totalLoanContracts: number;
  totalInvestmentContracts: number;
  totalTransactions: number;
  totalLoanVolume: number;
  totalInvestmentVolume: number;
  networkConnected: boolean;
}

interface ContractBlock {
  key: string;
  type: 'LoanContract' | 'InvestmentContract' | 'SettlementContract';
  contractId: string;
  status: string;
  amount: number;
  dataHash: string;
  createdAt: string;
  updatedAt: string;
  details: any;
}

/* ── Blockchain Color Palette ─────────────────────────────────── */
const CHAIN_COLORS = {
  neonCyan: '#00E5FF',
  neonGreen: '#39FF14',
  neonBlue: '#4FC3F7',
  hashPurple: '#B388FF',
  blockOrange: '#FF9800',
  deepBg: '#0a0e27',
  cardBg: 'rgba(15, 23, 42, 0.8)',
  cardBorder: 'rgba(0, 229, 255, 0.15)',
  glowCyan: '0 0 20px rgba(0, 229, 255, 0.15)',
};

/* ── Helper ───────────────────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

const truncHash = (hash: string | undefined) =>
  hash ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : '—';

const typeIcon = (type: string) => {
  if (type === 'LoanContract') return <FileProtectOutlined />;
  if (type === 'InvestmentContract') return <FundOutlined />;
  return <DollarOutlined />;
};

const typeColor = (type: string) => {
  if (type === 'LoanContract') return CHAIN_COLORS.neonCyan;
  if (type === 'InvestmentContract') return CHAIN_COLORS.neonGreen;
  return CHAIN_COLORS.blockOrange;
};

const statusTag = (status: string) => {
  const map: Record<string, { color: string; label: string }> = {
    pending_signature: { color: 'orange', label: 'Chờ ký' },
    signed: { color: 'blue', label: 'Đã ký' },
    active: { color: 'green', label: 'Đang hoạt động' },
    completed: { color: 'cyan', label: 'Hoàn thành' },
    pending: { color: 'gold', label: 'Chờ xử lý' },
    matched: { color: 'geekblue', label: 'Đã khớp' },
  };
  const cfg = map[status] || { color: 'default', label: status };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
};

/* ═══════════════════════════════════════════════════════════════
   BLOCKCHAIN EXPLORER PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function BlockchainExplorerPage() {
  const { isDarkMode } = useTheme();
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [stats, setStats] = useState<BlockchainStats | null>(null);
  const [contracts, setContracts] = useState<ContractBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<ContractBlock | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, stRes, cRes] = await Promise.allSettled([
        api.get('/api/blockchain/status'),
        api.get('/api/blockchain/stats'),
        api.get('/api/blockchain/contracts'),
      ]);
      if (sRes.status === 'fulfilled') setStatus(sRes.value.data.data);
      if (stRes.status === 'fulfilled') setStats(stRes.value.data.data);
      if (cRes.status === 'fulfilled') setContracts(cRes.value.data.data || []);
    } catch {
      message.error('Không thể kết nối blockchain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDetail = (c: ContractBlock) => {
    setSelectedContract(c);
    setDrawerOpen(true);
  };

  /* ── Styles ───────────────────────────────────────────────── */
  const pageBg = isDarkMode ? CHAIN_COLORS.deepBg : '#F1F5F9';
  const cardStyle: React.CSSProperties = {
    background: isDarkMode ? CHAIN_COLORS.cardBg : '#FFFFFF',
    border: isDarkMode ? `1px solid ${CHAIN_COLORS.cardBorder}` : `1px solid #E2E8F0`,
    borderRadius: 16,
    boxShadow: isDarkMode ? CHAIN_COLORS.glowCyan : '0 1px 3px rgba(0,0,0,0.06)',
  };

  return (
    <div style={{
      background: pageBg,
      minHeight: '100%',
      margin: -32,
      padding: 32,
      borderRadius: 10,
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{
            margin: 0,
            color: isDarkMode ? '#F1F5F9' : '#0F172A',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <BlockOutlined style={{ color: CHAIN_COLORS.neonCyan }} />
            Blockchain Explorer
          </Title>
          <Text style={{ color: isDarkMode ? '#64748B' : '#94A3B8', fontSize: 13 }}>
            Hyperledger Fabric — P2P Lending Ledger
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={fetchData}
          loading={loading}
          style={{
            borderRadius: 10,
            background: isDarkMode ? 'rgba(0, 229, 255, 0.1)' : undefined,
            borderColor: isDarkMode ? CHAIN_COLORS.neonCyan : undefined,
            color: isDarkMode ? CHAIN_COLORS.neonCyan : undefined,
          }}
        >
          Refresh
        </Button>
      </div>

      {/* ── Network Status Banner ── */}
      <Card
        style={{
          ...cardStyle,
          marginBottom: 24,
          background: isDarkMode
            ? 'linear-gradient(135deg, rgba(0, 229, 255, 0.05) 0%, rgba(15, 23, 42, 0.9) 100%)'
            : 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)',
        }}
        bodyStyle={{ padding: '20px 24px' }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} sm={8} md={5}>
            <Space size={12} align="center">
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: status?.connected ? CHAIN_COLORS.neonGreen : '#EF4444',
                boxShadow: status?.connected
                  ? `0 0 12px ${CHAIN_COLORS.neonGreen}`
                  : '0 0 12px #EF4444',
                animation: status?.connected ? 'pulse 2s infinite' : 'none',
              }} />
              <Text strong style={{
                color: isDarkMode ? '#F1F5F9' : '#0F172A',
                fontSize: 15,
              }}>
                {status?.connected ? 'Đang kết nối' : 'Mất kết nối'}
              </Text>
            </Space>
          </Col>
          {status?.connected && (
            <>
              <Col xs={12} sm={8} md={5}>
                <div>
                  <Text style={{ color: isDarkMode ? '#64748B' : '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Channel</Text>
                  <div><Tag color="blue" style={{ fontFamily: 'monospace' }}>{status.channel}</Tag></div>
                </div>
              </Col>
              <Col xs={12} sm={8} md={5}>
                <div>
                  <Text style={{ color: isDarkMode ? '#64748B' : '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Chaincode</Text>
                  <div><Tag color="cyan" style={{ fontFamily: 'monospace' }}>{status.chaincode}</Tag></div>
                </div>
              </Col>
              <Col xs={12} sm={8} md={5}>
                <div>
                  <Text style={{ color: isDarkMode ? '#64748B' : '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Organization</Text>
                  <div><Tag color="geekblue" style={{ fontFamily: 'monospace' }}>{status.organization}</Tag></div>
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <div>
                  <Text style={{ color: isDarkMode ? '#64748B' : '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Gateway</Text>
                  <div><Text style={{ color: isDarkMode ? '#94A3B8' : '#475569', fontSize: 12, fontFamily: 'monospace' }}>{status.gateway}</Text></div>
                </div>
              </Col>
            </>
          )}
        </Row>
      </Card>

      {/* ── Stats Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          {
            title: 'Loan Contracts',
            value: stats?.totalLoanContracts || 0,
            icon: <FileProtectOutlined />,
            color: CHAIN_COLORS.neonCyan,
            suffix: 'hợp đồng',
          },
          {
            title: 'Investment Contracts',
            value: stats?.totalInvestmentContracts || 0,
            icon: <FundOutlined />,
            color: CHAIN_COLORS.neonGreen,
            suffix: 'hợp đồng',
          },
          {
            title: 'Tổng giao dịch',
            value: stats?.totalTransactions || 0,
            icon: <NodeIndexOutlined />,
            color: CHAIN_COLORS.neonBlue,
            suffix: 'blocks',
          },
          {
            title: 'Tổng giá trị vay',
            value: stats?.totalLoanVolume || 0,
            icon: <DollarOutlined />,
            color: CHAIN_COLORS.blockOrange,
            isCurrency: true,
          },
        ].map((s, i) => (
          <Col xs={12} md={6} key={i}>
            <Card
              style={{
                ...cardStyle,
                overflow: 'hidden',
                position: 'relative',
              }}
              bodyStyle={{ padding: '20px 20px 16px' }}
            >
              {/* Decorative glow */}
              <div style={{
                position: 'absolute', top: -30, right: -30,
                width: 80, height: 80, borderRadius: '50%',
                background: `radial-gradient(circle, ${s.color}20 0%, transparent 70%)`,
              }} />
              <Space direction="vertical" size={4} style={{ position: 'relative', zIndex: 1 }}>
                <Space size={8}>
                  {React.cloneElement(s.icon as React.ReactElement, {
                    style: { fontSize: 18, color: s.color },
                  })}
                  <Text style={{
                    color: isDarkMode ? '#94A3B8' : '#64748B',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}>
                    {s.title}
                  </Text>
                </Space>
                <div style={{ fontSize: 28, fontWeight: 800, color: isDarkMode ? '#F1F5F9' : '#0F172A', fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.isCurrency ? fmt(s.value) : s.value.toLocaleString()}
                </div>
                {s.suffix && (
                  <Text style={{ color: isDarkMode ? '#475569' : '#94A3B8', fontSize: 11 }}>
                    {s.suffix}
                  </Text>
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Chain Visualization ── */}
      <Card
        title={
          <Space>
            <LinkOutlined style={{ color: CHAIN_COLORS.neonCyan }} />
            <span>Chuỗi khối — Ledger Transactions</span>
            <Tag color={isDarkMode ? 'cyan' : 'blue'}>{contracts.length} blocks</Tag>
          </Space>
        }
        style={cardStyle}
        bodyStyle={{ padding: 0 }}
      >
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: isDarkMode ? '#64748B' : '#94A3B8' }}>
              Đang truy vấn ledger...
            </div>
          </div>
        ) : contracts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có giao dịch nào trên blockchain"
            style={{ padding: 60 }}
          />
        ) : (
          <div style={{ padding: '24px 24px 16px', overflow: 'auto' }}>
            {contracts.map((block, idx) => (
              <div key={block.key} style={{ display: 'flex', alignItems: 'stretch', marginBottom: 0 }}>
                {/* ── Chain connector ── */}
                <div style={{
                  width: 48,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  {/* Node dot */}
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: typeColor(block.type),
                    boxShadow: `0 0 10px ${typeColor(block.type)}60`,
                    border: `2px solid ${isDarkMode ? CHAIN_COLORS.deepBg : '#FFF'}`,
                    zIndex: 2,
                    flexShrink: 0,
                  }} />
                  {/* Vertical line */}
                  {idx < contracts.length - 1 && (
                    <div style={{
                      width: 2,
                      flex: 1,
                      background: isDarkMode
                        ? `linear-gradient(180deg, ${typeColor(block.type)}60 0%, ${typeColor(contracts[idx + 1]?.type)}60 100%)`
                        : '#E2E8F0',
                      minHeight: 20,
                    }} />
                  )}
                </div>

                {/* ── Block card ── */}
                <div
                  onClick={() => openDetail(block)}
                  style={{
                    flex: 1,
                    marginLeft: 12,
                    marginBottom: 16,
                    padding: '16px 20px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#FAFBFC',
                    border: `1px solid ${isDarkMode ? `${typeColor(block.type)}20` : '#E8EDF2'}`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    el.style.borderColor = `${typeColor(block.type)}60`;
                    el.style.boxShadow = `0 0 16px ${typeColor(block.type)}15`;
                    el.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    el.style.borderColor = isDarkMode ? `${typeColor(block.type)}20` : '#E8EDF2';
                    el.style.boxShadow = 'none';
                    el.style.transform = 'translateX(0)';
                  }}
                >
                  {/* Glow accent line */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: 3,
                    background: typeColor(block.type),
                    boxShadow: `0 0 8px ${typeColor(block.type)}`,
                  }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <Space size={8} style={{ marginBottom: 6 }}>
                        {React.cloneElement(typeIcon(block.type) as React.ReactElement, {
                          style: { fontSize: 14, color: typeColor(block.type) },
                        })}
                        <Tag
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            borderColor: `${typeColor(block.type)}40`,
                            color: typeColor(block.type),
                            background: `${typeColor(block.type)}10`,
                          }}
                        >
                          {block.type.replace('Contract', '')}
                        </Tag>
                        {statusTag(block.status)}
                      </Space>
                      <div>
                        <Text strong style={{
                          color: isDarkMode ? '#E2E8F0' : '#1E293B',
                          fontSize: 14,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {block.contractId}
                        </Text>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: 16, fontWeight: 700,
                        color: isDarkMode ? '#F1F5F9' : '#0F172A',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {fmt(block.amount)}
                      </div>
                      <Space size={4} style={{ marginTop: 4 }}>
                        <ClockCircleOutlined style={{ fontSize: 11, color: isDarkMode ? '#475569' : '#94A3B8' }} />
                        <Text style={{ fontSize: 11, color: isDarkMode ? '#475569' : '#94A3B8', fontFamily: 'monospace' }}>
                          {dayjs(block.createdAt).format('DD/MM/YYYY HH:mm')}
                        </Text>
                      </Space>
                    </div>
                  </div>

                  {/* Hash row */}
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SafetyCertificateOutlined style={{ fontSize: 11, color: CHAIN_COLORS.hashPurple }} />
                    <Tooltip title={block.dataHash}>
                      <Text style={{
                        fontSize: 11,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: CHAIN_COLORS.hashPurple,
                        opacity: 0.8,
                      }}>
                        SHA-256: {truncHash(block.dataHash)}
                      </Text>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Detail Drawer ── */}
      <Drawer
        title={
          <Space>
            <BlockOutlined style={{ color: CHAIN_COLORS.neonCyan }} />
            <span>Chi tiết Block</span>
          </Space>
        }
        placement="right"
        width={600}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{
          body: { background: isDarkMode ? '#0F172A' : '#FAFBFC' },
          header: { background: isDarkMode ? '#1E293B' : '#FFF' },
        }}
      >
        {selectedContract && (
          <div>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Contract ID">
                <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {selectedContract.contractId}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Loại">
                <Tag color={selectedContract.type === 'LoanContract' ? 'cyan' : 'green'}>
                  {selectedContract.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {statusTag(selectedContract.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Giá trị">
                <Text strong>{fmt(selectedContract.amount)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Data Hash">
                <Text copyable style={{ fontFamily: 'monospace', fontSize: 11, color: CHAIN_COLORS.hashPurple }}>
                  {selectedContract.dataHash || '—'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Tạo lúc">
                {dayjs(selectedContract.createdAt).format('DD/MM/YYYY HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật">
                {selectedContract.updatedAt
                  ? dayjs(selectedContract.updatedAt).format('DD/MM/YYYY HH:mm:ss')
                  : '—'}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '16px 0' }}>
              <Text style={{ fontSize: 12, color: isDarkMode ? '#64748B' : '#94A3B8' }}>
                RAW LEDGER DATA
              </Text>
            </Divider>

            <div style={{
              background: isDarkMode ? '#0a0e27' : '#F8FAFC',
              border: `1px solid ${isDarkMode ? '#1E293B' : '#E2E8F0'}`,
              borderRadius: 10,
              padding: 16,
              maxHeight: 400,
              overflow: 'auto',
            }}>
              <pre style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                color: isDarkMode ? CHAIN_COLORS.neonCyan : '#1E293B',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
                {JSON.stringify(selectedContract.details, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap');
      `}</style>
    </div>
  );
}
