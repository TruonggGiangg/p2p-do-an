import { useRef, useState } from 'react';
import {
  theme,
  Typography,
  Button,
  Tag,
  message,
  Descriptions,
  Empty,
  Drawer,
  Tabs,
  Space,
} from 'antd';
import { CloseOutlined, SyncOutlined } from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { adminApi, type FDProductDto } from '../api/admin';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import PageHeader from '../components/PageHeader';
import { ProductDetailTable } from '../utils/productDetailTable';
import { translateValue } from '../utils/vi';

const { Text } = Typography;

const TERM_TYPE_MAP: Record<number, string> = {
  0: 'Ngày',
  1: 'Tuần',
  2: 'Tháng',
  3: 'Năm',
};

function formatCurrency(val?: number) {
  if (val == null) return '-';
  return val.toLocaleString('vi-VN') + ' ₫';
}

export default function FDProductsPage() {
  const { token } = theme.useToken();
  const actionRef = useRef<ActionType>();
  const [viewProductDetails, setViewProductDetails] = useState<any>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const onViewDetails = async (productId: number) => {
    setLoadingDetails(true);
    setViewModalVisible(true);
    try {
      const data = await adminApi.getFDProductDetails(productId);
      setViewProductDetails(data);
    } catch (e: any) {
      message.error('Không thể tải chi tiết sản phẩm');
      setViewModalVisible(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await adminApi.syncCompareFD();
      const total = (result.added?.length || 0) + (result.removed?.length || 0) + (result.modified?.length || 0);
      if (total === 0) {
        message.success('Đồng bộ hoàn tất — không có thay đổi');
      } else {
        message.info(`Đồng bộ: +${result.added?.length || 0} mới, ~${result.modified?.length || 0} thay đổi, -${result.removed?.length || 0} xóa`);
      }
      actionRef.current?.reload();
    } catch (e: any) {
      message.error('Đồng bộ thất bại: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setSyncing(false);
    }
  };

  const columns: ProColumns<FDProductDto>[] = [
    {
      title: 'Mã sản phẩm',
      dataIndex: 'shortName',
      key: 'shortName',
      width: 140,
      align: 'center',
      copyable: true,
      search: { transform: (v) => v?.trim() || undefined },
      fieldProps: { placeholder: 'Mã SP...' },
      sorter: (a, b) => (a.shortName || '').localeCompare(b.shortName || ''),
      render: (text) => <Tag color="blue" style={{ fontFamily: 'monospace' }}>{text}</Tag>,
    },
    {
      title: 'Tên sản phẩm',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      search: { transform: (v) => v?.trim() || undefined },
      fieldProps: { placeholder: 'Tên sản phẩm...' },
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Lãi suất năm',
      key: 'interestRate',
      width: 140,
      align: 'right',
      search: false,
      render: (_, record) => {
        const val = (record as any).interestRate ?? record.nominalAnnualInterestRate;
        if (val == null) return '-';
        return <Text type="success" strong>{val}% / năm</Text>;
      },
    },
    {
      title: 'Kỳ hạn',
      key: 'term',
      width: 180,
      align: 'center',
      search: false,
      render: (_, record) => {
        const unit = TERM_TYPE_MAP[record.minDepositTermType ?? 2] || 'Tháng';
        const min = record.minDepositTerm;
        const max = record.maxDepositTerm;
        if (min != null && max != null) return <Text>{min} – {max} {unit}</Text>;
        if (min != null) return <Text>≥ {min} {unit}</Text>;
        if (max != null) return <Text>≤ {max} {unit}</Text>;
        return '-';
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      valueType: 'option',
      fixed: 'right',
      width: 140,
      align: 'right',
      render: (_, record) => (
        <Button
          size="small"
          type="primary"
          ghost
          onClick={() => onViewDetails(record.id)}
          style={{ fontSize: 12 }}
        >
          Xem cấu hình
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sản phẩm quỹ đầu tư có kỳ hạn"
        description="Danh sách sản phẩm Fixed Deposit đồng bộ từ Fineract — phục vụ quản lý quỹ đầu tư cho nhà đầu tư"
        breadcrumb={[{ label: 'Sản phẩm quỹ đầu tư có kỳ hạn' }]}
      />
      <ProTable<FDProductDto>
        {...PRO_TABLE_DEFAULTS}
        headerTitle="Danh sách sản phẩm quỹ đầu tư có kỳ hạn (Fineract)"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
        }}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} sản phẩm` }}
        options={{ reload: true, density: true, fullScreen: true, setting: true }}
        columnsState={{ persistenceKey: 'fd-products-table', persistenceType: 'localStorage' }}
        toolBarRender={() => [
          <Button
            key="sync"
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSync}
          >
            Đồng bộ Fineract
          </Button>,
        ]}
        request={async (params) => {
          const data = await adminApi.getFDProducts();
          let filtered = (data || []).filter(Boolean).filter((i) => i && i.id != null);
          const name = (params.name as string)?.toLowerCase?.()?.trim?.();
          if (name) filtered = filtered.filter((i) => (i.name || '').toLowerCase().includes(name));
          const short = (params.shortName as string)?.toLowerCase?.()?.trim?.();
          if (short) filtered = filtered.filter((i) => (i.shortName || '').toLowerCase().includes(short));
          const page = params.current ?? 1;
          const size = params.pageSize ?? 10;
          const start = (page - 1) * size;
          const paged = filtered.slice(start, start + size);
          return { data: paged, success: true, total: filtered.length };
        }}
        postData={(data: FDProductDto[]) => (data || []).filter((r: FDProductDto) => r && r.id != null)}
        columns={columns}
      />

      <Drawer
        title={`Chi tiết cấu hình: ${viewProductDetails?.name || ''}`}
        open={viewModalVisible}
        onClose={() => {
          setViewModalVisible(false);
          setViewProductDetails(null);
        }}
        width={Math.min(1100, window.innerWidth * 0.95)}
        destroyOnClose
        styles={{ body: { padding: '24px', overflowX: 'auto' } }}
        extra={
          <Button icon={<CloseOutlined />} onClick={() => { setViewModalVisible(false); setViewProductDetails(null); }}>
            Đóng
          </Button>
        }
      >
        <div style={{ maxHeight: '72vh', overflowY: 'auto', overflowX: 'auto', paddingRight: '12px', minWidth: 0 }}>
          {loadingDetails ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>Đang tải cấu hình chi tiết...</div>
          ) : !viewProductDetails ? (
            <Empty description="Không có dữ liệu cấu hình" />
          ) : (
            <>
              <div style={{
                background: token.colorFillAlter,
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: `1px solid ${token.colorBorderSecondary}`
              }}>
                <div>
                  <div style={{ color: token.colorTextSecondary, fontSize: '12px', textTransform: 'uppercase' }}>Mã sản phẩm</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{viewProductDetails.name} <Text type="secondary" style={{ fontSize: '14px', fontWeight: 'normal' }}>({viewProductDetails.shortName})</Text></div>
                </div>
                <Space>
                  {viewProductDetails.preClosurePenalApplicable && (
                    <Tag color="orange">Có phạt tất toán sớm</Tag>
                  )}
                  <Tag color="success" style={{ padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold' }}>
                    Quỹ đầu tư có kỳ hạn
                  </Tag>
                </Space>
              </div>

              <Tabs
                defaultActiveKey="summary"
                type="card"
                items={[
                  {
                    key: 'summary',
                    label: 'Tóm tắt',
                    children: (
                      <Descriptions bordered size="small" column={2}>
                        <Descriptions.Item label="ID">{viewProductDetails.id}</Descriptions.Item>
                        <Descriptions.Item label="Tiền tệ">{viewProductDetails.currency?.displayLabel || viewProductDetails.currency?.code || 'VND'}</Descriptions.Item>
                        <Descriptions.Item label="Mô tả" span={2}>{viewProductDetails.description || 'Không có'}</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất đầu tư">
                          <Text type="success" strong>
                            {(() => {
                              const chart = viewProductDetails.activeChart || viewProductDetails.interestRateCharts?.[0];
                              const rate = chart?.chartSlabs?.[0]?.annualInterestRate;
                              return rate != null ? `${rate}%` : `${viewProductDetails.nominalAnnualInterestRate ?? '-'}%`;
                            })()}
                          </Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Loại lãi suất">{translateValue(viewProductDetails.interestCompoundingPeriodType?.value || '-')}</Descriptions.Item>
                        <Descriptions.Item label="Kỳ hạn tối thiểu">{viewProductDetails.minDepositTerm ?? '-'} {TERM_TYPE_MAP[viewProductDetails.minDepositTermTypeId] || 'tháng'}</Descriptions.Item>
                        <Descriptions.Item label="Kỳ hạn tối đa">{viewProductDetails.maxDepositTerm ?? '-'} {TERM_TYPE_MAP[viewProductDetails.maxDepositTermTypeId] || 'tháng'}</Descriptions.Item>
                        <Descriptions.Item label="Tiền gửi tối thiểu">{formatCurrency(viewProductDetails.minDepositAmount)}</Descriptions.Item>
                        <Descriptions.Item label="Tiền gửi tối đa">{formatCurrency(viewProductDetails.maxDepositAmount)}</Descriptions.Item>
                        <Descriptions.Item label="Phạt tất toán sớm">{viewProductDetails.preClosurePenalApplicable ? 'Có' : 'Không'}</Descriptions.Item>
                        <Descriptions.Item label="Tỷ lệ phạt">{viewProductDetails.preClosurePenalInterest ?? '-'}%</Descriptions.Item>
                      </Descriptions>
                    )
                  },
                  {
                    key: 'charts',
                    label: 'Bảng lãi suất',
                    children: (viewProductDetails.interestRateCharts || viewProductDetails.charts)?.length > 0 ? (
                      <Descriptions bordered size="small" column={1}>
                        {(viewProductDetails.interestRateCharts || viewProductDetails.charts).map((chart: any, idx: number) => (
                          <Descriptions.Item key={idx} label={chart.name || `Biểu đồ ${idx + 1}`}>
                            {chart.chartSlabs?.map((slab: any, si: number) => (
                              <div key={si} style={{ marginBottom: 4 }}>
                                Từ {slab.fromPeriod ?? 0}{slab.toPeriod ? ` – ${slab.toPeriod}` : '+'} tháng: <Text strong type="success">{slab.annualInterestRate}% / năm</Text>
                                {slab.description && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>({slab.description})</Text>}
                              </div>
                            )) || 'Không có dữ liệu'}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                    ) : <Empty description="Chưa cấu hình biểu đồ lãi suất" />,
                  },
                  {
                    key: 'report',
                    label: 'Báo cáo chi tiết',
                    children: (
                      <ProductDetailTable product={viewProductDetails} />
                    )
                  },
                  {
                    key: 'raw',
                    label: 'Dữ liệu thô',
                    children: (
                      <pre style={{
                        background: token.colorFillAlter,
                        padding: 16,
                        borderRadius: 8,
                        fontSize: '11px',
                        maxHeight: '400px',
                        overflow: 'auto',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        color: token.colorText,
                        marginTop: 0
                      }}>
                        {JSON.stringify(viewProductDetails, null, 2)}
                      </pre>
                    )
                  }
                ]}
              />
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
