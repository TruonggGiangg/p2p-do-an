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
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, BankOutlined, FileTextOutlined } from '@ant-design/icons';
import { adminApi, type SyncDriftLogDto, type ProductDiffItemDto, type LoanSyncRunDto, type LoanSyncRunDetailDto } from '../api/admin';
import { translateValue } from '../utils/vi';
import PageHeader from '../components/PageHeader';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';

const { Text } = Typography;

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
            size="middle"
            pagination={false}
            dataSource={m.fieldChanges ?? []}
            columns={[
              { title: 'Trường', dataIndex: 'label', key: 'label', width: 220, render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
              { title: 'Giá trị cũ', dataIndex: 'before', key: 'before', render: (v) => <Tag color="red" style={{ margin: 0 }}>{fmtVal(v)}</Tag> },
              { title: 'Giá trị mới', dataIndex: 'after', key: 'after', render: (v) => <Tag color="green" style={{ margin: 0 }}>{fmtVal(v)}</Tag> },
            ]}
            rowKey="field"
          />
        ),
      }))}
    />
  );
}

/** Chi tiết một khoản vay trong lần đồng bộ */
function LoanSyncDetailRow({ d }: { d: LoanSyncRunDetailDto }) {
  const hasChanges = d.changes && d.changes.length > 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <Space>
        <Tag color={d.status === 'synced' ? 'green' : d.status === 'error' ? 'red' : 'default'}>
          {d.fineractLoanId}
        </Tag>
        <Tag>{d.status === 'synced' ? 'Đã đồng bộ' : d.status === 'skipped' ? 'Bỏ qua' : 'Lỗi'}</Tag>
        {d.message && <Text type="secondary">{d.message}</Text>}
      </Space>
      {hasChanges && (
        <Table
          size="middle"
          pagination={false}
          style={{ marginTop: 8 }}
          dataSource={d.changes!}
          columns={[
            { title: 'Trường', dataIndex: 'label', key: 'label', width: 200, render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
            { title: 'Trước', dataIndex: 'before', key: 'before', render: (v) => <Tag color="red" style={{ margin: 0 }}>{fmtVal(v)}</Tag> },
            { title: 'Sau', dataIndex: 'after', key: 'after', render: (v) => <Tag color="green" style={{ margin: 0 }}>{fmtVal(v)}</Tag> },
          ]}
          rowKey="field"
        />
      )}
    </div>
  );
}

/** Danh sách lần chạy đồng bộ khoản vay với chi tiết từng thay đổi */
function LoanSyncRunsList({ runs, token }: { runs: LoanSyncRunDto[]; token: any }) {
  if (runs.length === 0) {
    return <Empty description="Chưa có lần chạy đồng bộ khoản vay" />;
  }
  return (
    <Timeline
      mode="left"
      items={runs.map((run) => ({
        color: run.errorCount > 0 ? 'red' : 'green',
        label: (
          <Text type="secondary">
            {new Date(run.ranAt).toLocaleString('vi-VN')} · {run.trigger === 'manual' ? 'Thủ công' : 'Tự động'}
          </Text>
        ),
        children: (
          <Card
            size="small"
            style={{
              marginBottom: 16,
              borderLeft: `4px solid ${run.errorCount > 0 ? token.colorError : token.colorSuccess}`,
              background: token.colorBgLayout,
            }}
          >
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag>Fineract: {run.totalFromFineract}</Tag>
              <Tag color="green">Đồng bộ: {run.synced}</Tag>
              {run.skipped > 0 && <Tag color="default">Bỏ qua: {run.skipped}</Tag>}
              {run.errorCount > 0 && <Tag color="error">Lỗi: {run.errorCount}</Tag>}
            </Space>
            {run.details && run.details.length > 0 && (
              <Collapse
                size="small"
                items={[
                  {
                    key: 'details',
                    label: `Chi tiết ${run.details.length} khoản vay`,
                    children: run.details.map((d, i) => (
                      <LoanSyncDetailRow key={`${d.fineractLoanId}-${i}`} d={d} />
                    )),
                  },
                ]}
              />
            )}
          </Card>
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
  const ability = useAbility(AbilityContext);
  const [logs, setLogs] = useState<SyncDriftLogDto[]>([]);
  const [savingsLogs, setSavingsLogs] = useState<SyncDriftLogDto[]>([]);
  const [loanSyncRuns, setLoanSyncRuns] = useState<LoanSyncRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingLoans, setSyncingLoans] = useState(false);
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

  const loadLoanSyncRuns = async () => {
    setLoadingLoans(true);
    try {
      const data = await adminApi.getLoanSyncRuns(30);
      setLoanSyncRuns(data ?? []);
    } catch (e: any) {
      console.error(e);
      message.error("Không thể tải lịch sử đồng bộ khoản vay");
    } finally {
      setLoadingLoans(false);
    }
  };

  useEffect(() => {
    load();
    loadLoanSyncRuns();
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

  const runSyncDisbursedLoans = async () => {
    setSyncingLoans(true);
    try {
      const result = await adminApi.syncDisbursedLoans(300);
      message.success(
        `Đồng bộ xong: ${result.synced} đồng bộ, ${result.skipped} bỏ qua, ${result.errors} lỗi${result.runId ? ` (runId: ${result.runId})` : ''}`
      );
      loadLoanSyncRuns();
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'Đồng bộ khoản vay thất bại');
    } finally {
      setSyncingLoans(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Đồng bộ / Cảnh báo"
        description="Giám sát sự sai lệch dữ liệu giữa MongoDB Local và Fineract Central"
        breadcrumb={[{ label: 'Đồng bộ / Cảnh báo' }]}
      />

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
                  {ability.can(Action.Manage, 'SyncDrift') && (
                    <Button
                      type="primary"
                      icon={<SyncOutlined spin={syncing} />}
                      onClick={runSyncLoan}
                      loading={syncing}
                    >
                      Chạy so sánh sản phẩm vay
                    </Button>
                  )}
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
                  {ability.can(Action.Manage, 'SyncDrift') && (
                    <Button
                      type="primary"
                      icon={<SyncOutlined spin={syncing} />}
                      onClick={runSyncSavings}
                      loading={syncing}
                    >
                      Chạy so sánh sản phẩm tiết kiệm
                    </Button>
                  )}
                </div>
                <SyncLogList logs={savingsLogs} token={token} />
              </Card>
            ),
          },
          {
            key: 'loans',
            label: <span><FileTextOutlined /> Khoản vay</span>,
            children: (
              <Card loading={loadingLoans}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  {ability.can(Action.Manage, 'SyncDrift') && (
                    <Button
                      type="primary"
                      icon={<SyncOutlined spin={syncingLoans} />}
                      onClick={runSyncDisbursedLoans}
                      loading={syncingLoans}
                    >
                      Chạy đồng bộ khoản vay
                    </Button>
                  )}
                </div>
                <LoanSyncRunsList runs={loanSyncRuns} token={token} />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

