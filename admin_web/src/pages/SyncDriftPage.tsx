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
  message
} from 'antd';
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { adminApi, type SyncDriftLogDto } from '../api/admin';

const { Title, Text } = Typography;

export default function SyncDriftPage() {
  const { token } = theme.useToken();
  const [logs, setLogs] = useState<SyncDriftLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSyncDriftLogs(30);
      setLogs(data);
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

  const runSync = async () => {
    setSyncing(true);
    try {
      await adminApi.syncCompare();
      message.success("Đã hoàn tất so sánh dữ liệu");
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
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncing} />}
          onClick={runSync}
          loading={syncing}
          size="large"
        >
          Chạy so sánh ngay
        </Button>
      </div>

      <Alert
        message="Thông tin đồng bộ"
        description="Mỗi khi app gọi danh sách sản phẩm vay, server tự so sánh với Fineract và ghi log. Tại đây bạn xem lịch sử thay đổi để điều chỉnh cấu hình cho phù hợp."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card loading={loading} bodyStyle={{ padding: 24 }}>
        {logs.length === 0 ? (
          <Empty description="Chưa có bản ghi đồng bộ" />
        ) : (
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
                    <Space direction="vertical" style={{ width: '100%' }}>
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
                          <Text strong type="warning">Thay đổi ({log.modified.length}): </Text>
                          {log.modified.map((m) => <Tag color="warning" key={m.id}>{m.shortName || m.name || m.id}</Tag>)}
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
        )}
      </Card>
    </div>
  );
}

