import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import {
    Card, Typography, Tag, Descriptions, Button, Space,
    Skeleton, Statistic, Row, Col, Avatar, Divider, message, theme,
    Drawer, Tabs, Table, Badge, Alert, Empty, Image, Popconfirm, Upload
} from 'antd';
import {
    CloseOutlined, EyeOutlined, ArrowLeftOutlined, UserOutlined, BankOutlined,
    DollarOutlined, ClockCircleOutlined, FileTextOutlined, InfoCircleOutlined,
    IdcardOutlined, PhoneOutlined, MailOutlined, HomeOutlined, TeamOutlined,
    CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
    CheckOutlined, UploadOutlined, PauseCircleOutlined
} from '@ant-design/icons';
import { adminApi, LoanDto, CustomerDetailDto, KycDetailDto } from '../api/admin';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import { getInstallmentStatus } from '../utils/scheduleStatus';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';

const { Title, Text } = Typography;

// Tab items type
interface TabItem {
    key: string;
    label: React.ReactNode;
    children: React.ReactNode;
}

export default function CustomerDetailPage() {
    const { token } = theme.useToken();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const ability = useAbility(AbilityContext);
    const [searchParams] = useSearchParams();
    const [detail, setDetail] = useState<CustomerDetailDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('general');

    // KYC Document view states
    const [kycDocImages, setKycDocImages] = useState<Record<string, string>>({});
    const [viewingKycDoc, setViewingKycDoc] = useState<{ entityType: string; entityId: number; documentId: number; name: string } | null>(null);

    const customer = detail?.customer ?? null;
    const loans = detail?.loans ?? [];
    const summary = detail?.summary;
    const savingsAccounts = detail?.savingsAccounts ?? [];
    const charges = detail?.charges ?? [];
    const kyc = detail?.kyc;

    // KYC approval states
    const [kycApproving, setKycApproving] = useState(false);
    const [kycRejecting, setKycRejecting] = useState(false);

    // Staff upload CCCD + OCR (nhân viên chụp/thêm giúp khách hàng)
    const [staffFrontOcr, setStaffFrontOcr] = useState<any>(null);
    const [staffBackOcr, setStaffBackOcr] = useState<any>(null);
    const [staffFrontFile, setStaffFrontFile] = useState<File | null>(null);
    const [staffBackFile, setStaffBackFile] = useState<File | null>(null);
    const [ocrLoading, setOcrLoading] = useState<'front' | 'back' | null>(null);
    const [saveKycLoading, setSaveKycLoading] = useState(false);

    // Modal states for loan details
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [loanDetails, setLoanDetails] = useState<any>(null);
    const [loanDocuments, setLoanDocuments] = useState<any[]>([]);
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [viewLoanId, setViewLoanId] = useState<number | null>(null);
    const [syncingAll, setSyncingAll] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        adminApi.getCustomerDetail(id)
            .then(setDetail)
            .catch(() => setError('Không thể tải thông tin khách hàng'))
            .finally(() => setLoading(false));
    }, [id]);

    // Mở drawer chi tiết khoản vay khi vào từ trang "Khoản vay quá hạn" với ?viewLoan=...
    const viewLoanParam = searchParams.get('viewLoan');

    // Load KYC document images when tab is KYC
    useEffect(() => {
        if (activeTab !== 'kyc' || !kyc?.documents?.length || !id) return;

        const loadImages = async () => {
            const urls: Record<string, string> = {};
            for (const doc of kyc.documents) {
                const key = `${doc.entityType}-${doc.entityId}-${doc.id}`;
                try {
                    const response = await adminApi.downloadKycDocument(id, doc.entityType, doc.entityId, doc.id);
                    const contentType = response.headers['content-type'] || 'image/jpeg';
                    if (['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
                        const blob = new Blob([response.data], { type: contentType });
                        urls[key] = window.URL.createObjectURL(blob);
                    }
                } catch {
                    // skip failed
                }
            }
            setKycDocImages(urls);
        };
        loadImages();

        return () => {
            Object.values(kycDocImages).forEach(u => window.URL.revokeObjectURL(u));
        };
    }, [activeTab, kyc, id]);

    const handleViewDetails = async (fineractLoanId: number, sync = false) => {
        setIsModalOpen(true);
        setModalLoading(true);
        setLoadingDocuments(true);
        setViewLoanId(fineractLoanId);
        try {
            const [data, docs] = await Promise.all([
                adminApi.getLoanDetails(fineractLoanId, sync),
                adminApi.getLoanDocuments(fineractLoanId),
            ]);
            setLoanDetails(data);
            setLoanDocuments(docs);
            if (sync) message.success('Đã đồng bộ dữ liệu mới nhất từ Fineract');
        } catch (err) {
            message.error('Không thể tải chi tiết khoản vay');
        } finally {
            setModalLoading(false);
            setLoadingDocuments(false);
        }
    };

    // Mở drawer chi tiết khoản vay khi vào từ trang "Khoản vay quá hạn" với ?viewLoan=...
    useEffect(() => {
        if (!id || !detail || !viewLoanParam) return;
        const loanId = parseInt(viewLoanParam, 10);
        if (!Number.isFinite(loanId)) return;
        handleViewDetails(loanId);
    }, [id, viewLoanParam, !!detail]);

    const handleSyncAllLoans = async () => {
        if (!id) return;
        setSyncingAll(true);
        const hide = message.loading('Đang đồng bộ toàn bộ khoản vay...', 0);
        try {
            await adminApi.syncCustomerLoans(id);
            message.success('Đồng bộ hoàn tất');
            // Refresh customer detail to get updated loan list
            const updated = await adminApi.getCustomerDetail(id);
            setDetail(updated);
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Đồng bộ thất bại');
        } finally {
            setSyncingAll(false);
            hide();
        }
    };

    const kycUserId = kyc?.user?._id || customer?._id || id;

    const handleApproveKyc = async () => {
        if (!kycUserId) return;
        setKycApproving(true);
        try {
            await adminApi.approveKyc(kycUserId);
            message.success('Đã kích hoạt tài khoản (đồng bộ Fineract)');
            adminApi.getCustomerDetail(id!).then(setDetail);
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Kích hoạt tài khoản thất bại');
        } finally {
            setKycApproving(false);
        }
    };

    const handleRejectKyc = async () => {
        if (!kycUserId) return;
        setKycRejecting(true);
        try {
            await adminApi.rejectKyc(kycUserId);
            message.success('Đã từ chối kích hoạt');
            adminApi.getCustomerDetail(id!).then(setDetail);
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Từ chối kích hoạt thất bại');
        } finally {
            setKycRejecting(false);
        }
    };

    /** Trích OCR data từ response (Python API wrap trong `result`) */
    const extractOcrFront = (raw: any) => raw?.result ?? raw?.data ?? raw;
    /** Back: data nằm trong result.data (init_date) hoặc result.data (issue_date, expiry_date, place_of_birth) */
    const extractOcrBack = (raw: any) => {
        const r = raw?.result ?? raw?.data ?? raw;
        const inner = r?.data ?? r;
        // Đảm bảo init_date (old format) được map sang issue_date để hiển thị Ngày cấp
        if (inner && typeof inner === 'object' && inner.init_date && !inner.issue_date) {
            return { ...inner, issue_date: inner.init_date };
        }
        return inner;
    };

    const handleStaffOcrFront = async (file: File) => {
        if (!id) return;
        setOcrLoading('front');
        try {
            const data = await adminApi.ocrFront(id, file);
            setStaffFrontOcr(data);
            setStaffFrontFile(file);
            message.success('Đã nhận dạng mặt trước CCCD');
        } catch (e: any) {
            message.error(e?.response?.data?.error || e?.message || 'OCR mặt trước thất bại');
        } finally {
            setOcrLoading(null);
        }
    };

    const handleStaffOcrBack = async (file: File) => {
        if (!id) return;
        setOcrLoading('back');
        try {
            const data = await adminApi.ocrBack(id, file);
            setStaffBackOcr(data);
            setStaffBackFile(file);
            message.success('Đã nhận dạng mặt sau CCCD');
        } catch (e: any) {
            message.error(e?.response?.data?.error || e?.message || 'OCR mặt sau thất bại');
        } finally {
            setOcrLoading(null);
        }
    };

    const handleStaffSaveKyc = async () => {
        const frontData = extractOcrFront(staffFrontOcr) || (kyc?.ocr ? { fullName: kyc.ocr.fullName, idNumber: kyc.ocr.ssn, dob: kyc.ocr.dateOfBirth, address: kyc.ocr.address, gender: kyc.ocr.sex } : null);
        const backData = extractOcrBack(staffBackOcr);
        if (!id || !frontData) {
            message.warning('Vui lòng tải ảnh mặt trước CCCD và chạy OCR trước');
            return;
        }
        if (!staffFrontFile && !staffBackFile) {
            message.warning('Vui lòng tải ít nhất ảnh mặt trước CCCD để lưu');
            return;
        }
        if (staffBackFile && !(backData?.init_date || backData?.issue_date || backData?.issueDate)) {
            message.warning('Đã tải ảnh mặt sau CCCD, vui lòng chạy OCR để lấy Ngày cấp trước khi lưu');
            return;
        }
        setSaveKycLoading(true);
        try {
            await adminApi.saveKycForUser(id, frontData, extractOcrBack(staffBackOcr) || frontData, staffFrontFile || undefined, staffBackFile || undefined);
            message.success('Đã lưu hồ sơ KYC. Khách hàng đang chờ kích hoạt.');
            setStaffFrontOcr(null);
            setStaffBackOcr(null);
            setStaffFrontFile(null);
            setStaffBackFile(null);
            adminApi.getCustomerDetail(id).then(setDetail);
        } catch (e: any) {
            message.error(e?.response?.data?.message || e?.message || 'Lưu hồ sơ thất bại');
        } finally {
            setSaveKycLoading(false);
        }
    };

    const handleDownloadDocument = async (documentId: number, fileName: string) => {
        if (!viewLoanId) return;
        const hide = message.loading('Đang chuẩn bị tài liệu...', 0);
        try {
            const response = await adminApi.downloadLoanDocument(viewLoanId, documentId);
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            const blob = new Blob([response.data], { type: contentType });
            const url = window.URL.createObjectURL(blob);
            const isViewable = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(contentType);
            if (isViewable) {
                window.open(url, '_blank');
            } else {
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                link.parentNode?.removeChild(link);
            }
            setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        } catch (e) {
            message.error('Không thể tải tài liệu');
        } finally {
            hide();
        }
    };

    const loanColumns: ProColumns<LoanDto>[] = [
        {
            title: 'Fineract #',
            dataIndex: 'fineractLoanId',
            key: 'fineractLoanId',
            width: 90,
            render: (_, record) => {
                const id = record?.fineractLoanId;
                const num = typeof id === 'number' ? id : (typeof id === 'object' && id != null && 'id' in id ? (id as { id: number }).id : Number(id));
                const valid = num != null && !Number.isNaN(num);
                return valid ? (
                    <Tag color="blue" style={{ fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => handleViewDetails(num)}>
                        #{num}
                    </Tag>
                ) : '–';
            },
        },
        {
            title: 'Sản phẩm',
            key: 'product',
            render: (_, r) => (
                <Space>
                    <Tag color="gold">{r.productShortName}</Tag>
                    <Text style={{ fontSize: 12 }}>{r.productName}</Text>
                </Space>
            ),
        },
        {
            title: 'Mục đích',
            dataIndex: 'willing',
            width: 150,
            render: (v: any) => <Text type="secondary">{v || '–'}</Text>,
        },
        {
            title: 'Số tiền vay',
            dataIndex: 'capital',
            width: 140,
            render: (v: any) => <Text strong style={{ color: token.colorPrimary }}>{fmtVND(v)}</Text>,
        },
        {
            title: 'Kỳ hạn',
            dataIndex: 'periodMonth',
            align: 'center',
            width: 100,
            render: (v: any) => `${v} tháng`,
        },
        {
            title: 'Trả/tháng',
            dataIndex: 'monthlyPay',
            width: 140,
            render: (v: any) => fmtVND(v),
        },
        {
            title: 'Lãi suất',
            dataIndex: 'monthlyRatePercent',
            align: 'center',
            width: 100,
            render: (v: any) => v != null ? `${v}%/tháng` : '–',
        },
        {
            title: 'Trạng thái (Fineract)',
            dataIndex: 'status',
            align: 'center',
            width: 150,
            render: (_: any, r: any) => <FineractStatusBadge status={r.status} />,
        },
        {
            title: 'Ngày nộp',
            dataIndex: 'createdAt',
            width: 120,
            render: (v: any) => v ? new Date(v as string).toLocaleDateString('vi-VN') : '–',
        },
    ];

    if (loading) return (
        <div style={{ padding: 24 }}>
            <Card><Skeleton active /></Card>
        </div>
    );

    if (error) return (
        <div style={{ padding: 24 }}>
            <Alert type="error" message={error} />
        </div>
    );

    if (!customer) return null;

    const totalCapital = loans.reduce((s, l) => s + (l.capital || 0), 0);

    // Header card with client info (like Mifos)
    const HeaderCard = () => (
        <Card
            bordered={false}
            style={{
                marginBottom: 24,
                backgroundColor: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                padding: '24px'
            }}
            bodyStyle={{ padding: 0 }}
        >
            <Row gutter={[32, 24]} align="middle">
                <Col flex="none">
                    <Avatar
                        size={100}
                        icon={<UserOutlined />}
                        style={{
                            backgroundColor: token.colorPrimaryBg,
                            color: token.colorPrimary,
                            fontSize: 48,
                            border: `4px solid ${token.colorBgContainer}`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                    />
                </Col>
                <Col flex="auto">
                    <div style={{ marginBottom: 16 }}>
                        <Title level={2} style={{ margin: 0, fontWeight: 700, display: 'inline-block', marginRight: 16 }}>
                            {customer.displayName || customer.username}
                        </Title>
                        <Space size={8} style={{ verticalAlign: 'middle', marginBottom: 8 }}>
                            <FineractStatusBadge status={customer.fineractStatus} />
                            {customer.kycStatus === 'VERIFIED' ? (
                                <Tag color="success" icon={<CheckCircleOutlined />}>KYC Đã xác minh</Tag>
                            ) : customer.kycStatus === 'PENDING' ? (
                                <Tag color="warning" icon={<ExclamationCircleOutlined />}>KYC Chờ duyệt</Tag>
                            ) : customer.kycStatus === 'REJECTED' ? (
                                <Tag color="error" icon={<CloseCircleOutlined />}>KYC Từ chối</Tag>
                            ) : (
                                <Tag>Chưa KYC</Tag>
                            )}
                        </Space>
                    </div>

                    <Descriptions column={{ xxl: 3, xl: 3, lg: 2, md: 1, sm: 1, xs: 1 }} size="small" colon={false}>
                        <Descriptions.Item label={<Space><HomeOutlined /> <strong>Văn phòng</strong></Space>}>
                            {customer.officeName || 'Head Office'}
                        </Descriptions.Item>
                        <Descriptions.Item label={<Space><TeamOutlined /> <strong>Khách hàng</strong></Space>}>
                            <Text code>{customer.fineractClientId ? String(customer.fineractClientId).padStart(9, '0') : '–'}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={<Space><IdcardOutlined /> <strong>ID bên ngoài</strong></Space>}>
                            {customer.externalId || customer.username || '–'}
                        </Descriptions.Item>
                        <Descriptions.Item label={<Space><UserOutlined /> <strong>Nhân viên</strong></Space>}>
                            {customer.staffName || <Text type="secondary">Chưa phân công</Text>}
                        </Descriptions.Item>
                        <Descriptions.Item label={<Space><PhoneOutlined /> <strong>Số điện thoại</strong></Space>}>
                            {customer.mobileNo || customer.username || '–'}
                        </Descriptions.Item>
                        <Descriptions.Item label={<Space><MailOutlined /> <strong>Email</strong></Space>}>
                            {customer.email || '–'}
                        </Descriptions.Item>
                    </Descriptions>
                </Col>
                <Col flex="none" style={{ textAlign: 'right', minWidth: 200 }}>
                    <Statistic
                        title="Tổng vốn vay"
                        value={totalCapital}
                        formatter={v => fmtVND(Number(v))}
                        valueStyle={{ color: token.colorPrimary, fontWeight: 700 }}
                    />
                    <div style={{ marginTop: 24 }}>
                        {ability.can(Action.Update, 'Customer') && (
                            <Button
                                icon={<ClockCircleOutlined />}
                                onClick={handleSyncAllLoans}
                                loading={syncingAll}
                                type="primary"
                                ghost
                            >
                                Làm mới thông tin
                            </Button>
                        )}
                    </div>
                </Col>
            </Row>
        </Card>
    );

    // Performance History Section
    const PerformanceSection = () => (
        <Card
            title={<Space><InfoCircleOutlined /> Chỉ số hoạt động</Space>}
            bordered={false}
            style={{ marginBottom: 24, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        >
            {summary ? (
                <Row gutter={[32, 32]}>
                    <Col xs={24} sm={12} lg={6}>
                        <Statistic
                            title="Chu kỳ vay"
                            value={summary.loanCycles}
                            valueStyle={{ color: token.colorPrimary, fontWeight: 700 }}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Statistic
                            title="Khoản vay hoạt động"
                            value={summary.activeLoans}
                            valueStyle={{ color: token.colorWarning, fontWeight: 700 }}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Statistic
                            title="Tiết kiệm hoạt động"
                            value={summary.activeSavings}
                            valueStyle={{ color: token.colorSuccess, fontWeight: 700 }}
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                        <Statistic
                            title="Tổng tiết kiệm"
                            value={summary.totalSavings}
                            formatter={v => fmtVND(Number(v))}
                            valueStyle={{ color: token.colorSuccess, fontWeight: 700 }}
                        />
                    </Col>
                    <Divider style={{ margin: '8px 0' }} />
                    <Col span={24}>
                        <Text type="secondary">Khoản vay gần nhất: </Text>
                        <Text strong>{fmtVND(summary.lastLoanAmount)}</Text>
                    </Col>
                </Row>
            ) : (
                <Empty description="Chưa có dữ liệu hiệu suất" />
            )}
        </Card>
    );

    // General Tab Content
    const GeneralTab = () => (
        <>
            <PerformanceSection />

            {/* Quick Stats - 3 cards with stats */}
            <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
                <Col xs={24} md={8}>
                    <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
                        <Statistic
                            title="Số lượng khoản vay"
                            value={loans.length}
                            prefix={<DollarOutlined />}
                            valueStyle={{ color: token.colorPrimary, fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
                        <Statistic
                            title="Tổng vốn giải ngân"
                            value={loans.reduce((s, l) => s + (['disbursed', 'active', 'closed'].includes(String(l.status?.code || l.status).toLowerCase()) ? (l.capital || 0) : 0), 0)}
                            formatter={v => fmtVND(Number(v))}
                            valueStyle={{ color: token.colorSuccess, fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
                        <Statistic
                            title="Đang chờ phê duyệt"
                            value={loans.filter(l => {
                                const code = String(l.status?.code || l.status).toLowerCase();
                                return code.includes('pending') || code.includes('submitted');
                            }).length}
                            valueStyle={{ color: token.colorWarning, fontWeight: 700 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Loan Accounts */}
            <Card
                title={<Space><BankOutlined /> Các tài khoản vay</Space>}
                bordered={false}
                style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
                {loans.length === 0 ? (
                    <Empty description="Chưa có khoản vay" />
                ) : (
                    <ProTable<LoanDto>
                        {...PRO_TABLE_DEFAULTS}
                        rowKey={(r) => r._id || `FL_${r.fineractLoanId}`}
                        columns={loanColumns}
                        dataSource={loans}
                        search={false}
                        pagination={{ pageSize: 10 }}
                        options={{ density: true, setting: true }}
                        scroll={{ x: 1300 }}
                    />
                )}
            </Card>
        </>
    );

    // KYC Tab Content
    const KycTab = () => {
        const kycStatus = customer?.kycStatus || 'NONE';
        const canApproveKyc = !['VERIFIED', 'REJECTED'].includes(kycStatus);
        const isDirectKyc = !kyc; // Chưa có dữ liệu KYC = trường hợp xác minh trực tiếp tại chỗ

        const ApprovalCard = () => (
            <Card
                bordered={false}
                style={{ marginBottom: 24, borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${token.colorWarningBorder}` }}
            >
                <Alert
                    message={isDirectKyc ? 'KYC trực tiếp - Đã xác minh khách hàng tại chỗ' : 'Có thông tin KYC và đang chờ phê duyệt'}
                    description={isDirectKyc
                        ? 'Khách hàng chưa nộp hồ sơ eKYC. Nếu đã xác minh trực tiếp tại chỗ, có thể kích hoạt tài khoản để đồng bộ sang Fineract.'
                        : 'Hồ sơ định danh đã được gửi. Kích hoạt tài khoản sẽ đồng bộ trạng thái sang Fineract.'}
                    type="warning"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    action={
                        ability.can(Action.Approve, 'Kyc') ? (
                            <Space>
                                <Popconfirm
                                    title="Kích hoạt tài khoản"
                                    description={isDirectKyc ? 'Xác nhận đã xác minh trực tiếp và kích hoạt tài khoản? Trạng thái sẽ được cập nhật trên Fineract.' : 'Xác nhận kích hoạt tài khoản? Trạng thái sẽ được cập nhật trên Fineract.'}
                                    onConfirm={handleApproveKyc}
                                    okText="Kích hoạt"
                                    cancelText="Hủy"
                                >
                                    <Button type="primary" icon={<CheckOutlined />} loading={kycApproving}>
                                        Kích hoạt tài khoản
                                    </Button>
                                </Popconfirm>
                                <Popconfirm
                                    title="Từ chối kích hoạt"
                                    description={isDirectKyc ? 'Xác nhận từ chối? Khách hàng sẽ cần nộp hồ sơ eKYC để thử lại.' : 'Xác nhận từ chối hồ sơ định danh này?'}
                                    onConfirm={handleRejectKyc}
                                    okText="Từ chối"
                                    cancelText="Hủy"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button danger icon={<CloseOutlined />} loading={kycRejecting}>
                                        Từ chối
                                    </Button>
                                </Popconfirm>
                            </Space>
                        ) : undefined
                    }
                />
            </Card>
        );

        if (!kyc) {
            const ocrData = extractOcrFront(staffFrontOcr);
            const backData = extractOcrBack(staffBackOcr);
            return (
                <>
                    {canApproveKyc && <ApprovalCard />}
                    {/* Nhân viên tải CCCD lên và chạy OCR giúp khách hàng */}
                    <Card
                        bordered={false}
                        style={{ marginBottom: 24, borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                        title={<Space><UploadOutlined /> Tải CCCD lên và nhận dạng OCR (nhân viên làm giúp khách hàng)</Space>}
                    >
                        <Row gutter={[24, 24]}>
                            <Col xs={24} md={12}>
                                <div style={{ marginBottom: 8 }}><Text strong>Mặt trước CCCD</Text></div>
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        handleStaffOcrFront(file);
                                        return false;
                                    }}
                                    disabled={!!ocrLoading}
                                >
                                    <Button icon={<UploadOutlined />} loading={ocrLoading === 'front'}>
                                        Chọn ảnh mặt trước
                                    </Button>
                                </Upload>
                                {ocrData && (
                                    <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                                        <Descriptions.Item label="Họ tên">{ocrData.fullName || ocrData.name || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Số CCCD">{ocrData.idNumber || ocrData.id || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Ngày sinh">{ocrData.dob || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Giới tính">{ocrData.gender || ocrData.sex || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Địa chỉ">{ocrData.address || '–'}</Descriptions.Item>
                                    </Descriptions>
                                )}
                            </Col>
                            <Col xs={24} md={12}>
                                <div style={{ marginBottom: 8 }}><Text strong>Mặt sau CCCD</Text></div>
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        handleStaffOcrBack(file);
                                        return false;
                                    }}
                                    disabled={!!ocrLoading}
                                >
                                    <Button icon={<UploadOutlined />} loading={ocrLoading === 'back'}>
                                        Chọn ảnh mặt sau
                                    </Button>
                                </Upload>
                                {backData && (
                                    <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                                        <Descriptions.Item label="Ngày cấp">{backData.init_date || backData.issue_date || backData.issueDate || '–'}</Descriptions.Item>
                                    </Descriptions>
                                )}
                            </Col>
                        </Row>
                        {ocrData && (
                            <div style={{ marginTop: 16 }}>
                                <Button
                                    type="primary"
                                    icon={<CheckOutlined />}
                                    loading={saveKycLoading}
                                    onClick={handleStaffSaveKyc}
                                >
                                    Lưu hồ sơ KYC
                                </Button>
                            </div>
                        )}
                    </Card>
                    <Card bordered={false} style={{ borderRadius: 0 }}>
                        <Empty description="Chưa có dữ liệu KYC" />
                    </Card>
                </>
            );
        }

        const { ocr, metadata, documents } = kyc;
        const ocrData = extractOcrFront(staffFrontOcr);
        const backData = extractOcrBack(staffBackOcr);
        const showUploadCard = canApproveKyc && ability.can(Action.Create, 'Kyc');

        return (
            <>
                {canApproveKyc && <ApprovalCard />}

                {/* Nhân viên tải CCCD lên khi chưa có OCR/ảnh (hoặc cần bổ sung) */}
                {showUploadCard && (
                    <Card
                        bordered={false}
                        style={{ marginBottom: 24, borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                        title={<Space><UploadOutlined /> Tải CCCD lên và nhận dạng OCR (nhân viên làm giúp khách hàng)</Space>}
                    >
                        <Row gutter={[24, 24]}>
                            <Col xs={24} md={12}>
                                <div style={{ marginBottom: 8 }}><Text strong>Mặt trước CCCD</Text></div>
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        handleStaffOcrFront(file);
                                        return false;
                                    }}
                                    disabled={!!ocrLoading}
                                >
                                    <Button icon={<UploadOutlined />} loading={ocrLoading === 'front'}>
                                        Chọn ảnh mặt trước
                                    </Button>
                                </Upload>
                                {(ocrData || ocr?.fullName || ocr?.ssn) && (
                                    <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                                        <Descriptions.Item label="Họ tên">{(ocrData || ocr)?.fullName || (ocrData || ocr)?.name || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Số CCCD">{(ocrData || ocr)?.idNumber || (ocrData || ocr)?.id || (ocrData || ocr)?.ssn || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Ngày sinh">{(ocrData || ocr)?.dob || (ocrData || ocr)?.dateOfBirth || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Giới tính">{(ocrData || ocr)?.gender || (ocrData || ocr)?.sex || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Địa chỉ">{(ocrData || ocr)?.address || '–'}</Descriptions.Item>
                                    </Descriptions>
                                )}
                            </Col>
                            <Col xs={24} md={12}>
                                <div style={{ marginBottom: 8 }}><Text strong>Mặt sau CCCD</Text></div>
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        handleStaffOcrBack(file);
                                        return false;
                                    }}
                                    disabled={!!ocrLoading}
                                >
                                    <Button icon={<UploadOutlined />} loading={ocrLoading === 'back'}>
                                        Chọn ảnh mặt sau
                                    </Button>
                                </Upload>
                                {(backData || ocr?.issueDate) && (
                                    <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                                        <Descriptions.Item label="Ngày cấp">{(backData || {})?.init_date || (backData || {})?.issue_date || (backData || {})?.issueDate || ocr?.issueDate || '–'}</Descriptions.Item>
                                    </Descriptions>
                                )}
                            </Col>
                        </Row>
                        {(ocrData || ocr?.fullName || ocr?.ssn) && (staffFrontFile || staffBackFile) && (
                            <div style={{ marginTop: 16 }}>
                                {metadata?.kycCompletedAt && (
                                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                        Ngày hoàn thành KYC: {new Date(metadata.kycCompletedAt).toLocaleString('vi-VN')}
                                    </Text>
                                )}
                                <Button
                                    type="primary"
                                    icon={<CheckOutlined />}
                                    loading={saveKycLoading}
                                    onClick={handleStaffSaveKyc}
                                >
                                    Lưu hồ sơ KYC
                                </Button>
                            </div>
                        )}
                    </Card>
                )}

                {/* Thông tin OCR - chỉ hiện khi không có upload card (đã lưu, không cần chỉnh sửa) */}
                {!showUploadCard && (
                    <Card
                        title={<Space><IdcardOutlined /> Thông tin OCR (CCCD)</Space>}
                        bordered={false}
                        style={{ marginBottom: 24, borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                        <Descriptions column={2} bordered size="small">
                            <Descriptions.Item label="Họ tên" span={1}>{ocr?.fullName || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Số CCCD" span={1}>{ocr?.ssn || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Ngày sinh" span={1}>{ocr?.dateOfBirth || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Ngày cấp" span={1}>{ocr?.issueDate || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Giới tính" span={1}>{ocr?.sex || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Địa chỉ" span={2}>{ocr?.address || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Ngày hoàn thành KYC" span={2}>
                                {metadata?.kycCompletedAt ? new Date(metadata.kycCompletedAt).toLocaleString('vi-VN') : '–'}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                )}

                {/* KYC Documents */}
                <Card
                    title={<Space><FileTextOutlined /> Hình ảnh CCCD (từ Fineract)</Space>}
                    bordered={false}
                    style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                    {documents && documents.length > 0 ? (
                        <Row gutter={[24, 24]}>
                            {documents.map((doc: { id: number; name: string; entityType: string; entityId: number; label: string }) => {
                                const key = `${doc.entityType}-${doc.entityId}-${doc.id}`;
                                const imgUrl = kycDocImages[key];
                                return (
                                    <Col xs={24} sm={12} md={8} key={key}>
                                        <Card
                                            hoverable
                                            cover={
                                                imgUrl ? (
                                                    <Image
                                                        src={imgUrl}
                                                        alt={doc.label}
                                                        style={{ height: 200, objectFit: 'cover' }}
                                                        preview={{ mask: 'Xem ảnh' }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        height: 200,
                                                        background: token.colorFillAlter,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <Text type="secondary">Đang tải...</Text>
                                                    </div>
                                                )
                                            }
                                            actions={[
                                                <Button
                                                    type="link"
                                                    icon={<EyeOutlined />}
                                                    onClick={() => setViewingKycDoc({
                                                        entityType: doc.entityType,
                                                        entityId: doc.entityId,
                                                        documentId: doc.id,
                                                        name: doc.name
                                                    })}
                                                >
                                                    Xem / Tải
                                                </Button>
                                            ]}
                                        >
                                            <Card.Meta
                                                title={doc.label}
                                                description={doc.name}
                                            />
                                        </Card>
                                    </Col>
                                );
                            })}
                        </Row>
                    ) : (
                        <Empty description="Chưa có tài liệu CCCD trong Fineract" />
                    )}
                </Card>
            </>
        );
    };

    // Savings & Charges Tab
    const AccountsTab = () => (
        <>
            {/* Savings Accounts */}
            <Card
                title={<Space><BankOutlined /> Tài khoản tiết kiệm</Space>}
                bordered={false}
                style={{ marginBottom: 24, borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
                {savingsAccounts.length > 0 ? (
                    <Table
                        dataSource={savingsAccounts}
                        rowKey={(r: any) => r.id ?? r.savingsId ?? r.accountNo ?? String(Math.random())}
                        size="small"
                        pagination={false}
                        columns={[
                            { title: 'Số tài khoản', dataIndex: 'accountNo', key: 'accountNo', render: (v: string) => v || '–' },
                            { title: 'Sản phẩm', dataIndex: 'productName', key: 'productName', render: (v: string) => v || '–' },
                            { title: 'Số dư', key: 'balance', align: 'right', render: (_: any, r: any) => fmtVND(r.accountBalance ?? r.balance ?? 0) },
                            {
                                title: 'Trạng thái', key: 'status', render: (_: any, r: any) => (
                                    <Tag color={r.status?.active ? 'success' : 'default'}>
                                        {r.status?.value ?? r.status?.code ?? '–'}
                                    </Tag>
                                )
                            },
                        ]}
                    />
                ) : (
                    <Empty description="Chưa có tài khoản tiết kiệm" />
                )}
            </Card>

            {/* Charges */}
            {charges.length > 0 && (
                <Card
                    title={<Space><DollarOutlined /> Các khoản phí sắp tới</Space>}
                    bordered={false}
                    style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                    <Table
                        dataSource={charges}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        columns={[
                            { title: 'Tên', dataIndex: 'name', key: 'name' },
                            { title: 'Đến hạn', dataIndex: 'dueDate', key: 'dueDate', render: (v: number[]) => v ? v.reverse().join('/') : '–' },
                            { title: 'Phải trả', dataIndex: 'amount', key: 'amount', align: 'right', render: (v: number) => fmtVND(v) },
                            { title: 'Đã trả', dataIndex: 'amountPaid', key: 'amountPaid', align: 'right', render: (v: number) => fmtVND(v || 0) },
                            { title: 'Đã miễn', dataIndex: 'amountWaived', key: 'amountWaived', align: 'right', render: (v: number) => fmtVND(v || 0) },
                            {
                                title: 'Chưa thanh toán', dataIndex: 'amountOutstanding', key: 'amountOutstanding', align: 'right', render: (v: number) => (
                                    <Text type={v > 0 ? 'danger' : 'success'} strong>{fmtVND(v || 0)}</Text>
                                )
                            },
                        ]}
                    />
                </Card>
            )}
        </>
    );

    const tabItems: TabItem[] = [
        {
            key: 'general',
            label: (
                <Space>
                    <InfoCircleOutlined />
                    Chung
                </Space>
            ),
            children: <GeneralTab />
        },
        {
            key: 'kyc',
            label: (
                <Space>
                    <IdcardOutlined />
                    KYC
                    {customer.kycStatus === 'PENDING' && <Badge count="!" style={{ backgroundColor: '#faad14' }} />}
                </Space>
            ),
            children: <KycTab />
        },
        {
            key: 'accounts',
            label: (
                <Space>
                    <BankOutlined />
                    Tài khoản & Phí
                </Space>
            ),
            children: <AccountsTab />
        },
    ];

    return (
        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
            {/* Back Button */}
            <Space style={{ marginBottom: 24 }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate('/customers')}
                    size="large"
                >
                    Quay lại danh sách
                </Button>
            </Space>

            {/* Header */}
            <HeaderCard />

            {/* Tabs */}
            <Card bordered={false} style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    size="large"
                    type="card"
                />
            </Card>

            {/* Loan Detail Drawer */}
            <Drawer
                title={loanDetails ? `Chi tiết khoản vay #${loanDetails.id}` : 'Đang tải...'}
                open={isModalOpen}
                onClose={() => { setIsModalOpen(false); setLoanDetails(null); setLoanDocuments([]); setViewLoanId(null); }}
                width={Math.min(960, window.innerWidth * 0.92)}
                destroyOnClose
                styles={{ body: { padding: 0 } }}
                extra={
                    <Space>
                        <Button type="primary" icon={<ClockCircleOutlined />} onClick={() => handleViewDetails(viewLoanId!, true)}>Làm mới thông tin</Button>
                        <Button type="text" icon={<CloseOutlined />} onClick={() => { setIsModalOpen(false); setLoanDetails(null); setLoanDocuments([]); setViewLoanId(null); }} />
                    </Space>
                }
            >
                {modalLoading ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}><Skeleton active /></div>
                ) : loanDetails && (
                    <Tabs defaultActiveKey="overview" type="card" className="mifos-tabs" items={[
                        {
                            key: 'overview',
                            label: 'Chung',
                            children: (
                                <div>
                                    {/* Clean Header for Loan Details */}
                                    <div style={{
                                        background: '#f8f9fa',
                                        padding: '24px 32px',
                                        borderBottom: '1px solid #eee',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <Space size={24}>
                                            <Avatar
                                                size={64}
                                                icon={<DollarOutlined />}
                                                style={{ backgroundColor: token.colorPrimaryBg, color: token.colorPrimary }}
                                            />
                                            <div>
                                                <div style={{ marginBottom: 4 }}>
                                                    <Text strong style={{ fontSize: 18 }}>
                                                        {loanDetails.loanProductName}
                                                    </Text>
                                                    <Text type="secondary" style={{ marginLeft: 8 }}>
                                                        #{loanDetails.accountNo}
                                                    </Text>
                                                </div>
                                                <Space>
                                                    <Tag color={loanDetails.delinquencyRange?.classification ? 'red' : 'green'}>
                                                        {loanDetails.delinquencyRange?.classification || 'Nợ đủ tiêu chuẩn'}
                                                    </Tag>
                                                    {loanDetails.delinquencyRange?.pastDueDays > 0 && (
                                                        <Tag color="error">Quá hạn {loanDetails.delinquencyRange.pastDueDays} ngày</Tag>
                                                    )}
                                                </Space>
                                            </div>
                                        </Space>
                                        <Row gutter={32}>
                                            <Col>
                                                <Statistic
                                                    title="Dư nợ hiện tại"
                                                    value={loanDetails.summary?.totalOutstanding}
                                                    formatter={v => fmtVND(Number(v))}
                                                    valueStyle={{ fontWeight: 700 }}
                                                />
                                            </Col>
                                            <Col>
                                                <Statistic
                                                    title="Tiền quá hạn"
                                                    value={loanDetails.summary?.totalOverdue}
                                                    formatter={v => fmtVND(Number(v))}
                                                    valueStyle={{ color: loanDetails.summary?.totalOverdue > 0 ? '#ff4d4f' : 'inherit', fontWeight: 700 }}
                                                />
                                            </Col>
                                        </Row>
                                    </div>

                                    <div style={{ padding: '24px' }}>
                                        {/* Performance Section */}
                                        <Card title="Lịch sử hiệu suất" size="small" style={{ marginBottom: 24 }}>
                                            <Row gutter={24}>
                                                <Col span={8}>
                                                    <Descriptions column={1} size="small" bordered>
                                                        <Descriptions.Item label="Số kỳ trả nợ">{loanDetails.numberOfRepayments}.00</Descriptions.Item>
                                                        <Descriptions.Item label="Ngày đáo hạn">{loanDetails.timeline?.expectedMaturityDate ? [...loanDetails.timeline.expectedMaturityDate].reverse().join('/') : '–'}</Descriptions.Item>
                                                    </Descriptions>
                                                </Col>
                                                <Col span={8}>
                                                    <Descriptions column={1} size="small" bordered contentStyle={{ whiteSpace: 'nowrap' }}>
                                                        <Descriptions.Item label="Tổng số tiền đã trả">{fmtVND(loanDetails.summary?.totalPaid ?? loanDetails.summary?.totalRepayment)}</Descriptions.Item>
                                                        <Descriptions.Item label="Ngày thanh toán cuối">{loanDetails.summary?.lastPaymentDate ? [...loanDetails.summary.lastPaymentDate].reverse().join('/') : '–'}</Descriptions.Item>
                                                    </Descriptions>
                                                </Col>
                                                <Col span={8}>
                                                    <Descriptions column={1} size="small" bordered contentStyle={{ whiteSpace: 'nowrap' }}>
                                                        <Descriptions.Item label="Số tiền thanh toán cuối">{fmtVND(loanDetails.summary?.lastPaymentAmount)}</Descriptions.Item>
                                                        <Descriptions.Item label="Số kỳ trả nợ quá hạn">{loanDetails.summary?.numberOfRepaymentsOverdue ?? 0}.00</Descriptions.Item>
                                                    </Descriptions>
                                                </Col>
                                            </Row>
                                        </Card>

                                        {/* Loan Summary Table - Mifos Style */}
                                        <Card title="Tóm tắt khoản vay" size="small">
                                            <Table
                                                size="small"
                                                pagination={false}
                                                bordered
                                                dataSource={[
                                                    { key: 'principal', label: 'Gốc', original: loanDetails.summary?.principalDisbursed, paid: loanDetails.summary?.principalPaid, waived: loanDetails.summary?.principalWaived, writtenOff: loanDetails.summary?.principalWrittenOff, outstanding: loanDetails.summary?.principalOutstanding, overdue: loanDetails.summary?.principalOverdue },
                                                    { key: 'interest', label: 'Lãi', original: loanDetails.summary?.interestCharged, paid: loanDetails.summary?.interestPaid, waived: loanDetails.summary?.interestWaived, writtenOff: loanDetails.summary?.interestWrittenOff, outstanding: loanDetails.summary?.interestOutstanding, overdue: loanDetails.summary?.interestOverdue },
                                                    { key: 'fees', label: 'Phí', original: loanDetails.summary?.feeChargesCharged, paid: loanDetails.summary?.feeChargesPaid, waived: loanDetails.summary?.feeChargesWaived, writtenOff: loanDetails.summary?.feeChargesWrittenOff, outstanding: loanDetails.summary?.feeChargesOutstanding, overdue: loanDetails.summary?.feeChargesOverdue },
                                                    { key: 'penalties', label: 'Phạt', original: loanDetails.summary?.penaltyChargesCharged, paid: loanDetails.summary?.penaltyChargesPaid, waived: loanDetails.summary?.penaltyChargesWaived, writtenOff: loanDetails.summary?.penaltyChargesWrittenOff, outstanding: loanDetails.summary?.penaltyChargesOutstanding, overdue: loanDetails.summary?.penaltyChargesOverdue },
                                                    { key: 'total', label: 'Tổng số', original: loanDetails.summary?.totalExpectedRepayment, paid: loanDetails.summary?.totalPaid ?? loanDetails.summary?.totalRepayment, waived: loanDetails.summary?.totalWaived, writtenOff: loanDetails.summary?.totalWrittenOff, outstanding: loanDetails.summary?.totalOutstanding, overdue: loanDetails.summary?.totalOverdue },
                                                ]}
                                                columns={[
                                                    { title: '', dataIndex: 'label', key: 'label' },
                                                    { title: 'Dự kiến', dataIndex: 'original', key: 'original', align: 'right', render: (v: number) => fmtVND(v) },
                                                    { title: 'Đã trả', dataIndex: 'paid', key: 'paid', align: 'right', render: (v: number) => fmtVND(v) },
                                                    { title: 'Đã miễn', dataIndex: 'waived', key: 'waived', align: 'right', render: (v: number) => fmtVND(v) },
                                                    { title: 'Đã xóa sổ', dataIndex: 'writtenOff', key: 'writtenOff', align: 'right', render: (v: number) => fmtVND(v) },
                                                    { title: 'Số dư nợ', dataIndex: 'outstanding', key: 'outstanding', align: 'right', render: (v: number) => fmtVND(v) },
                                                    {
                                                        title: 'Quá hạn', dataIndex: 'overdue', key: 'overdue', align: 'right', render: (v: number) => (
                                                            <Text type={v > 0 ? 'danger' : 'secondary'}>{fmtVND(v)}</Text>
                                                        )
                                                    },
                                                ]}
                                            />
                                        </Card>
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'details',
                            label: 'Chi tiết tài khoản',
                            children: (
                                <div style={{ padding: '8px 0' }}>
                                    <Descriptions bordered size="small" column={2}>
                                        <Descriptions.Item label="Sản phẩm">{loanDetails.loanProductName}</Descriptions.Item>
                                        <Descriptions.Item label="Số tài khoản">{loanDetails.accountNo}</Descriptions.Item>
                                        <Descriptions.Item label="ID Fineract">{loanDetails.id}</Descriptions.Item>
                                        <Descriptions.Item label="Bên ngoài ID">{loanDetails.externalId || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Tiền tệ">{loanDetails.currency?.displayLabel}</Descriptions.Item>
                                        <Descriptions.Item label="Chi nhánh">{loanDetails.officeName}</Descriptions.Item>

                                        <Descriptions.Item label="Số tiền gốc">{fmtVND(loanDetails.principal)}</Descriptions.Item>
                                        <Descriptions.Item label="Số kỳ hạn">{loanDetails.numberOfRepayments} {loanDetails.repaymentFrequencyType?.value}</Descriptions.Item>
                                        <Descriptions.Item label="Lãi suất">{loanDetails.annualInterestRate}% / năm ({loanDetails.interestRatePerPeriod}% / {loanDetails.interestRateFrequencyType?.value})</Descriptions.Item>
                                        <Descriptions.Item label="Kiểu lãi suất">{loanDetails.interestType?.value}</Descriptions.Item>
                                        <Descriptions.Item label="Phương thức Amortization">{loanDetails.amortizationType?.value}</Descriptions.Item>
                                        <Descriptions.Item label="Chiến lược giao dịch">{loanDetails.transactionProcessingStrategyName}</Descriptions.Item>

                                        <Descriptions.Item label="Ngày nộp">{loanDetails.timeline?.submittedOnDate?.reverse().join('/')}</Descriptions.Item>
                                        <Descriptions.Item label="Ngày giải ngân">{loanDetails.timeline?.actualDisbursementDate?.reverse().join('/') || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Ngày đáo hạn dự kiến">{loanDetails.timeline?.expectedMaturityDate?.reverse().join('/') || '–'}</Descriptions.Item>
                                    </Descriptions>
                                </div>
                            )
                        },
                        {
                            key: 'transactions',
                            label: 'Giao dịch',
                            children: (
                                <div style={{ padding: '8px 0' }}>
                                    <Table
                                        dataSource={loanDetails.transactions || []}
                                        pagination={{ pageSize: 10 }}
                                        size="small"
                                        rowKey="id"
                                        scroll={{ x: 1200 }}
                                        columns={[
                                            { title: '#', key: 'index', width: 50, render: (_1: any, _2: any, index: number) => index + 1 },
                                            { title: 'ID', dataIndex: 'id', width: 80 },
                                            { title: 'Văn phòng', dataIndex: 'officeName', width: 120, render: () => loanDetails.officeName },
                                            { title: 'Bên ngoài ID', dataIndex: 'externalId', width: 120, render: (v: any) => v || '–' },
                                            { title: 'Ngày giao dịch', dataIndex: 'date', width: 120, render: (v: any) => v ? [...v].reverse().join('/') : '–' },
                                            { title: 'Loại', key: 'type', width: 200, render: (_: any, r: any) => <Tag color={r.type?.repayment ? 'green' : (r.type?.disbursement ? 'gold' : 'blue')}>{r.type?.value}</Tag> },
                                            { title: 'Số tiền', dataIndex: 'amount', align: 'right', width: 120, render: (v: any) => fmtVND(v) },
                                            { title: 'Gốc', dataIndex: 'principalPortion', align: 'right', width: 100, render: (v: any) => fmtVND(v) },
                                            { title: 'Lãi', dataIndex: 'interestPortion', align: 'right', width: 100, render: (v: any) => fmtVND(v) },
                                            { title: 'Phí', dataIndex: 'feeChargesPortion', align: 'right', width: 100, render: (v: any) => fmtVND(v) },
                                            { title: 'Phạt', dataIndex: 'penaltyChargesPortion', align: 'right', width: 100, render: (v: any) => fmtVND(v) },
                                            { title: 'Số dư nợ', dataIndex: 'loanBalance', align: 'right', width: 120, render: (v: any) => fmtVND(v) },
                                        ]}
                                    />
                                </div>
                            )
                        },
                        {
                            key: 'schedule',
                            label: 'Lịch trả nợ',
                            children: (
                                <Table
                                    dataSource={
                                        Array.isArray(loanDetails.repaymentSchedule)
                                            ? loanDetails.repaymentSchedule
                                            : (loanDetails.repaymentSchedule?.periods || [])
                                    }
                                    pagination={false}
                                    size="small"
                                    scroll={{ y: 600, x: 1800 }}
                                    rowKey="period"
                                    rowClassName={(record) => {
                                        const s = getInstallmentStatus(record);
                                        return `schedule-row-${s}`;
                                    }}
                                    columns={[
                                        { title: '#', dataIndex: 'period', width: 50, fixed: 'left' },
                                        {
                                            title: 'Tình trạng',
                                            key: 'status',
                                            width: 120,
                                            fixed: 'left',
                                            render: (_: any, record: any) => {
                                                const s = getInstallmentStatus(record);
                                                const config = { paid: { color: 'success', label: 'Đã trả' }, overdue: { color: 'error', label: 'Quá hạn' }, current: { color: 'processing', label: 'Đang đến hạn' }, upcoming: { color: 'default', label: 'Chưa đến hạn' } };
                                                return <Tag color={config[s].color}>{config[s].label}</Tag>;
                                            },
                                        },
                                        { title: 'Ngày', dataIndex: 'dueDate', width: 110, render: (v: any) => v ? [...v].reverse().join('/') : '–' },
                                        { title: 'Ngày trả', dataIndex: 'obligationsMetOnDate', width: 110, render: (v: any) => v ? [...v].reverse().join('/') : '–' },
                                        { title: 'Dư nợ khoản vay', dataIndex: 'principalLoanBalanceOutstanding', align: 'right', width: 140, render: (v: any) => fmtVND(v) },
                                        { title: 'Gốc đến hạn', dataIndex: 'principalDue', align: 'right', width: 120, render: (v: any) => fmtVND(v) },
                                        { title: 'Lãi', dataIndex: 'interestDue', align: 'right', width: 100, render: (v: any) => fmtVND(v) },
                                        { title: 'Phí', dataIndex: 'feeChargesDue', align: 'right', width: 100, render: (v: any) => fmtVND(v) },
                                        { title: 'Các khoản phạt', dataIndex: 'penaltyChargesDue', align: 'right', width: 120, render: (v: any) => fmtVND(v) },
                                        { title: 'Đến hạn', dataIndex: 'totalDueForPeriod', align: 'right', width: 130, render: (v: any) => fmtVND(v) },
                                        { title: 'Đã trả', dataIndex: 'totalPaidForPeriod', align: 'right', width: 130, render: (v: any) => fmtVND(v) },
                                        { title: 'Trước', dataIndex: 'totalPaidInAdvanceForPeriod', align: 'right', width: 110, render: (v: any) => fmtVND(v) },
                                        { title: 'Muộn', dataIndex: 'totalPaidLateForPeriod', align: 'right', width: 110, render: (v: any) => fmtVND(v) },
                                        { title: 'Chưa thanh toán', dataIndex: 'totalOutstandingForPeriod', align: 'right', width: 140, render: (v: any) => fmtVND(v) },
                                        { title: 'Quá hạn', dataIndex: 'totalOverdue', align: 'right', width: 130, render: (v: any) => (v > 0 ? <Text type="danger">{fmtVND(v)}</Text> : fmtVND(v ?? 0)) },
                                    ]}
                                />
                            )
                        },
                        {
                            key: 'delinquency',
                            label: 'Quá hạn & Rủi ro',
                            children: (
                                <div style={{ padding: '24px' }}>
                                    <Row gutter={[24, 24]}>
                                        <Col span={24}>
                                            <Alert
                                                message={<Text strong style={{ fontSize: 16 }}>Thông tin nợ quá hạn hiện tại</Text>}
                                                description={
                                                    <Row gutter={48}>
                                                        <Col>
                                                            <Statistic
                                                                title="Tổng tiền quá hạn"
                                                                value={loanDetails.summary?.totalOverdue}
                                                                formatter={v => fmtVND(Number(v))}
                                                                valueStyle={{ color: '#ff4d4f', fontWeight: 700 }}
                                                            />
                                                        </Col>
                                                        <Col>
                                                            <Statistic
                                                                title="Số ngày quá hạn"
                                                                value={loanDetails.delinquencyRange?.pastDueDays ?? 0}
                                                                suffix="ngày"
                                                                valueStyle={{ color: (loanDetails.delinquencyRange?.pastDueDays > 0) ? '#ff4d4f' : 'inherit', fontWeight: 700 }}
                                                            />
                                                        </Col>
                                                        <Col>
                                                            <Statistic
                                                                title="Phân loại hiện tại"
                                                                value={loanDetails.delinquencyRange?.classification || 'Nhóm 1'}
                                                                valueStyle={{ color: loanDetails.delinquencyRange?.classification ? '#ff4d4f' : '#52c41a', fontWeight: 700 }}
                                                            />
                                                        </Col>
                                                    </Row>
                                                }
                                                type={loanDetails.summary?.totalOverdue > 0 ? "error" : "success"}
                                                showIcon
                                                icon={<ExclamationCircleOutlined />}
                                                style={{ marginBottom: 24, borderRadius: 8 }}
                                            />
                                        </Col>

                                        <Col span={24}>
                                            <Card size="small" title={<Space><ClockCircleOutlined /> Lịch sử thẻ nợ (Delinquency Tags)</Space>} bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                                <Table
                                                    size="small"
                                                    pagination={false}
                                                    dataSource={loanDetails.delinquencyTags || []}
                                                    columns={[
                                                        { title: 'Phân loại', dataIndex: ['delinquencyRange', 'classification'], render: (v) => <Tag color="red">{v}</Tag> },
                                                        { title: 'Ngày bắt đầu', dataIndex: 'addedOnDate', render: (v: any) => v ? [...v].reverse().join('/') : '–' },
                                                        { title: 'Ngày kết thúc', dataIndex: 'liftedOnDate', render: (v: any) => v ? [...v].reverse().join('/') : <Text type="secondary">Đang áp dụng</Text> },
                                                    ]}
                                                    locale={{ emptyText: 'Chưa có lịch sử thẻ nợ' }}
                                                />
                                            </Card>
                                        </Col>

                                        <Col span={12}>
                                            <Card size="small" title="Quá hạn theo kỳ trả nợ" bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
                                                <Table
                                                    size="small"
                                                    pagination={false}
                                                    scroll={{ x: 320 }}
                                                    dataSource={
                                                        (loanDetails.periodDelinquency && loanDetails.periodDelinquency.length > 0)
                                                            ? loanDetails.periodDelinquency
                                                            : []
                                                    }
                                                    rowKey="period"
                                                    columns={[
                                                        { title: 'Kỳ', dataIndex: 'period', width: 56 },
                                                        { title: 'Ngày đến hạn', dataIndex: 'dueDate', width: 110 },
                                                        { title: 'Nhóm', dataIndex: 'classification', width: 140, render: (v: any) => v ? <Tag color="orange">{v}</Tag> : '–' },
                                                        { title: 'Tiền quá hạn', dataIndex: 'totalOverdue', align: 'right', width: 120, render: (v: any) => <Text type="danger" style={{ whiteSpace: 'nowrap' }}>{fmtVND(v)}</Text> },
                                                    ]}
                                                    locale={{ emptyText: 'Không có kỳ nào quá hạn' }}
                                                />
                                            </Card>
                                        </Col>

                                        <Col span={12}>
                                            <Card size="small" title="Phân bổ tiền quá hạn (Phổ nợ)" bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
                                                <Table
                                                    size="small"
                                                    pagination={false}
                                                    scroll={{ x: 340 }}
                                                    dataSource={loanDetails.installmentLevelDelinquency || []}
                                                    rowKey={(r: any) => r.classification || `${r.minimumAgeDays}-${r.maximumAgeDays}`}
                                                    columns={[
                                                        { title: 'Nhóm nợ', dataIndex: 'classification', width: 160 },
                                                        { title: 'Khoảng ngày', key: 'range', width: 100, render: (_: any, r: any) => `${r.minimumAgeDays ?? '–'}–${r.maximumAgeDays ?? '–'} ngày` },
                                                        { title: 'Số tiền', dataIndex: 'delinquentAmount', align: 'right', width: 120, render: (v: any) => <Text strong style={{ whiteSpace: 'nowrap' }}>{fmtVND(v)}</Text> },
                                                    ]}
                                                    locale={{ emptyText: 'Chưa có phân bổ tiền quá hạn' }}
                                                />
                                            </Card>
                                        </Col>

                                        <Col span={24} style={{ textAlign: 'right', marginTop: 8 }}>
                                            <Button type="default" icon={<PauseCircleOutlined />} danger>Tạm dừng phân loại nợ</Button>
                                        </Col>
                                    </Row>
                                </div>
                            )
                        },
                        {
                            key: 'charges',
                            label: 'Các khoản phí',
                            children: (
                                <Table
                                    dataSource={loanDetails.charges || []}
                                    pagination={false}
                                    size="small"
                                    columns={[
                                        { title: 'Tên', dataIndex: 'name' },
                                        { title: 'Phí/Phạt', dataIndex: 'penalty', render: (v: any) => v ? 'Phạt' : 'Phí' },
                                        { title: 'Thanh toán đến hạn vào', dataIndex: 'chargeTimeType', render: (v: any) => v?.value },
                                        { title: 'Đến hạn tính đến', dataIndex: 'dueDate', render: (v: any) => v ? [...v].reverse().join('/') : '–' },
                                        { title: 'Loại tính toán', dataIndex: 'chargeCalculationType', render: (v: any) => v?.value },
                                        { title: 'Đến hạn', dataIndex: 'amount', align: 'right', render: (v: any) => fmtVND(v) },
                                        { title: 'Đã trả', dataIndex: 'amountPaid', align: 'right', render: (v: any) => fmtVND(v) },
                                        { title: 'Đã miễn', dataIndex: 'amountWaived', align: 'right', render: (v: any) => fmtVND(v) },
                                        { title: 'Chưa thanh toán', dataIndex: 'amountOutstanding', align: 'right', render: (v: any) => fmtVND(v) },
                                    ]}
                                />
                            )
                        },
                        {
                            key: 'documents',
                            label: (
                                <Badge count={loanDocuments.length} size="small" offset={[10, 0]}>
                                    Hồ sơ tài liệu
                                </Badge>
                            ),
                            children: (
                                <Table
                                    dataSource={loanDocuments}
                                    loading={loadingDocuments}
                                    pagination={false}
                                    size="small"
                                    rowKey="id"
                                    columns={[
                                        {
                                            title: 'Loại tài liệu',
                                            dataIndex: 'documentTypeName',
                                            width: 200,
                                            render: (v: any) => v || <Text type="secondary">Chưa phân loại</Text>,
                                        },
                                        {
                                            title: 'Tên file gốc',
                                            dataIndex: 'originalName',
                                            ellipsis: true,
                                            render: (v: any, r: any) => v || r.fileName,
                                        },
                                        { title: 'Định dạng', dataIndex: 'type', width: 120, align: 'center' },
                                        {
                                            title: 'Ngày tải lên',
                                            key: 'createdAt',
                                            width: 180,
                                            align: 'center',
                                            render: (_: any, r: any) => {
                                                const date = r.uploadedAt || r.createdDate;
                                                return date ? new Date(date).toLocaleString('vi-VN') : '–';
                                            },
                                        },
                                        {
                                            title: 'Hành động',
                                            key: 'action',
                                            width: 150,
                                            align: 'right',
                                            render: (_: any, r: any) => (
                                                <Button
                                                    type="link"
                                                    icon={<EyeOutlined />}
                                                    onClick={() => handleDownloadDocument(r.id, r.originalName || r.fileName || 'document')}
                                                >
                                                    Xem/Tải về
                                                </Button>
                                            ),
                                        },
                                    ]}
                                    locale={{ emptyText: 'Chưa có tài liệu đính kèm' }}
                                />
                            ),
                        },
                    ]} />
                )}
            </Drawer>

            {/* KYC Document Viewer Modal */}
            <Drawer
                title={viewingKycDoc?.name || 'Tài liệu KYC'}
                open={!!viewingKycDoc}
                onClose={() => setViewingKycDoc(null)}
                width={800}
                destroyOnClose
            >
                {viewingKycDoc && id && (
                    <div style={{ textAlign: 'center' }}>
                        <Image
                            src={kycDocImages[`${viewingKycDoc.entityType}-${viewingKycDoc.entityId}-${viewingKycDoc.documentId}`]}
                            alt={viewingKycDoc.name}
                            style={{ maxWidth: '100%' }}
                        />
                    </div>
                )}
            </Drawer>
            <style>{`
                .mifos-tabs .ant-tabs-nav {
                    background: #f4f4f4;
                    margin: 0 !important;
                    padding: 0 24px;
                }
                .mifos-tabs .ant-tabs-tab {
                    border: none !important;
                    background: transparent !important;
                    margin: 0 !important;
                    padding: 12px 20px !important;

                }
                .mifos-tabs .ant-tabs-tab-active {
                    background: #fff !important;
                    border-top: 3px solid #0071b9 !important;
                }
                .mifos-summary-label {
                    background: #f9f9f9;
                    font-weight: 500;
                    width: 150px;
                }
                .mifos-tabs .ant-tabs-content-holder {
                    background: #fff;
                }
            `}</style>
        </div>
    );
}
