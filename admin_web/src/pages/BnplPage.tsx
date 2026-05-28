import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Select } from 'antd';
import PageHeader from '../components/PageHeader';
import {
  adminApi,
  type BnplApplicationDto,
  type BnplDashboardSummaryDto,
  type BnplInterestType,
  type BnplLoanDto,
  type BnplPolicyConfigDto,
  type BnplWalletDto,
} from '../api/admin';

const FMT = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

const STATUS_COLORS: Record<string, string> = {
  submitted: 'processing',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
};

const INTEREST_OPTIONS: Array<{ label: string; value: BnplInterestType }> = [
  { label: 'Dư nợ giảm dần', value: 'declining_balance' },
  { label: 'Lãi phẳng', value: 'flat' },
];

type BnplPolicyForm = Omit<
  BnplPolicyConfigDto,
  '_id' | 'version' | 'configHash' | 'blockchainTxHash' | 'changedBy' | 'createdAt' | 'updatedAt'
>;

const DEFAULT_POLICY: BnplPolicyForm = {
  loanProductId: 1,
  creditLimit: 5_000_000,
  defaultRepayments: 3,
  minRepayments: 1,
  maxRepayments: 12,
  minAmount: 500_000,
  maxAmount: 50_000_000,
  monthlyRate: 1.5,
  interestType: 'declining_balance',
  lateFeeRate: 0,
  lateFeeFlat: 0,
  gracePeriodDays: 0,
  maxActiveLoans: 3,
  allowEarlyRepayment: true,
  currencyMultiples: 1_000,
  changeNote: '',
};

