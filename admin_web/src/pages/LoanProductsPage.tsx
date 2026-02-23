import { useRef, useState } from 'react';
import {
  theme,
  Typography,
  Button,
  Tag,
  message,
  Tabs,
  Descriptions,
  Empty,
  Drawer,
  Checkbox,
  List,
  Space
} from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { SettingOutlined } from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { adminApi, type LoanProductDto, type DocumentTypeDto } from '../api/admin';

const { Text } = Typography;

export default function LoanProductsPage() {
  const { token } = theme.useToken();
  const actionRef = useRef<ActionType>();
  const [configProductId, setConfigProductId] = useState<number | null>(null);
  const [configProductName, setConfigProductName] = useState<string>('');
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDto[]>([]);
  const [productDocTypes, setProductDocTypes] = useState<{ documentTypeId: string; documentType: DocumentTypeDto; required: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewProductDetails, setViewProductDetails] = useState<any>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const openConfig = async (product: LoanProductDto) => {
    setConfigProductId(product.id);
    setConfigProductName(product.name);
    try {
      const [docTypes, linked] = await Promise.all([
        adminApi.getDocumentTypes(),
        adminApi.getProductDocumentTypes(product.id),
      ]);
      setDocumentTypes(docTypes);
      setProductDocTypes(linked);
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Tải cấu hình thất bại');
      setConfigProductId(null);
    }
  };

  const toggleDocType = (docTypeId: string, required: boolean) => {
    const exists = productDocTypes.some((p) => (p.documentTypeId as any)?._id === docTypeId || (p.documentTypeId as any) === docTypeId);
    if (exists) {
      setProductDocTypes((prev) => prev.filter((p) => (p.documentTypeId as any)?._id !== docTypeId && (p.documentTypeId as any) !== docTypeId));
    } else {
      setProductDocTypes((prev) => [...prev, { documentTypeId: docTypeId, documentType: documentTypes.find((d) => d._id === docTypeId)!, required }]);
    }
  };

  const setRequired = (docTypeId: string, required: boolean) => {
    setProductDocTypes((prev) =>
      prev.map((p) => ((p.documentTypeId as any)?._id === docTypeId || (p.documentTypeId as any) === docTypeId ? { ...p, required } : p))
    );
  };

  const saveConfig = async () => {
    if (configProductId == null) return;
    setSaving(true);
    try {
      const items = productDocTypes.map((p) => ({
        documentTypeId: getDocId(p),
        required: p.required,
      }));
      await adminApi.setProductDocumentTypes(configProductId, items);
      message.success('Đã lưu cấu hình tài liệu');
      setConfigProductId(null);
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const onViewDetails = async (productId: number) => {
    setLoadingDetails(true);
    setViewModalVisible(true);
    try {
      const data = await adminApi.getLoanProductDetails(productId);
      setViewProductDetails(data);
    } catch (e: any) {
      message.error('Không thể tải chi tiết sản phẩm');
      setViewModalVisible(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getDocId = (p: { documentTypeId: string | { _id: string }; documentType?: DocumentTypeDto }) =>
    typeof p.documentTypeId === 'object' && p.documentTypeId && '_id' in p.documentTypeId ? (p.documentTypeId as any)._id : (p.documentTypeId as string);

  const columns: ProColumns<LoanProductDto>[] = [
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
      title: 'Lãi suất',
      key: 'interestRatePerPeriod',
      width: 180,
      align: 'right',
      search: false,
      render: (_, record) => {
        const val = record.interestRatePerPeriod;
        if (val == null) return '-';
        const frequency = record.interestRateFrequencyType?.value?.toLowerCase() || '';
        const unit = frequency.includes('year') ? 'năm' : 'tháng';
        return <Text type="success" strong>{val}% / {unit}</Text>;
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      valueType: 'option',
      width: 300,
      align: 'right',
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            icon={<SettingOutlined />}
            onClick={() => openConfig(record)}
          >
            Cấu hình tài liệu
          </Button>
          <Button
            type="primary"
            ghost
            onClick={() => onViewDetails(record.id)}
          >
            Xem cấu hình
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ProTable<LoanProductDto>
        headerTitle="Danh sách sản phẩm vay (Fineract)"
        actionRef={actionRef}
        rowKey="id"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
        }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} sản phẩm` }}
        options={{ reload: true, density: true, fullScreen: true, setting: true }}
        columnsState={{ persistenceKey: 'loan-products-table', persistenceType: 'localStorage' }}
        request={async (params) => {
          const data = await adminApi.getLoanProducts();
          let filtered = data;
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
        columns={columns}
      />

      <Drawer
        title={`Cấu hình tài liệu: ${configProductName}`}
        open={configProductId != null}
        onClose={() => setConfigProductId(null)}
        width={Math.min(560, window.innerWidth * 0.92)}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setConfigProductId(null)}>Đóng</Button>
            <Button type="primary" loading={saving} onClick={saveConfig}>
              Lưu cấu hình
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Chọn các loại tài liệu yêu cầu khi khách hàng đăng ký gói vay này.
          </Text>
        </div>

        <List
          dataSource={documentTypes}
          renderItem={(doc) => {
            const linked = productDocTypes.find((p) => getDocId(p) === doc._id);
            return (
              <List.Item
                style={{
                  background: linked ? token.colorPrimaryBg : token.colorBgLayout,
                  padding: '12px 16px',
                  borderRadius: 8,
                  marginBottom: 8,
                  border: `1px solid ${linked ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
                  transition: 'all 0.2s ease'
                }}
              >
                <Checkbox
                  checked={!!linked}
                  onChange={() => toggleDocType(doc._id, doc.required)}
                >
                  <Text strong>{doc.name}</Text>
                </Checkbox>

                {linked && (
                  <div style={{ marginLeft: 'auto' }}>
                    <Checkbox
                      checked={linked.required}
                      onChange={(e) => setRequired(doc._id, e.target.checked)}
                    >
                      Bắt buộc nộp
                    </Checkbox>
                  </div>
                )}
              </List.Item>
            );
          }}
        />
      </Drawer>

      <Drawer
        title={`Chi tiết cấu hình: ${viewProductDetails?.name || ''}`}
        open={viewModalVisible}
        onClose={() => {
          setViewModalVisible(false);
          setViewProductDetails(null);
        }}
        width={Math.min(960, window.innerWidth * 0.92)}
        destroyOnClose
        styles={{ body: { padding: '24px' } }}
        extra={
          <Button icon={<CloseOutlined />} onClick={() => { setViewModalVisible(false); setViewProductDetails(null); }}>
            Đóng
          </Button>
        }
      >
        <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: '12px' }}>
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
                <Tag color={viewProductDetails.status?.includes('active') ? 'success' : 'warning'} style={{ padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold' }}>
                  {viewProductDetails.status?.toUpperCase()}
                </Tag>
              </div>

              <Tabs
                defaultActiveKey="general"
                type="card"
                items={[
                  {
                    key: 'general',
                    label: 'Thông tin chung',
                    children: (
                      <Descriptions bordered size="small" column={2}>
                        <Descriptions.Item label="ID">{viewProductDetails.id}</Descriptions.Item>
                        <Descriptions.Item label="Tiền tệ">{viewProductDetails.currency?.displayLabel}</Descriptions.Item>
                        <Descriptions.Item label="Bội số tiền">{viewProductDetails.currency?.inMultiplesOf}</Descriptions.Item>
                        <Descriptions.Item label="Mô tả" span={2}>{viewProductDetails.description || 'N/A'}</Descriptions.Item>

                        <Descriptions.Item label="Gốc mặc định">{viewProductDetails.principal?.toLocaleString()} {viewProductDetails.currency?.code}</Descriptions.Item>
                        <Descriptions.Item label="Gốc tối thiểu">{viewProductDetails.minPrincipal?.toLocaleString()} {viewProductDetails.currency?.code}</Descriptions.Item>
                        <Descriptions.Item label="Gốc tối đa">{viewProductDetails.maxPrincipal?.toLocaleString()} {viewProductDetails.currency?.code}</Descriptions.Item>
                      </Descriptions>
                    )
                  },
                  {
                    key: 'terms',
                    label: 'Kỳ hạn & Hoàn trả',
                    children: (
                      <Descriptions bordered size="small" column={2}>
                        <Descriptions.Item label="Số kỳ trả nợ mặc định">{viewProductDetails.numberOfRepayments}</Descriptions.Item>
                        <Descriptions.Item label="Tần suất hoàn trả">{viewProductDetails.repaymentEvery} {viewProductDetails.repaymentFrequencyType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Số kỳ tối thiểu">{viewProductDetails.minNumberOfRepayments}</Descriptions.Item>
                        <Descriptions.Item label="Số kỳ tối đa">{viewProductDetails.maxNumberOfRepayments}</Descriptions.Item>
                        <Descriptions.Item label="Loại Amortization" span={2}>{viewProductDetails.amortizationType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Hình thức trả gốc/lãi" span={2}>{viewProductDetails.transactionProcessingStrategyName}</Descriptions.Item>
                      </Descriptions>
                    )
                  },
                  {
                    key: 'interest',
                    label: 'Lãi suất',
                    children: (
                      <Descriptions bordered size="small" column={2}>
                        <Descriptions.Item label="Kiểu lãi suất" span={2}>{viewProductDetails.interestType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Chu kỳ tính lãi">{viewProductDetails.interestCalculationPeriodType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất mặc định">{viewProductDetails.interestRatePerPeriod}% / {viewProductDetails.interestRateFrequencyType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất tối thiểu">{viewProductDetails.minInterestRatePerPeriod}%</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất tối đa">{viewProductDetails.maxInterestRatePerPeriod}%</Descriptions.Item>
                        <Descriptions.Item label="Lãi suất năm">{viewProductDetails.annualInterestRate}%</Descriptions.Item>
                      </Descriptions>
                    )
                  },
                  {
                    key: 'settings',
                    label: 'Cài đặt hệ thống',
                    children: (
                      <Descriptions bordered size="small" column={2}>
                        <Descriptions.Item label="Ngày trong tháng (type)">{viewProductDetails.daysInMonthType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Ngày trong năm (type)">{viewProductDetails.daysInYearType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Đa đợt giải ngân">{viewProductDetails.multiDisburseLoan ? 'Có' : 'Không'}</Descriptions.Item>
                        <Descriptions.Item label="Hạn mức dư nợ tối đa">{viewProductDetails.outstandingLoanBalance?.toLocaleString()}</Descriptions.Item>
                        <Descriptions.Item label="Kế hoạch lịch trả nợ">{viewProductDetails.loanScheduleType?.value}</Descriptions.Item>
                        <Descriptions.Item label="Kiểu xử lý lịch">{viewProductDetails.loanScheduleProcessingType?.value}</Descriptions.Item>
                      </Descriptions>
                    )
                  },
                  {
                    key: 'recalculation',
                    label: 'Tái tính lãi',
                    children: (
                      viewProductDetails.isInterestRecalculationEnabled ? (
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="Kiểu compounding">{viewProductDetails.interestRecalculationData?.interestRecalculationCompoundingType?.value}</Descriptions.Item>
                          <Descriptions.Item label="Chiến lược tái cơ cấu">{viewProductDetails.interestRecalculationData?.rescheduleStrategyType?.value}</Descriptions.Item>
                          <Descriptions.Item label="Tần suất tái tính toán">{viewProductDetails.interestRecalculationData?.recalculationRestFrequencyType?.value}</Descriptions.Item>
                          <Descriptions.Item label="Phí trả trước">{viewProductDetails.interestRecalculationData?.preClosureInterestCalculationStrategy?.value}</Descriptions.Item>
                        </Descriptions>
                      ) : (
                        <Empty description="Tính năng tái tính toán lãi không được bật" />
                      )
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
                        color: token.colorText
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


