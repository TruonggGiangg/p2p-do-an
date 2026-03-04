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
} from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { adminApi, type SavingsProductDto } from '../api/admin';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import { ProductDetailTable } from '../utils/productDetailTable';
import { translateValue } from '../utils/vi';

const { Text } = Typography;

export default function SavingsProductsPage() {
  const { token } = theme.useToken();
  const actionRef = useRef<ActionType>();
  const [viewProductDetails, setViewProductDetails] = useState<any>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const onViewDetails = async (productId: number) => {
    setLoadingDetails(true);
    setViewModalVisible(true);
    try {
      const data = await adminApi.getSavingsProductDetails(productId);
      setViewProductDetails(data);
    } catch (e: any) {
      message.error('Không thể tải chi tiết sản phẩm');
      setViewModalVisible(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const columns: ProColumns<SavingsProductDto>[] = [
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
      key: 'nominalAnnualInterestRate',
      width: 140,
      align: 'right',
      search: false,
      render: (_, record) => {
        const val = record.nominalAnnualInterestRate;
        if (val == null) return '-';
        return <Text type="success" strong>{val}% / năm</Text>;
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
      <ProTable<SavingsProductDto>
        {...PRO_TABLE_DEFAULTS}
        headerTitle="Danh sách sản phẩm tiết kiệm (Fineract)"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
        }}
        scroll={{ x: 800 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} sản phẩm` }}
        options={{ reload: true, density: true, fullScreen: true, setting: true }}
        columnsState={{ persistenceKey: 'savings-products-table', persistenceType: 'localStorage' }}
        request={async (params) => {
          const data = await adminApi.getSavingsProducts();
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
        postData={(data: SavingsProductDto[]) => (data || []).filter((r: SavingsProductDto) => r && r.id != null)}
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
                <Tag color={viewProductDetails.status?.includes?.('active') || (typeof viewProductDetails.status === 'object' && viewProductDetails.status?.value?.toLowerCase?.().includes?.('active')) ? 'success' : 'warning'} style={{ padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold' }}>
                  {translateValue(typeof viewProductDetails.status === 'object' ? viewProductDetails.status?.value ?? viewProductDetails.status?.code : viewProductDetails.status)}
                </Tag>
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
                        <Descriptions.Item label="Tiền tệ">{viewProductDetails.currency?.displayLabel || viewProductDetails.currency?.code || 'Không có'}</Descriptions.Item>
                        <Descriptions.Item label="Mô tả" span={2}>{viewProductDetails.description || 'Không có'}</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất danh nghĩa năm">{viewProductDetails.nominalAnnualInterestRate ?? '-'}%</Descriptions.Item>
                        <Descriptions.Item label="Số chữ số thập phân">{viewProductDetails.digitsAfterDecimal ?? 0}</Descriptions.Item>
                        <Descriptions.Item label="Cho phép thấu chi">{viewProductDetails.allowOverdraft ? 'Có' : 'Không'}</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất thấu chi">{viewProductDetails.nominalAnnualInterestRateOverdraft ?? '-'}%</Descriptions.Item>
                        <Descriptions.Item label="Số dư tối thiểu bắt buộc">{viewProductDetails.enforceMinRequiredBalance ? 'Có' : 'Không'}</Descriptions.Item>
                        <Descriptions.Item label="Phí rút khi chuyển khoản">{viewProductDetails.withdrawalFeeForTransfers ? 'Có' : 'Không'}</Descriptions.Item>
                      </Descriptions>
                    )
                  },
                  {
                    key: 'report',
                    label: 'Bảng báo cáo chi tiết',
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