export default function BnplPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [applications, setApplications] = useState<BnplApplicationDto[]>([]);
  const [wallets, setWallets] = useState<BnplWalletDto[]>([]);
  const [loans, setLoans] = useState<BnplLoanDto[]>([]);
  const [dashboard, setDashboard] = useState<BnplDashboardSummaryDto | null>(null);
  const [policy, setPolicy] = useState<BnplPolicyConfigDto | null>(null);
  const [policyHistory, setPolicyHistory] = useState<BnplPolicyConfigDto[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<BnplApplicationDto | null>(null);
  const [approvedLimit, setApprovedLimit] = useState<number>(0);
  const [rejectReason, setRejectReason] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [walletActionLoading, setWalletActionLoading] = useState(false);
  const [loanActionLoading, setLoanActionLoading] = useState(false);
  const [form] = Form.useForm<BnplPolicyForm>();

  const currentPolicy = useMemo<BnplPolicyForm>(() => {
    if (!policy) return DEFAULT_POLICY;
    return {
      loanProductId: policy.loanProductId,
      creditLimit: policy.creditLimit,
      defaultRepayments: policy.defaultRepayments,
      minRepayments: policy.minRepayments,
      maxRepayments: policy.maxRepayments,
      minAmount: policy.minAmount,
      maxAmount: policy.maxAmount,
      monthlyRate: policy.monthlyRate,
      interestType: policy.interestType,
      lateFeeRate: policy.lateFeeRate ?? 0,
      lateFeeFlat: policy.lateFeeFlat ?? 0,
      gracePeriodDays: policy.gracePeriodDays ?? 0,
      maxActiveLoans: policy.maxActiveLoans ?? 3,
      allowEarlyRepayment: policy.allowEarlyRepayment ?? true,
      currencyMultiples: policy.currencyMultiples ?? 1_000,
      changeNote: policy.changeNote ?? '',
    };
  }, [policy]);

  const loadApplications = useCallback(async () => {
    try {
      setLoadingApps(true);
      const items = await adminApi.getBnplApplications();
      setApplications(items || []);
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Không tải được danh sách hồ sơ BNPL');
    } finally {
      setLoadingApps(false);
    }
  }, [messageApi]);

  const loadWallets = useCallback(async () => {
    try {
      setLoadingWallets(true);
      const items = await adminApi.getBnplWallets();
      setWallets(items || []);
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Không tải được danh sách ví BNPL');
    } finally {
      setLoadingWallets(false);
    }
  }, [messageApi]);

  const loadLoans = useCallback(async () => {
    try {
      setLoadingLoans(true);
      const items = await adminApi.getBnplLoans();
      setLoans(items || []);
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Không tải được danh sách khoản BNPL');
    } finally {
      setLoadingLoans(false);
    }
  }, [messageApi]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoadingDashboard(true);
      const data = await adminApi.getBnplDashboardSummary();
      setDashboard(data || null);
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Không tải được dashboard BNPL');
    } finally {
      setLoadingDashboard(false);
    }
  }, [messageApi]);

  const loadPolicy = useCallback(async () => {
    try {
      setLoadingPolicy(true);
      const data = await adminApi.getBnplPolicyConfig();
      setPolicy(data);
      form.setFieldsValue({
        loanProductId: data.loanProductId,
        creditLimit: data.creditLimit,
        defaultRepayments: data.defaultRepayments,
        minRepayments: data.minRepayments,
        maxRepayments: data.maxRepayments,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        monthlyRate: data.monthlyRate,
        interestType: data.interestType,
        lateFeeRate: data.lateFeeRate ?? 0,
        lateFeeFlat: data.lateFeeFlat ?? 0,
        gracePeriodDays: data.gracePeriodDays ?? 0,
        maxActiveLoans: data.maxActiveLoans ?? 3,
        allowEarlyRepayment: data.allowEarlyRepayment ?? true,
        currencyMultiples: data.currencyMultiples ?? 1_000,
        changeNote: data.changeNote ?? '',
      });
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Không tải được policy BNPL');
      form.setFieldsValue(DEFAULT_POLICY);
    } finally {
      setLoadingPolicy(false);
    }
  }, [form, messageApi]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const items = await adminApi.getBnplPolicyConfigHistory();
      setPolicyHistory(items || []);
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Không tải được lịch sử policy BNPL');
    } finally {
      setHistoryLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    loadApplications();
    loadWallets();
    loadLoans();
    loadDashboard();
    loadPolicy();
  }, [loadApplications, loadDashboard, loadLoans, loadPolicy, loadWallets]);

  useEffect(() => {
    form.setFieldsValue(currentPolicy);
  }, [currentPolicy, form]);

  const openApplicationDrawer = (app: BnplApplicationDto) => {
    setSelectedApp(app);
    setApprovedLimit(app.approvedLimit ?? app.requestedLimit ?? policy?.creditLimit ?? DEFAULT_POLICY.creditLimit);
    setRejectReason(app.rejectReason ?? '');
    setDrawerOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedApp) return;
    try {
      await adminApi.approveBnplApplication(selectedApp.id, approvedLimit);
      messageApi.success('Đã duyệt hồ sơ BNPL');
      setDrawerOpen(false);
      setSelectedApp(null);
      await loadApplications();
      await loadPolicy();
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Duyệt hồ sơ thất bại');
    }
  };

  const handleReject = async () => {
    if (!selectedApp) return;
    try {
      await adminApi.rejectBnplApplication(selectedApp.id, rejectReason);
      messageApi.success('Đã từ chối hồ sơ BNPL');
      setDrawerOpen(false);
      setSelectedApp(null);
      await loadApplications();
      await loadPolicy();
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Từ chối hồ sơ thất bại');
    }
  };

  const handleActivateWallet = async (wallet: BnplWalletDto) => {
    try {
      setWalletActionLoading(true);
      await adminApi.activateBnplWallet(wallet.id);
      messageApi.success('Đã kích hoạt ví BNPL');
      await loadWallets();
      await loadDashboard();
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Kích hoạt ví BNPL thất bại');
    } finally {
      setWalletActionLoading(false);
    }
  };

  const handleSuspendWallet = async (wallet: BnplWalletDto) => {
    try {
      setWalletActionLoading(true);
      await adminApi.suspendBnplWallet(wallet.id, 'Suspended from admin dashboard');
      messageApi.success('Đã tạm ngưng ví BNPL');
      await loadWallets();
      await loadDashboard();
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Tạm ngưng ví BNPL thất bại');
    } finally {
      setWalletActionLoading(false);
    }
  };

  const handleSyncLoan = async (loan: BnplLoanDto) => {
    try {
      setLoanActionLoading(true);
      await adminApi.syncBnplLoan(loan.id);
      messageApi.success('Đã đồng bộ khoản BNPL');
      await loadLoans();
      await loadDashboard();
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Đồng bộ khoản BNPL thất bại');
    } finally {
      setLoanActionLoading(false);
    }
  };

  const handleSavePolicy = async (values: BnplPolicyForm) => {
    try {
      setSavingPolicy(true);
      const data = await adminApi.createBnplPolicyConfig(values);
      messageApi.success(`Đã tạo policy BNPL v${data.version}`);
      await loadPolicy();
      await loadHistory();
    } catch (err: any) {
      messageApi.error(err?.response?.data?.message || 'Lưu policy BNPL thất bại');
    } finally {
      setSavingPolicy(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    if (policyHistory.length === 0) {
      await loadHistory();
    }
  };

  const applicationColumns = [
    {
      title: 'Người dùng',
      dataIndex: 'userId',
      key: 'userId',
      render: (value: string) => <code>{value}</code>,
      width: 220,
    },
    {
      title: 'Hạn mức',
      dataIndex: 'requestedLimit',
      key: 'requestedLimit',
      render: (value: number) => FMT.format(value || 0),
      width: 140,
    },
    {
      title: 'Kỳ hạn',
      dataIndex: 'requestedTermMonths',
      key: 'requestedTermMonths',
      render: (value: number) => (value ? `${value} tháng` : '-'),
      width: 110,
    },
    {
      title: 'Mục đích',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (value: string) => value || '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag>,
      width: 120,
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 140,
      render: (_: any, record: BnplApplicationDto) => (
        <Button type="link" icon={<FileSearchOutlined />} onClick={() => openApplicationDrawer(record)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const walletColumns = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_: any, record: BnplWalletDto) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.userName || record.userId}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.email || record.phoneNumber || '-'}</Typography.Text>
        </Space>
      ),
      width: 260,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag>,
      width: 120,
    },
    {
      title: 'Hạn mức',
      dataIndex: 'creditLimit',
      key: 'creditLimit',
      render: (value: number) => FMT.format(value || 0),
    },
    {
      title: 'Đã dùng',
      dataIndex: 'usedCredit',
      key: 'usedCredit',
      render: (value: number) => FMT.format(value || 0),
    },
    {
      title: 'Còn lại',
      dataIndex: 'availableCredit',
      key: 'availableCredit',
      render: (value: number) => FMT.format(value || 0),
    },
    {
      title: 'Khoản active',
      dataIndex: 'activeLoansCount',
      key: 'activeLoansCount',
      render: (value: number) => value || 0,
      width: 120,
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      render: (_: any, record: BnplWalletDto) => (
        <Space>
          <Tooltip title="Kích hoạt ví">
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleActivateWallet(record)}
              disabled={record.status === 'active'}
              loading={walletActionLoading}
            />
          </Tooltip>
          <Tooltip title="Tạm ngưng ví">
            <Button
              size="small"
              danger
              icon={<PauseCircleOutlined />}
              onClick={() => handleSuspendWallet(record)}
              disabled={record.status === 'suspended'}
              loading={walletActionLoading}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const loanColumns = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_: any, record: BnplLoanDto) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.userName || record.userId}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.email || record.phoneNumber || '-'}</Typography.Text>
        </Space>
      ),
      width: 260,
    },
    {
      title: 'Mã Fineract',
      dataIndex: 'fineractLoanId',
      key: 'fineractLoanId',
      render: (value: string) => <code>{value}</code>,
      width: 140,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag>,
      width: 120,
    },
    {
      title: 'Gốc',
      dataIndex: 'principal',
      key: 'principal',
      render: (value: number) => FMT.format(value || 0),
    },
    {
      title: 'Đã trả',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      render: (value: number) => FMT.format(value || 0),
    },
    {
      title: 'Còn nợ',
      dataIndex: 'outstandingBalance',
      key: 'outstandingBalance',
      render: (value: number) => FMT.format(value || 0),
    },
    {
      title: 'Mục đích',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (value: string) => value || '-',
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 120,
      render: (_: any, record: BnplLoanDto) => (
        <Tooltip title="Đồng bộ trạng thái">
          <Button
            size="small"
            icon={<SyncOutlined />}
            onClick={() => handleSyncLoan(record)}
            loading={loanActionLoading}
          />
        </Tooltip>
      ),
    },
  ];

  const latestPolicy = policyHistory[0];

  return (
    <div>
      {contextHolder}
      <PageHeader
        title="BNPL"
        description="Quản lý hồ sơ đăng ký và policy BNPL: kỳ hạn, lãi suất, hạn mức, phí phạt."
        breadcrumb={[{ label: 'BNPL' }]}
        helpTooltip="Trang này dùng cho admin duyệt hồ sơ BNPL và tạo version policy mới."
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => { loadApplications(); loadPolicy(); }}>
              Tải lại
            </Button>
            <Button icon={<HistoryOutlined />} onClick={openHistory}>
              Lịch sử policy
            </Button>
          </Space>
        }
      />

      <Tabs
        items={[
          {
            key: 'dashboard',
            label: <Space><DashboardOutlined />Tổng quan</Space>,
            children: (
              <Spin spinning={loadingDashboard}>
                <Row gutter={[16, 16]}>
                  {[
                    { label: 'Ví active', value: dashboard?.activeWallets || 0, color: 'green' },
                    { label: 'Ví pending', value: dashboard?.pendingWallets || 0, color: 'gold' },
                    { label: 'Ví suspended', value: dashboard?.suspendedWallets || 0, color: 'red' },
                    { label: 'Tổng khoản BNPL', value: dashboard?.totalLoans || 0, color: 'blue' },
                    { label: 'Khoản active', value: dashboard?.activeLoans || 0, color: 'geekblue' },
                    { label: 'Dư nợ còn lại', value: FMT.format(dashboard?.totalOutstanding || 0), color: 'purple' },
                  ].map((item) => (
                    <Col xs={24} sm={12} lg={8} key={item.label}>
                      <Card>
                        <Typography.Text type="secondary">{item.label}</Typography.Text>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>
                          {item.value}
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
                <Card title="Tóm tắt nguồn vốn" style={{ marginTop: 16 }}>
                  <Row gutter={16}>
                    <Col xs={24} md={8}><Typography.Text type="secondary">Tổng hạn mức</Typography.Text><div style={{ fontSize: 18, fontWeight: 600 }}>{FMT.format(dashboard?.totalCreditLimit || 0)}</div></Col>
                    <Col xs={24} md={8}><Typography.Text type="secondary">Đã dùng</Typography.Text><div style={{ fontSize: 18, fontWeight: 600 }}>{FMT.format(dashboard?.totalUsedCredit || 0)}</div></Col>
                    <Col xs={24} md={8}><Typography.Text type="secondary">Còn dư</Typography.Text><div style={{ fontSize: 18, fontWeight: 600 }}>{FMT.format((dashboard?.totalCreditLimit || 0) - (dashboard?.totalUsedCredit || 0))}</div></Col>
                  </Row>
                </Card>
              </Spin>
            ),
          },
          {
            key: 'wallets',
            label: <Space><BankOutlined />Ví BNPL</Space>,
            children: (
              <Spin spinning={loadingWallets}>
                <Card
                  title="Danh sách ví BNPL"
                  extra={<Tag color="blue">{wallets.length} ví</Tag>}
                >
                  <Table
                    rowKey="id"
                    columns={walletColumns as any}
                    dataSource={wallets}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </Spin>
            ),
          },
          {
            key: 'loans',
            label: <Space><FileSearchOutlined />Khoản BNPL</Space>,
            children: (
              <Spin spinning={loadingLoans}>
                <Card
                  title="Danh sách khoản BNPL"
                  extra={<Tag color="blue">{loans.length} khoản</Tag>}
                >
                  <Table
                    rowKey="id"
                    columns={loanColumns as any}
                    dataSource={loans}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </Spin>
            ),
          },
          {
            key: 'applications',
            label: 'Hồ sơ',
            children: (
              <Spin spinning={loadingApps}>
                <Card
                  title="Danh sách hồ sơ BNPL"
                  extra={<Tag color="blue">{applications.length} hồ sơ</Tag>}
                >
                  <Table
                    rowKey="id"
                    columns={applicationColumns as any}
                    dataSource={applications}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </Spin>
            ),
          },
          {
            key: 'policy',
            label: 'Policy',
            children: (
              <Spin spinning={loadingPolicy}>
                <Card
                  title="Cấu hình BNPL"
                  extra={
                    <Space wrap>
                      {policy?.version ? <Tag color="green">v{policy.version}</Tag> : <Tag>legacy</Tag>}
                      {policy?.configHash ? <Tag color="blue">{policy.configHash.slice(0, 12)}...</Tag> : null}
                    </Space>
                  }
                >
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`Policy hiện tại: ${policy?.version ? `v${policy.version}` : 'legacy/default'}${latestPolicy?.changeNote ? ` - ${latestPolicy.changeNote}` : ''}`}
                  />

                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={DEFAULT_POLICY}
                    onFinish={handleSavePolicy}
                  >
                    <Row gutter={16}>
                      <Col xs={24} md={8}>
                        <Form.Item label="Loan Product ID" name="loanProductId" rules={[{ required: true }]}>
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Hạn mức mặc định" name="creditLimit" rules={[{ required: true }]}>
                          <InputNumber
                            min={0}
                            style={{ width: '100%' }}
                            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(v) => Number((v ?? '').replace(/,/g, ''))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Kỳ hạn mặc định" name="defaultRepayments" rules={[{ required: true }]}>
                          <InputNumber min={1} max={12} style={{ width: '100%' }} addonAfter="tháng" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Kỳ hạn tối thiểu" name="minRepayments" rules={[{ required: true }]}>
                          <InputNumber min={1} max={12} style={{ width: '100%' }} addonAfter="tháng" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Kỳ hạn tối đa" name="maxRepayments" rules={[{ required: true }]}>
                          <InputNumber min={1} max={12} style={{ width: '100%' }} addonAfter="tháng" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Lãi suất theo tháng" name="monthlyRate" rules={[{ required: true }]}>
                          <InputNumber min={0} step={0.1} style={{ width: '100%' }} addonAfter="%" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Loại lãi" name="interestType" rules={[{ required: true }]}>
                          <Select options={INTEREST_OPTIONS} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Bước tiền tệ" name="currencyMultiples">
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Số khoản active tối đa" name="maxActiveLoans">
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Phí trễ hạn (%)" name="lateFeeRate">
                          <InputNumber min={0} step={0.1} style={{ width: '100%' }} addonAfter="%" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Phí trễ hạn cố định" name="lateFeeFlat">
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Ân hạn (ngày)" name="gracePeriodDays">
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item label="Cho phép tất toán sớm" name="allowEarlyRepayment" valuePropName="checked">
                          <Switch checkedChildren="Có" unCheckedChildren="Không" />
                        </Form.Item>
                      </Col>
                      <Col xs={24}>
                        <Form.Item label="Ghi chú" name="changeNote">
                          <Input.TextArea rows={3} placeholder="Ví dụ: Điều chỉnh policy quý 2/2026" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Space wrap>
                      <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />} loading={savingPolicy}>
                        Lưu policy
                      </Button>
                      <Button onClick={() => form.setFieldsValue(currentPolicy)}>Khôi phục policy hiện tại</Button>
                    </Space>
                  </Form>
                </Card>
              </Spin>
            ),
          },
        ]}
      />

      <Drawer
        title={selectedApp ? `Hồ sơ BNPL ${selectedApp.id}` : 'Chi tiết hồ sơ BNPL'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
        destroyOnClose
      >
        {selectedApp && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="User ID" span={2}>
                <code>{selectedApp.userId}</code>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={STATUS_COLORS[selectedApp.status] || 'default'}>{selectedApp.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Hạn mức yêu cầu">
                {FMT.format(selectedApp.requestedLimit || 0)}
              </Descriptions.Item>
              <Descriptions.Item label="Hạn mức duyệt">
                {selectedApp.approvedLimit != null ? FMT.format(selectedApp.approvedLimit) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Kỳ hạn">
                {selectedApp.requestedTermMonths ? `${selectedApp.requestedTermMonths} tháng` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Mục đích">{selectedApp.purpose || '-'}</Descriptions.Item>
              <Descriptions.Item label="Nghề nghiệp">{selectedApp.occupation || '-'}</Descriptions.Item>
              <Descriptions.Item label="Thu nhập">
                {selectedApp.income != null ? FMT.format(selectedApp.income) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ" span={2}>
                {selectedApp.address || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Lý do từ chối" span={2}>
                {selectedApp.rejectReason || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Duyệt / Từ chối">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Typography.Text strong>Hạn mức duyệt</Typography.Text>
                  <InputNumber
                    min={0}
                    value={approvedLimit}
                    onChange={(value) => setApprovedLimit(Number(value) || 0)}
                    style={{ width: '100%', marginTop: 8 }}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number((v ?? '').replace(/,/g, ''))}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Text strong>Lý do từ chối</Typography.Text>
                  <Input.TextArea
                    rows={4}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ marginTop: 8 }}
                  />
                </Col>
              </Row>

              <Space wrap style={{ marginTop: 16 }}>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleApprove}
                  disabled={!selectedApp || selectedApp.status !== 'submitted'}
                >
                  Duyệt
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={handleReject}
                  disabled={!selectedApp || selectedApp.status !== 'submitted'}
                >
                  Từ chối
                </Button>
              </Space>
            </Card>
          </Space>
        )}
      </Drawer>

      <Drawer
        title="Lịch sử policy BNPL"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={860}
      >
        <Spin spinning={historyLoading}>
          <Table
            rowKey={(row) => row._id || String(row.version)}
            dataSource={policyHistory}
            pagination={false}
            size="small"
            columns={[
              { title: 'Version', dataIndex: 'version', width: 90, render: (value: number) => <Tag>v{value}</Tag> },
              { title: 'Hạn mức', dataIndex: 'creditLimit', render: (value: number) => FMT.format(value || 0) },
              { title: 'Kỳ hạn', dataIndex: 'defaultRepayments', render: (value: number) => `${value} tháng` },
              { title: 'Lãi/tháng', dataIndex: 'monthlyRate', render: (value: number) => `${value}%` },
              { title: 'Loại lãi', dataIndex: 'interestType' },
              { title: 'Ghi chú', dataIndex: 'changeNote' },
            ]}
          />
        </Spin>
      </Drawer>
    </div>
  );
}
