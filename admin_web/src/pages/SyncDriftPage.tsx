import { useState, useEffect } from 'react';
import {
  theme,
  Typography,
  Button,
  Space,
  Card,
  Tag,
  Empty,
  Timeline,
  Alert,
  message,
  Tabs,
  Table,
  Collapse,
} from 'antd';
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, BankOutlined } from '@ant-design/icons';
import { adminApi, type SyncDriftLogDto, type ProductDiffItemDto } from '../api/admin';
import { translateValue } from '../utils/vi';

const { Title, Text } = Typography;

function fmtVal(v: any): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'object') return JSON.stringify(v);
  return translateValue(v);
}

/** Bảng báo cáo chi tiết thay đổi từng trường (cho modified) */
function FieldChangesTable({ items }: { items: ProductDiffItemDto[] }) {
  if (items.length === 0) return null;
  return (
    <Collapse
      size="small"
      items={items.map((m) => ({
        key: m.id,
        label: (
          <Space>
            <Tag color="warning">{m.shortName || m.name || m.id}</Tag>
            <Text type="secondary">{m.fieldChanges?.length ?? 0} trường thay đổi</Text>
          </Space>
        ),
        children: (
          <Table
            size="small"
            pagination={false}
            dataSource={m.fieldChanges ?? []}
            columns={[
              { title: 'Trường', dataIndex: 'label', key: 'label', width: 220 },
              { title: 'Giá trị cũ', dataIndex: 'before', key: 'before', render: (v) => fmtVal(v) },
              { title: 'Giá trị mới', dataIndex: 'after', key: 'after', render: (v) => fmtVal(v) },
            ]}
            rowKey="field"
          />
        ),
      }))}
    />
  );
}

function SyncLogList({ logs, token }: { logs: SyncDriftLogDto[]; token: any }) {
  if (logs.length === 0) {
    return <Empty description="Chưa có bản ghi đồng bộ" />;
  }
  return (
    <Timeline
      mode="left"
      items={logs.map((log) => ({
        color: log.hasDrift ? 'red' : 'green',
        label: <Text type="secondary">{new Date(log.syncedAt).toLocaleString('vi-VN')}</Text>,
        children: (
          <Card
            size="small"
            style={{
              marginBottom: 16,
              borderLeft: `4px solid ${log.hasDrift ? token.colorError : token.colorSuccess}`,
              background: token.colorBgLayout,
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ marginBottom: 8 }}>
              {log.hasDrift ? (
                <Tag icon={<ExclamationCircleOutlined />} color="error">CÓ THAY ĐỔI</Tag>
              ) : (
                <Tag icon={<CheckCircleOutlined />} color="success">ĐÃ ĐỒNG BỘ</Tag>
              )}
            </div>
            {log.hasDrift ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {log.added.length > 0 && (
                  <div>
                    <Text strong type="success">Thêm mới ({log.added.length}): </Text>
                    {log.added.map((a) => <Tag key={a.id}>{a.shortName || a.name || a.id}</Tag>)}
                  </div>
                )}
                {log.removed.length > 0 && (
                  <div>
                    <Text strong type="danger">Xóa bỏ ({log.removed.length}): </Text>
                    {log.removed.map((r) => <Tag color="error" key={r.id}>{r.shortName || r.name || r.id}</Tag>)}
                  </div>
                )}
                {log.modified.length > 0 && (
                  <div>
                    <Text strong type="warning" style={{ display: 'block', marginBottom: 8 }}>
                      Thay đổi ({log.modified.length}) - Chi tiết từng trường:
                    </Text>
                    <FieldChangesTable items={log.modified} />
                  </div>
                )}
              </Space>
            ) : (
              <Text type="secondary">Không có thay đổi dữ liệu được ghi nhận trong phiên này.</Text>
            )}
          </Card>
        ),
      }))}
    />
  );
}

export default function SyncDriftPage() {
  const { token } = theme.useToken();
  const [logs, setLogs] = useState<SyncDriftLogDto[]>([]);
  const [savingsLogs, setSavingsLogs] = useState<SyncDriftLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('loan');

  const load = async () => {
    setLoading(true);
    try {
      const [loanData, savingsData] = await Promise.all([
        adminApi.getSyncDriftLogs(30, 'loan'),
        adminApi.getSyncDriftLogs(30, 'savings'),
      ]);
      setLogs(loanData);
      setSavingsLogs(savingsData);
    } catch (e: any) {
      console.error(e);
      message.error("Không thể tải nhật ký đồng bộ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runSyncLoan = async () => {
    setSyncing(true);
    try {
      await adminApi.syncCompare();
      message.success("Đã hoàn tất so sánh sản phẩm vay");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

  const runSyncSavings = async () => {
    setSyncing(true);
    try {
      await adminApi.syncCompareSavings();
      message.success("Đã hoàn tất so sánh sản phẩm tiết kiệm");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Đồng bộ / Cảnh báo</Title>
          <Text type="secondary">
            Giám sát sự sai lệch dữ liệu giữa MongoDB Local và Fineract Central
          </Text>
        </div>
      </div>

      <Alert
        message="Thông tin đồng bộ"
        description="So sánh danh sách sản phẩm vay và sản phẩm tiết kiệm với Fineract, ghi log thay đổi. Chọn tab tương ứng và bấm nút để chạy đồng bộ."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'loan',
            label: <span><BankOutlined /> Sản phẩm vay</span>,
            children: (
              <Card loading={loading}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="primary"
                    icon={<SyncOutlined spin={syncing} />}
                    onClick={runSyncLoan}
                    loading={syncing}
                  >
                    Chạy so sánh sản phẩm vay
                  </Button>
                </div>
                <SyncLogList logs={logs} token={token} />
              </Card>
            ),
          },
          {
            key: 'savings',
            label: <span><BankOutlined /> Sản phẩm tiết kiệm</span>,
            children: (
              <Card loading={loading}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    type="primary"
                    icon={<SyncOutlined spin={syncing} />}
                    onClick={runSyncSavings}
                    loading={syncing}
                  >
                    Chạy so sánh sản phẩm tiết kiệm
                  </Button>
                </div>
                <SyncLogList logs={savingsLogs} token={token} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

