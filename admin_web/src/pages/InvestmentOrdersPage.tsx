/**
 * InvestmentOrdersPage — Quản lý lệnh đầu tư P2P
 * Layout theo chuẩn admin: PageHeader + StatFilterCards + ProTable
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Tag, Typography, message, Tooltip, theme } from 'antd';
import {
  ReloadOutlined,
  RiseOutlined,
  FundOutlined,
} from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import StatFilterCards, { type StatFilterItem } from '../components/StatFilterCards';
import { SimplePageSkeleton } from '../components/PageSkeleton';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import {
  marketApi,
  type MarketBid,
  type MatchedBid,
} from '../api/market';

const { Text } = Typography;

type TabKey = 'open' | 'closed';

function fmtNum(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}


export default function InvestmentOrdersPage() {
  const { token } = theme.useToken();
  const actionRef = useRef<ActionType>();
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [initialLoading, setInitialLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();
  const [openCount, setOpenCount] = useState(0);
  const [closedCount, setClosedCount] = useState(0);

  // ── Load counts (chỉ lấy count, ko cần data) ──
  const loadCounts = useCallback(async () => {
    try {
      const [openRes, closedRes] = await Promise.all([
        marketApi.getBids({ page: 1, pageSize: 1 }),
        marketApi.getMatchedBids({ page: 1, pageSize: 1 }),
      ]);
      setOpenCount(openRes.pagination.totalCount);
      setClosedCount(closedRes.pagination.totalCount);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadCounts().finally(() => setInitialLoading(false));
  }, [loadCounts]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as TabKey);
    actionRef.current?.reloadAndRest?.();
  };

  const handleRefresh = useCallback(() => {
    loadCounts();
    actionRef.current?.reloadAndRest?.();
  }, [loadCounts]);

  // ── Stat cards ──
  const statCards: StatFilterItem[] = [
    {
      filterKey: 'open',
      title: 'Lệnh đang mở',
      value: openCount,
      color: '#059669',
      gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
      icon: <FundOutlined />,
    },
    {
      filterKey: 'closed',
      title: 'Đã khớp đủ',
      value: closedCount,
      color: '#1E40AF',
      gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      icon: <RiseOutlined />,
    },
  ];

  // ── Open bids columns ──
  const openColumns: ProColumns<MarketBid>[] = [
    {
      title: 'Nhà đầu tư',
      dataIndex: 'investorCode',
      copyable: true,
      ellipsis: true,
      width: 180,
      render: (_, r) => (
        <div>
          <Text strong>{r.investorCode}</Text>
          {r.phone && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.phone}</Text></>}
        </div>
      ),
    },
    {
      title: 'Lãi suất',
      key: 'rate',
      width: 120,
      align: 'center',
      render: (_, r) => (
        <Text style={{ fontFeatureSettings: '"tnum"' }}>
          {r.minRate}% – {r.maxRate}%
        </Text>
      ),
    },
    {
      title: 'Tổng vốn',
      dataIndex: 'totalCapital',
      width: 150,
      align: 'right',
      sorter: true,
      render: (_, r) => <Text strong style={{ fontFeatureSettings: '"tnum"' }}>{fmtNum(r.totalCapital)}</Text>,
    },
    {
      title: 'Vốn khả dụng',
      dataIndex: 'availableCapital',
      width: 150,
      align: 'right',
      sorter: true,
      render: (_, r) => (
        <Text strong style={{ color: token.colorSuccess, fontFeatureSettings: '"tnum"' }}>
          {fmtNum(r.availableCapital)}
        </Text>
      ),
    },
    {
      title: 'Đã khớp',
      dataIndex: 'matchedCapital',
      width: 140,
      align: 'right',
      render: (_, r) => <Text type="secondary" style={{ fontFeatureSettings: '"tnum"' }}>{fmtNum(r.matchedCapital)}</Text>,
    },
    {
      title: 'Nodes còn',
      dataIndex: 'remainingNodes',
      width: 100,
      align: 'center',
      render: (_, r) => <Tag color="blue" style={{ fontWeight: 600 }}>{r.remainingNodes}N</Tag>,
    },
    {
      title: 'Mục đích',
      dataIndex: 'purpose',
      width: 140,
      ellipsis: true,
      render: (_, r) => r.purpose?.length > 0 ? r.purpose.join(', ') : <Text type="secondary">–</Text>,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      width: 140,
      sorter: true,
      render: (_, r) => {
        const d = new Date(r.createdAt);
        return <Text type="secondary" style={{ fontSize: 13, fontFeatureSettings: '"tnum"' }}>{d.toLocaleDateString('vi-VN')} {d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>;
      },
    },
    {
      title: 'Hành động',
      valueType: 'option',
      width: 100,
      fixed: 'right',
      render: (_, r) => [
        <Link key="view" to={`/investment-orders/${r.id}`}>Chi tiết</Link>
      ],
    },
  ];

  // ── Closed bids columns ──
  const closedColumns: ProColumns<MatchedBid>[] = [
    {
      title: 'Nhà đầu tư',
      dataIndex: 'investorCode',
      copyable: true,
      ellipsis: true,
      width: 180,
      render: (_, r) => (
        <div>
          <Text strong>{r.investorCode}</Text>
          {r.phone && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.phone}</Text></>}
        </div>
      ),
    },
    {
      title: 'Lãi suất',
      dataIndex: 'rate',
      width: 100,
      align: 'center',
      sorter: true,
      render: (_, r) => <Text style={{ fontFeatureSettings: '"tnum"' }}>{r.rate}%</Text>,
    },
    {
      title: 'Vốn đã khớp',
      dataIndex: 'matchedCapital',
      width: 160,
      align: 'right',
      sorter: true,
      render: (_, r) => (
        <Text strong style={{ color: token.colorSuccess, fontFeatureSettings: '"tnum"' }}>
          {fmtNum(r.matchedCapital)}
        </Text>
      ),
    },
    {
      title: 'Tổng vốn',
      dataIndex: 'totalCapital',
      width: 160,
      align: 'right',
      render: (_, r) => <Text style={{ fontFeatureSettings: '"tnum"' }}>{fmtNum(r.totalCapital)}</Text>,
    },
    {
      title: 'Nodes',
      dataIndex: 'nodes',
      width: 100,
      align: 'center',
      render: (_, r) => <Tag color="blue" style={{ fontWeight: 600 }}>{r.nodes}</Tag>,
    },
    {
      title: 'Thời gian khớp',
      dataIndex: 'matchedAt',
      width: 160,
      sorter: true,
      render: (_, r) => {
        const d = new Date(r.matchedAt);
        return <Text type="secondary" style={{ fontSize: 13, fontFeatureSettings: '"tnum"' }}>{d.toLocaleDateString('vi-VN')} {d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>;
      },
    },
    {
      title: 'Hành động',
      valueType: 'option',
      width: 100,
      fixed: 'right',
      render: (_, r) => [
        <Link key="view" to={`/investment-orders/${r.id}`}>Chi tiết</Link>
      ],
    },
  ];

  // ── Fetch data (ProTable request) ──
  const fetchOpenBids = useCallback(async (params: any) => {
    try {
      const page = params.current ?? 1;
      const pageSize = params.pageSize ?? 15;
      const sortBy = params.sort?.totalCapital ? 'capital'
        : params.sort?.availableCapital ? 'capital'
          : params.sort?.createdAt ? 'createdAt' : 'createdAt';
      const order = params.sort?.[Object.keys(params.sort || {})[0]] === 'ascend' ? 'asc' as const : 'desc' as const;

      const res = await marketApi.getBids({
        page,
        pageSize,
        sortBy,
        order,
        q: params.keyword?.trim() || undefined,
      });
      return {
        data: res.bids,
        success: true,
        total: res.pagination.totalCount,
      };
    } catch (e: any) {
      messageApi.error(e?.response?.data?.message ?? 'Không thể tải dữ liệu');
      return { data: [], success: false, total: 0 };
    }
  }, [messageApi]);

  const fetchClosedBids = useCallback(async (params: any) => {
    try {
      const page = params.current ?? 1;
      const pageSize = params.pageSize ?? 15;
      const sortBy = params.sort?.matchedCapital ? 'matchedCapital'
        : params.sort?.rate ? 'interestRange.max'
          : params.sort?.matchedAt ? 'updatedAt' : 'updatedAt';
      const order = params.sort?.[Object.keys(params.sort || {})[0]] === 'ascend' ? 'asc' as const : 'desc' as const;

      const res = await marketApi.getMatchedBids({
        page,
        pageSize,
        sortBy,
        order,
        q: params.keyword?.trim() || undefined,
      });
      return {
        data: res.bids,
        success: true,
        total: res.pagination.totalCount,
      };
    } catch (e: any) {
      messageApi.error(e?.response?.data?.message ?? 'Không thể tải dữ liệu');
      return { data: [], success: false, total: 0 };
    }
  }, [messageApi]);

  if (initialLoading) {
    return (
      <div>
        <PageHeader
          title="Quản lý lệnh đầu tư"
          description="Theo dõi và quản lý tất cả lệnh đầu tư trên hệ thống P2P"
          breadcrumb={[{ label: 'Bảng khớp lệnh', path: '/market' }, { label: 'Lệnh đầu tư' }]}
        />
        <SimplePageSkeleton rows={6} columns={6} />
      </div>
    );
  }

  return (
    <>
      {contextHolder}
      <PageHeader
        title="Quản lý lệnh đầu tư"
        description="Theo dõi và quản lý tất cả lệnh đầu tư trên hệ thống P2P"
        breadcrumb={[{ label: 'Bảng khớp lệnh', path: '/market' }, { label: 'Lệnh đầu tư' }]}
        extra={
          <Tooltip title="Làm mới dữ liệu">
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>Làm mới</Button>
          </Tooltip>
        }
      />

      <StatFilterCards
        items={statCards}
        activeKey={activeTab}
        onChange={handleTabChange}
        colSpan={{ xs: 12, sm: 12, md: 8, lg: 6 }}
      />

      {activeTab === 'open' ? (
        <ProTable<MarketBid>
          {...PRO_TABLE_DEFAULTS}
          headerTitle={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FundOutlined style={{ fontSize: 20, color: token.colorSuccess }} />
              <span>Lệnh đầu tư đang mở</span>
            </div>
          }
          actionRef={actionRef}
          rowKey="id"
          request={fetchOpenBids}
          columns={openColumns}
          search={{
            labelWidth: 'auto',
            defaultCollapsed: true,
          }}
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} lệnh đầu tư`,
            showQuickJumper: true,
          }}
          options={{
            reload: true,
            density: true,
            fullScreen: true,
            setting: true,
            search: true,
          }}
          columnsState={{
            persistenceKey: 'investment-orders-open-table',
            persistenceType: 'localStorage',
          }}
          scroll={{ x: 1200 }}
        />
      ) : (
        <ProTable<MatchedBid>
          {...PRO_TABLE_DEFAULTS}
          headerTitle={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <RiseOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
              <span>Lệnh đầu tư đã khớp đủ</span>
            </div>
          }
          actionRef={actionRef}
          rowKey="id"
          request={fetchClosedBids}
          columns={closedColumns}
          search={{
            labelWidth: 'auto',
            defaultCollapsed: true,
          }}
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} lệnh đã khớp`,
            showQuickJumper: true,
          }}
          options={{
            reload: true,
            density: true,
            fullScreen: true,
            setting: true,
            search: true,
          }}
          columnsState={{
            persistenceKey: 'investment-orders-closed-table',
            persistenceType: 'localStorage',
          }}
          scroll={{ x: 900 }}
        />
      )}
    </>
  );
}
