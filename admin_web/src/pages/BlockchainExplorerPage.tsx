import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Typography, Tag, Space, Button, Spin, Drawer, Descriptions,
  Row, Col, Empty, Tooltip, Divider, message, Table, Input, Select,
  Statistic, Timeline, Badge, Segmented, Collapse,
} from 'antd';
import {
  ReloadOutlined, SafetyCertificateOutlined,
  ClockCircleOutlined, BlockOutlined, NodeIndexOutlined,
  FileProtectOutlined, DollarOutlined, FundOutlined,
  SearchOutlined, HistoryOutlined, CheckCircleOutlined,
  ApiOutlined, CloudServerOutlined, DatabaseOutlined,
  CopyOutlined, EyeOutlined, FilterOutlined,
} from '@ant-design/icons';
import { api } from '../api/client';
import { useTheme } from '../App';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;

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
  totalLoanEvaluationConfigs?: number;
  totalTransactions: number;
  totalLoanVolume: number;
  totalInvestmentVolume: number;
  networkConnected: boolean;
}

interface ContractBlock {
  key: string;
  type: string;
  contractId: string;
  status: string;
  amount: number;
  dataHash: string;
  createdAt: string;
  updatedAt: string;
  details: any;
}

/* ── Helpers ──────────────────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

const truncHash = (hash: string | undefined) =>
  hash ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : '—';

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  LoanContract: { label: 'Hợp đồng vay', color: 'blue', icon: <FileProtectOutlined /> },
  InvestmentContract: { label: 'Hợp đồng đầu tư', color: 'green', icon: <FundOutlined /> },
  SettlementContract: { label: 'Biên lai tất toán', color: 'orange', icon: <DollarOutlined /> },
  MatchingEvent: { label: 'Sự kiện ghép nối', color: 'purple', icon: <NodeIndexOutlined /> },
  InvestmentOrder: { label: 'Lệnh đầu tư', color: 'geekblue', icon: <SafetyCertificateOutlined /> },
  LoanEvaluationConfig: { label: 'Cấu hình đánh giá', color: 'magenta', icon: <SafetyCertificateOutlined /> },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending_signature: { color: 'warning', label: 'Chờ ký' },
  signed: { color: 'processing', label: 'Đã ký' },
  active: { color: 'success', label: 'Hoạt động' },
  disbursed: { color: 'cyan', label: 'Đã giải ngân' },
  completed: { color: 'default', label: 'Hoàn thành' },
  closed: { color: 'default', label: 'Đã đóng' },
  pending: { color: 'warning', label: 'Chờ xử lý' },
  matched: { color: 'geekblue', label: 'Đã khớp' },
  open: { color: 'processing', label: 'Đang mở' },
  cancelled: { color: 'error', label: 'Đã hủy' },
  success: { color: 'success', label: 'Thành công' },
  committed: { color: 'success', label: 'Đã ghi' },
};

const statusTag = (status: string, type?: string) => {
  const actualStatus = (!status || status.trim() === '') && type === 'MatchingEvent' ? 'success' : status;
  const cfg = STATUS_CONFIG[actualStatus] || { color: 'default', label: actualStatus || '—' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
};

const renderLedgerValue = (record: ContractBlock) => {
  if (record.type === 'LoanEvaluationConfig') {
    return <Tag color="magenta">v{record.amount}</Tag>;
  }
  return (
    <Text strong style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
      {fmt(record.amount)}
    </Text>
  );
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
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<string>('table');

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

  const fetchHistory = async (contractId: string) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/api/blockchain/contracts/${contractId}/history`);
      const data = res.data.data;
      setHistory(Array.isArray(data) ? data : (typeof data === 'string' ? JSON.parse(data) : []));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openDetail = (c: ContractBlock) => {
    setSelectedContract(c);
    setDrawerOpen(true);
    fetchHistory(c.contractId);
  };

  /* ── Filtered data ── */
  const filteredContracts = contracts.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return c.contractId.toLowerCase().includes(q) ||
        (c.dataHash || '').toLowerCase().includes(q);
    }
    return true;
  });

  /* ── Table columns ── */
  const columns: ColumnsType<ContractBlock> = [
    {
      title: 'Mã giao dịch',
      dataIndex: 'contractId',
      key: 'contractId',
      width: 220,
      render: (id: string) => (
        <div style={{ display: 'flex', alignItems: 'center', maxWidth: '100%' }}>
          <Tooltip title={id}>
            <Text
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                maxWidth: 160,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'inline-block',
                verticalAlign: 'bottom'
              }}
            >
              {id}
            </Text>
          </Tooltip>
          <Text copyable={{ text: id }} style={{ marginLeft: 8 }} />
        </div>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (type: string) => {
        const cfg = TYPE_CONFIG[type] || { label: type, color: 'default', icon: null };
        return (
          <Tag icon={cfg.icon} color={cfg.color}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string, record: ContractBlock) => statusTag(status, record.type),
    },
    {
      title: 'Giá trị / Version',
      dataIndex: 'amount',
      key: 'amount',
      width: 160,
      align: 'right',
      sorter: (a, b) => a.amount - b.amount,
      render: (_: number, record: ContractBlock) => renderLedgerValue(record),
    },
    {
      title: 'Data Hash (SHA-256)',
      dataIndex: 'dataHash',
      key: 'dataHash',
      width: 200,
      render: (hash: string) => hash ? (
        <Tooltip title={hash}>
          <Text copyable={{ text: hash }} style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: isDarkMode ? '#94A3B8' : '#64748B',
          }}>
            {truncHash(hash)}
          </Text>
        </Tooltip>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Thời gian ghi sổ',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend',
      render: (d: string) => d ? (
        <Space size={4}>
          <ClockCircleOutlined style={{ fontSize: 11, color: '#94A3B8' }} />
          <Text style={{ fontSize: 12 }}>{dayjs(d).format('DD/MM/YYYY HH:mm')}</Text>
        </Space>
      ) : '—',
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_: any, record: ContractBlock) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => openDetail(record)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  /* ── Network info items ── */
  const networkItems = status?.connected ? [
    { label: 'Channel', value: status.channel, icon: <ApiOutlined /> },
    { label: 'Chaincode', value: status.chaincode, icon: <DatabaseOutlined /> },
    { label: 'Organization', value: status.organization, icon: <CloudServerOutlined /> },
    { label: 'Peer', value: status.peer || status.gateway, icon: <NodeIndexOutlined /> },
  ] : [];

  /* ── Unique statuses for filter ── */
  const uniqueStatuses = [...new Set(contracts.map(c => c.status))];

  const renderLoanEvaluationConfigSummary = (details: any) => {
    if (selectedContract?.type !== 'LoanEvaluationConfig') return null;
    const weights = details.scoreWeights || {};
    const weightEntries = Object.entries(weights).filter(([key]) => key !== '_id');
    return (
      <>
        <Divider style={{ fontSize: 13 }}>
          <SafetyCertificateOutlined /> Cấu hình đã ghi trên blockchain
        </Divider>
        <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Version">v{details.version}</Descriptions.Item>
          <Descriptions.Item label="Tx Hash">
            <Text copyable style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>
              {details.transactionId || '—'}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Auto reject">
            <Tag color="red">&lt; {details.autoRejectScore}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Auto approve">
            <Tag color="green">≥ {details.autoApproveScore}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Người thay đổi" span={2}>{details.changedBy || '—'}</Descriptions.Item>
          <Descriptions.Item label="Ghi chú" span={2}>{details.changeNote || '—'}</Descriptions.Item>
        </Descriptions>

        <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Phân hạng tín dụng">
            <Space wrap>
              {(details.creditGrades || []).map((grade: any) => (
                <Tag key={grade.grade} color={grade.grade === 'A' ? 'green' : grade.grade === 'B' ? 'blue' : grade.grade === 'C' ? 'gold' : 'red'}>
                  {grade.grade}: {grade.minScore}-{grade.maxScore} | {fmt(grade.maxLoanAmount || 0)} | {grade.baseInterestRate}%/năm
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Trọng số">
            <Space wrap>
              {weightEntries.map(([key, value]) => (
                <Tag key={key}>{key}: {String(value)}%</Tag>
              ))}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </>
    );
  };

  return (
    <div style={{ margin: -32, padding: 32 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <BlockOutlined style={{ color: '#3B82F6' }} />
            Blockchain Explorer
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Sổ cái phân tán Hyperledger Fabric — Giám sát giao dịch P2P Lending
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={fetchData}
          loading={loading}
        >
          Làm mới
        </Button>
      </div>

      {/* ── Network Status ── */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} sm={6} md={4}>
            <Space size={12} align="center">
              <Badge status={status?.connected ? 'success' : 'error'} />
              <div>
                <Text strong style={{ fontSize: 14 }}>
                  {status?.connected ? 'Đã kết nối' : 'Mất kết nối'}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 11 }}>Trạng thái mạng</Text>
              </div>
            </Space>
          </Col>
          {networkItems.map((item, i) => (
            <Col xs={12} sm={6} md={5} key={i}>
              <div>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {item.label}
                </Text>
                <div>
                  <Tag style={{ fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {item.icon} {item.value}
                  </Tag>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ── Stats ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: 'Hợp đồng vay', value: stats?.totalLoanContracts || 0, icon: <FileProtectOutlined />, color: '#3B82F6', suffix: 'hợp đồng' },
          { title: 'Hợp đồng đầu tư', value: stats?.totalInvestmentContracts || 0, icon: <FundOutlined />, color: '#10B981', suffix: 'hợp đồng' },
          { title: 'Cấu hình đánh giá', value: stats?.totalLoanEvaluationConfigs || 0, icon: <SafetyCertificateOutlined />, color: '#DB2777', suffix: 'bản ghi' },
          { title: 'Tổng giao dịch', value: stats?.totalTransactions || 0, icon: <NodeIndexOutlined />, color: '#6366F1', suffix: 'blocks' },
          { title: 'Tổng giá trị vay', value: stats?.totalLoanVolume || 0, icon: <DollarOutlined />, color: '#F59E0B', isCurrency: true },
        ].map((s, i) => (
          <Col xs={12} md={6} key={i}>
            <Card hoverable>
              <Statistic
                title={
                  <Space size={6}>
                    {React.cloneElement(s.icon as React.ReactElement, { style: { color: s.color } })}
                    <span>{s.title}</span>
                  </Space>
                }
                value={s.isCurrency ? s.value : s.value}
                formatter={(val) => s.isCurrency ? fmt(val as number) : (val as number).toLocaleString()}
                suffix={!s.isCurrency ? s.suffix : undefined}
                valueStyle={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Contracts Table ── */}
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#3B82F6' }} />
            <span>Danh sách giao dịch trên Sổ cái</span>
            <Tag color="blue">{filteredContracts.length} / {contracts.length}</Tag>
          </Space>
        }
        extra={
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as string)}
            options={[
              { label: 'Bảng', value: 'table', icon: <DatabaseOutlined /> },
              { label: 'Dòng thời gian', value: 'timeline', icon: <HistoryOutlined /> },
            ]}
            size="small"
          />
        }
      >
        {/* Filters */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm theo mã giao dịch hoặc hash..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={5}>
            <Select
              style={{ width: '100%' }}
              value={filterType}
              onChange={setFilterType}
              options={[
                { label: 'Tất cả loại', value: 'all' },
                { label: 'Hợp đồng vay', value: 'LoanContract' },
                { label: 'Hợp đồng đầu tư', value: 'InvestmentContract' },
                { label: 'Biên lai tất toán', value: 'SettlementContract' },
                { label: 'Sự kiện ghép nối', value: 'MatchingEvent' },
                { label: 'Lệnh đầu tư', value: 'InvestmentOrder' },
                { label: 'Cấu hình đánh giá', value: 'LoanEvaluationConfig' },
              ]}
              suffixIcon={<FilterOutlined />}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Select
              style={{ width: '100%' }}
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { label: 'Tất cả trạng thái', value: 'all' },
                ...uniqueStatuses.map(s => ({
                  label: STATUS_CONFIG[s]?.label || s,
                  value: s,
                })),
              ]}
              suffixIcon={<FilterOutlined />}
            />
          </Col>
        </Row>

        {viewMode === 'table' ? (
          <Table<ContractBlock>
            columns={columns}
            dataSource={filteredContracts}
            loading={loading}
            rowKey="key"
            size="small"
            scroll={{ x: 1100 }}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              showTotal: (total) => `Tổng ${total} giao dịch`,
            }}
            onRow={(record) => ({
              onClick: () => openDetail(record),
              style: { cursor: 'pointer' },
            })}
            locale={{ emptyText: <Empty description="Chưa có giao dịch nào trên Sổ cái" /> }}
          />
        ) : (
          /* Timeline view */
          <div style={{ maxHeight: 600, overflow: 'auto', padding: '16px 0' }}>
            {filteredContracts.length === 0 ? (
              <Empty description="Chưa có giao dịch nào trên Sổ cái" />
            ) : (
              <Timeline
                items={filteredContracts.slice(0, 50).map(block => {
                  const cfg = TYPE_CONFIG[block.type] || { label: block.type, color: 'default', icon: null };
                  return {
                    color: cfg.color === 'blue' ? 'blue' : cfg.color === 'green' ? 'green' : 'orange',
                    children: (
                      <div
                        onClick={() => openDetail(block)}
                        style={{
                          cursor: 'pointer',
                          padding: '12px 16px',
                          borderRadius: 10,
                          border: `1px solid ${isDarkMode ? '#334155' : '#E2E8F0'}`,
                          background: isDarkMode ? '#1E293B' : '#FAFBFC',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#3B82F6';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.12)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = isDarkMode ? '#334155' : '#E2E8F0';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <Space size={8} style={{ marginBottom: 4 }}>
                              <Tag icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>
                              {statusTag(block.status, block.type)}
                            </Space>
                            <div style={{ maxWidth: 300 }}>
                              <Tooltip title={block.contractId}>
                                <Text
                                  strong
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 13,
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {block.contractId}
                                </Text>
                              </Tooltip>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {renderLedgerValue(block)}
                            <br />
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <ClockCircleOutlined /> {dayjs(block.createdAt).format('DD/MM/YYYY HH:mm')}
                            </Text>
                          </div>
                        </div>
                        {block.dataHash && (
                          <div style={{ marginTop: 6 }}>
                            <Text type="secondary" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                              <SafetyCertificateOutlined /> SHA-256: {truncHash(block.dataHash)}
                            </Text>
                          </div>
                        )}
                      </div>
                    ),
                  };
                })}
              />
            )}
          </div>
        )}
      </Card>

      {/* ── Detail Drawer ── */}
      <Drawer
        title={
          <Space>
            <BlockOutlined style={{ color: '#3B82F6' }} />
            <span>Chi tiết giao dịch trên Sổ cái</span>
          </Space>
        }
        placement="right"
        width={640}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setHistory([]); }}
      >
        {selectedContract && (
          <div>
            {/* Contract info */}
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Mã giao dịch">
                <Text copyable style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {selectedContract.contractId}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Loại giao dịch">
                {(() => {
                  const cfg = TYPE_CONFIG[selectedContract.type];
                  return <Tag icon={cfg?.icon} color={cfg?.color}>{cfg?.label || selectedContract.type}</Tag>;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {statusTag(selectedContract.status, selectedContract.type)}
              </Descriptions.Item>
              <Descriptions.Item label="Giá trị / Version">
                {renderLedgerValue(selectedContract)}
              </Descriptions.Item>
              <Descriptions.Item label="Data Hash (SHA-256)">
                <Text copyable style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>
                  {selectedContract.dataHash || '—'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Ghi sổ lúc">
                {selectedContract.createdAt
                  ? dayjs(selectedContract.createdAt).format('DD/MM/YYYY HH:mm:ss')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật cuối">
                {selectedContract.updatedAt
                  ? dayjs(selectedContract.updatedAt).format('DD/MM/YYYY HH:mm:ss')
                  : '—'}
              </Descriptions.Item>
            </Descriptions>

            {renderLoanEvaluationConfigSummary(selectedContract.details)}

            {/* History */}
            <Divider style={{ fontSize: 13 }}>
              <HistoryOutlined /> Lịch sử biến động trên Sổ cái
            </Divider>
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
            ) : history.length > 0 ? (
              <Timeline
                style={{ marginTop: 16 }}
                items={history.map((h: any, idx: number) => ({
                  color: idx === 0 ? 'green' : 'blue',
                  children: (
                    <div>
                      <Text strong style={{ fontSize: 12 }}>
                        Trạng thái: {h.value?.status || h.Value?.status || `Phiên bản ${history.length - idx}`}
                      </Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        TxID: {truncHash(h.txId || h.TxId)}
                      </Text>
                      {(h.timestamp || h.Timestamp) && (
                        <>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            <ClockCircleOutlined /> {dayjs(h.timestamp || h.Timestamp).format('DD/MM/YYYY HH:mm:ss')}
                          </Text>
                        </>
                      )}
                      <div style={{ marginTop: 8 }}>
                        <Collapse
                          size="small"
                          ghost
                          items={[
                            {
                              key: '1',
                              label: <Text style={{ fontSize: 11, color: '#3B82F6' }}><DatabaseOutlined /> Xem dữ liệu version này</Text>,
                              children: (
                                <pre style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  margin: 0,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  background: isDarkMode ? '#0F172A' : '#F8FAFC',
                                  padding: 8,
                                  borderRadius: 6,
                                  border: `1px solid ${isDarkMode ? '#334155' : '#E2E8F0'}`,
                                }}>
                                  {JSON.stringify(h.value || h.Value, null, 2)}
                                </pre>
                              )
                            }
                          ]}
                        />
                      </div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử biến động" />
            )}

            {/* Raw JSON */}
            <Divider style={{ fontSize: 13 }}>
              <DatabaseOutlined /> Dữ liệu thô trên Ledger
            </Divider>
            <div style={{
              background: isDarkMode ? '#0F172A' : '#F8FAFC',
              border: `1px solid ${isDarkMode ? '#334155' : '#E2E8F0'}`,
              borderRadius: 10,
              padding: 16,
              maxHeight: 360,
              overflow: 'auto',
            }}>
              <pre style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
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
    </div>
  );
}
