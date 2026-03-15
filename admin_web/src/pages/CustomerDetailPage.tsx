import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { ActionType } from '@ant-design/pro-components';
import {
    Card, Typography, Tag, Descriptions, Button, Space,
    Skeleton, Statistic, Row, Col, Avatar, Divider, message, theme,
    Drawer, Tabs, Table, Badge, Alert, Empty, Image, Popconfirm, Upload, Form, Tooltip
} from 'antd';
import {
    EyeOutlined, ArrowLeftOutlined, UserOutlined, BankOutlined,
    DollarOutlined, ClockCircleOutlined, FileTextOutlined, InfoCircleOutlined,
    IdcardOutlined, PhoneOutlined, MailOutlined, HomeOutlined, TeamOutlined,
    CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, ExclamationCircleOutlined,
    CheckOutlined, UploadOutlined, FilterOutlined, ReloadOutlined
} from '@ant-design/icons';
import { adminApi, CustomerDetailDto } from '../api/admin';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';
import LoanDetailDrawer from '../components/LoanDetailDrawer';
import LoanTable from '../components/LoanTable';
import LoanFilterForm from '../components/LoanFilterForm';
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

    // Chi tiết khoản vay - dùng LoanDetailDrawer thống nhất
    const [viewLoanId, setViewLoanId] = useState<number | null>(null);
    const [syncingAll, setSyncingAll] = useState(false);
    const customerLoanActionRef = useRef<ActionType>();
    const [customerLoanFiltersOpen, setCustomerLoanFiltersOpen] = useState(false);
    const [customerLoanForm] = Form.useForm();

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        adminApi.getCustomerDetail(id)
            .then(setDetail)
            .catch(() => setError('Không thể tải thông tin khách hàng'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        customerLoanForm.resetFields();
        setCustomerLoanFiltersOpen(false);
    }, [id, customerLoanForm]);

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

    const handleViewDetails = (fineractLoanId: number) => {
        setViewLoanId(fineractLoanId);
    };

    // Mở drawer chi tiết khoản vay khi vào từ trang "Khoản vay quá hạn" với ?viewLoan=...
    useEffect(() => {
        if (!id || !detail || !viewLoanParam) return;
        const loanId = parseInt(viewLoanParam, 10);
        if (!Number.isFinite(loanId)) return;
        setViewLoanId(loanId);
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

    if (loading) return (
        <div>
            <Card><Skeleton active /></Card>
        </div>
    );

    if (error) return (
        <div>
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
                borderRadius: 0,
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            }}
        >
            <Row gutter={[24, 16]} align="middle">
                <Col flex="none">
                    <Avatar
                        size={64}
                        icon={<UserOutlined />}
                        style={{
                            backgroundColor: token.colorPrimaryBg,
                            color: token.colorPrimary,
                            fontSize: 32,
                            border: `3px solid ${token.colorBgContainer}`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                    />
                </Col>
                <Col flex="auto">
                    <div style={{ marginBottom: 8 }}>
                        <Title level={3} style={{ margin: 0, fontWeight: 700, display: 'inline-block', marginRight: 12 }}>
                            {customer.displayName || customer.username}
                        </Title>
                        <Space size={8} style={{ verticalAlign: 'middle' }}>
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
                        <Descriptions.Item label={<><HomeOutlined style={{ marginRight: 4 }} /><strong>Văn phòng</strong></>}>
                            {customer.officeName || 'Head Office'}
                        </Descriptions.Item>
                        <Descriptions.Item label={<><TeamOutlined style={{ marginRight: 4 }} /><strong>Khách hàng</strong></>}>
                            <Text code>{customer.fineractClientId ? String(customer.fineractClientId).padStart(9, '0') : '–'}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={<><IdcardOutlined style={{ marginRight: 4 }} /><strong>ID bên ngoài</strong></>}>
                            {customer.externalId || customer.username || '–'}
                        </Descriptions.Item>
                        <Descriptions.Item label={<><UserOutlined style={{ marginRight: 4 }} /><strong>Nhân viên</strong></>}>
                            {customer.staffName || <Text type="secondary">Chưa phân công</Text>}
                        </Descriptions.Item>
                        <Descriptions.Item label={<><PhoneOutlined style={{ marginRight: 4 }} /><strong>Số điện thoại</strong></>}>
                            {customer.mobileNo || customer.username || '–'}
                        </Descriptions.Item>
                        <Descriptions.Item label={<><MailOutlined style={{ marginRight: 4 }} /><strong>Email</strong></>}>
                            {customer.email || '–'}
                        </Descriptions.Item>
                    </Descriptions>
                </Col>
                <Col flex="none" style={{ textAlign: 'right', minWidth: 180 }}>
                    <Statistic
                        title="Tổng vốn vay"
                        value={totalCapital}
                        formatter={v => fmtVND(Number(v))}
                        valueStyle={{ color: token.colorPrimary, fontWeight: 700 }}
                    />
                    <div style={{ marginTop: 16 }}>
                        {ability.can(Action.Update, 'Customer') && (
                            <Button
                                icon={<ClockCircleOutlined />}
                                onClick={handleSyncAllLoans}
                                loading={syncingAll}
                                type="primary"
                                ghost
                                size="small"
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
    const GeneralTab = () => {
        const customerProducts = Array.from(
            new Map(
                loans
                    .filter((l) => l.productId != null)
                    .map((l) => [l.productId, { id: Number(l.productId), name: l.productName || `SP #${l.productId}`, shortName: l.productShortName || l.productName || `SP #${l.productId}` }]),
            ).values(),
        );

        const customerRanges = Array.from(
            new Set(loans.map((l: any) => l?.delinquencyClassification).filter(Boolean)),
        ).map((classification, idx) => ({ id: idx + 1, classification: String(classification) }));

        return (
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

                {/* Loan Accounts - dùng LoanTable + filter thống nhất */}
                <Card
                    title={<Space><BankOutlined /> Các tài khoản vay</Space>}
                    bordered={false}
                    style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                    <LoanTable
                        key={`customer-loans-${id}-${loans.length}`}
                        variant="customer"
                        request={async (params) => {
                            const values = customerLoanForm.getFieldsValue();
                            const keyword = String(values.keyword || '').toLowerCase().trim();
                            const productId = values.productId ? Number(values.productId) : undefined;
                            const classification = values.classification ? String(values.classification) : undefined;
                            const delinquentDaysMin = values.delinquentDaysMin != null ? Number(values.delinquentDaysMin) : undefined;
                            const delinquentDaysMax = values.delinquentDaysMax != null ? Number(values.delinquentDaysMax) : undefined;
                            const minOverdueAmount = values.minOverdueAmount != null ? Number(values.minOverdueAmount) : undefined;
                            const maxOverdueAmount = values.maxOverdueAmount != null ? Number(values.maxOverdueAmount) : undefined;
                            const dateRange = values.disbursementDate;

                            let filtered = [...(loans as any[])];

                            if (keyword) {
                                filtered = filtered.filter((l) => {
                                    const loanNo = String(l.fineractLoanId || '');
                                    const product = String(l.productName || l.productShortName || '').toLowerCase();
                                    const willing = String(l.willing || '').toLowerCase();
                                    return loanNo.includes(keyword) || product.includes(keyword) || willing.includes(keyword);
                                });
                            }
                            if (productId != null && !Number.isNaN(productId)) {
                                filtered = filtered.filter((l) => Number(l.productId) === productId);
                            }
                            if (classification) {
                                filtered = filtered.filter((l) => String(l.delinquencyClassification || '') === classification);
                            }
                            if (delinquentDaysMin != null) {
                                filtered = filtered.filter((l) => Number(l.delinquentDays || 0) >= delinquentDaysMin);
                            }
                            if (delinquentDaysMax != null) {
                                filtered = filtered.filter((l) => Number(l.delinquentDays || 0) <= delinquentDaysMax);
                            }
                            if (minOverdueAmount != null) {
                                filtered = filtered.filter((l) => Number(l.totalOverdue || 0) >= minOverdueAmount);
                            }
                            if (maxOverdueAmount != null) {
                                filtered = filtered.filter((l) => Number(l.totalOverdue || 0) <= maxOverdueAmount);
                            }
                            if (Array.isArray(dateRange) && dateRange[0] && dateRange[1]) {
                                const from = dateRange[0].startOf('day').valueOf();
                                const to = dateRange[1].endOf('day').valueOf();
                                filtered = filtered.filter((l) => {
                                    const rawDate = l.disbursementDate || l.createdAt;
                                    if (!rawDate) return false;
                                    const dateVal = Array.isArray(rawDate)
                                        ? new Date(rawDate[0], (rawDate[1] ?? 1) - 1, rawDate[2] ?? 1).getTime()
                                        : new Date(rawDate as string).getTime();
                                    if (Number.isNaN(dateVal)) return false;
                                    return dateVal >= from && dateVal <= to;
                                });
                            }

                            const page = params.current ?? 1;
                            const size = params.pageSize ?? 10;
                            const start = (page - 1) * size;
                            const paged = filtered.slice(start, start + size);
                            return { data: paged as any, success: true, total: filtered.length };
                        }}
                        onViewDetails={(loanId) => handleViewDetails(loanId)}
                        actionRef={customerLoanActionRef}
                        showFilterPanel={customerLoanFiltersOpen}
                        filterContent={(ref) => (
                            <LoanFilterForm
                                form={customerLoanForm}
                                actionRef={ref}
                                products={customerProducts}
                                ranges={customerRanges}
                                activeTab="all"
                            />
                        )}
                        toolBarRender={() => [
                            <Tooltip key="filter" title="Bộ lọc nâng cao">
                                <Button icon={<FilterOutlined />} onClick={() => setCustomerLoanFiltersOpen(!customerLoanFiltersOpen)} type={customerLoanFiltersOpen ? 'primary' : 'default'}>
                                    Bộ lọc
                                </Button>
                            </Tooltip>,
                            <Tooltip key="reload" title="Làm mới danh sách khoản vay">
                                <Button icon={<ReloadOutlined />} onClick={() => customerLoanActionRef.current?.reloadAndRest?.()}>
                                    Làm mới
                                </Button>
                            </Tooltip>,
                        ]}
                        headerTitle="Danh sách khoản vay"
                        pagination={{ pageSize: 10, showTotal: (t) => `Tổng ${t} khoản` }}
                        columnsStateKey="customer-loans-table-v2"
                    />
                </Card>
            </>
        );
    };

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
        <div>
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

            {/* Chi tiết khoản vay - Component thống nhất */}
            <LoanDetailDrawer
                open={!!viewLoanId}
                onClose={() => setViewLoanId(null)}
                loanId={viewLoanId}
                userId={id ?? undefined}
                mode="view"
            />

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
        </div>
    );
}
