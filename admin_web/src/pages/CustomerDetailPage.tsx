import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType } from '@ant-design/pro-components';
import {
    Card, Typography, Tag, Descriptions, Button, Space,
    Row, Col, Avatar, message, theme,
    Drawer, Tabs, Table, Badge, Empty, Image, Popconfirm, Upload, Form, Tooltip,
    Modal, Input,
    Alert
} from 'antd';
import {
    EyeOutlined, ArrowLeftOutlined, UserOutlined, BankOutlined,
    DollarOutlined, ClockCircleOutlined, FileTextOutlined, InfoCircleOutlined,
    IdcardOutlined, PhoneOutlined, MailOutlined, HomeOutlined,
    CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, ExclamationCircleOutlined,
    CheckOutlined, UploadOutlined, FilterOutlined, ReloadOutlined, HourglassOutlined,
    WalletOutlined, FileDoneOutlined
} from '@ant-design/icons';
import { adminApi, CustomerDetailDto } from '../api/admin';
import { DetailSkeleton } from '../components/PageSkeleton';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';
import LoanDetailDrawer from '../components/LoanDetailDrawer';
import LoanTable from '../components/LoanTable';
import LoanFilterForm from '../components/LoanFilterForm';
import { StatDisplayCards } from '../components/StatFilterCards';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';

const { Title, Text } = Typography;

// Tab items type
interface TabItem {
    key: string;
    label: React.ReactNode;
    children: React.ReactNode;
}

// KYC Reject Modal Component - Extract to avoid lag on main Detail Page
interface KYCRejectModalProps {
    open: boolean;
    onCancel: () => void;
    onReject: (reason: string) => void;
    loading: boolean;
}

const KYCRejectModal = ({ open, onCancel, onReject, loading }: KYCRejectModalProps) => {
    const [reason, setReason] = useState('');
    const { token } = theme.useToken();

    return (
        <Modal
            open={open}
            title={null}
            footer={null}
            onCancel={() => { setReason(''); onCancel(); }}
            destroyOnHidden
            centered
            width={480}
            closable={false}
            styles={{ body: { padding: 0 } }}
        >
            <div style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: token.colorBgElevated }}>
                <div style={{ padding: '20px 20px 0 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: token.colorTextHeading }}>Từ chối hồ sơ KYC</span>
                        <CloseOutlined
                            onClick={() => { setReason(''); onCancel(); }}
                            style={{ fontSize: 16, cursor: 'pointer', color: token.colorTextSecondary }}
                        />
                    </div>

                    <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                        Thông tin lý do từ chối sẽ được hiển thị ngay lập tức trên ứng dụng của khách hàng.
                    </Text>

                    <Input.TextArea
                        autoFocus
                        rows={4}
                        placeholder="VD: Ảnh chụp CCCD bị mờ, không rõ số hoặc bị chói sáng..."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        style={{ borderRadius: 8, fontSize: 14, padding: 10 }}
                    />
                </div>

                <div style={{ padding: '16px 20px 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <Button onClick={() => { setReason(''); onCancel(); }} style={{ borderRadius: 6 }}>
                        Hủy
                    </Button>
                    <Button
                        type="primary"
                        danger
                        loading={loading}
                        onClick={() => {
                            if (!reason.trim()) {
                                message.warning('Vui lòng nhập lý do từ chối');
                                return;
                            }
                            onReject(reason);
                        }}
                        style={{ borderRadius: 6, paddingLeft: 20, paddingRight: 20 }}
                    >
                        Xác nhận từ chối
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

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
    const [rejectReasonModal, setRejectReasonModal] = useState(false);

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

    const handleRejectKyc = async (reason?: string) => {
        if (!kycUserId) return;
        setKycRejecting(true);
        try {
            await adminApi.rejectKyc(kycUserId, reason);
            message.success('Đã từ chối kích hoạt');
            setRejectReasonModal(false);
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
        if (!raw) return null;
        // Xử lý cả cấu trúc lồng nhau từ Python và cấu trúc phẳng nếu đã qua xử lý
        const r = raw?.result ?? raw?.data ?? raw;
        const inner = r?.data ?? r;
        if (!inner) return null;
        
        return {
            ...inner,
            issueDate: inner.issueDate || inner.issue_date || inner.init_date,
            issuer: inner.issuer || inner.Issuer || inner.issuer_name,
            personalIdentification: inner.personalIdentification || inner.personal_identification || inner.Personal_identification,
            mrz: inner.mrz || inner.MRZ,
        };
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

    if (loading) return <DetailSkeleton />;

    if (error) return (
        <div>
            <Alert type="warning" showIcon description="Vui lòng nhấn vào thông báo để xem giải pháp khắc phục." />
        </div>
    );

    if (!customer) return null;

    const totalCapital = loans.reduce((s, l) => s + (l.capital || 0), 0);

    // Header card with client info — redesigned per Pencil mockup
    const HeaderCard = () => (
        <Card
            variant="borderless"
            style={{
                marginBottom: 0,
                borderRadius: 16,
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                overflow: 'hidden',
            }}
            styles={{ body: { padding: '20px 28px' } }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Avatar */}
                <Avatar
                    size={64}
                    icon={<UserOutlined />}
                    style={{
                        background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
                        color: '#fff',
                        fontSize: 28,
                        flexShrink: 0,
                    }}
                />
                {/* Info column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Title level={4} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
                            {customer.displayName || customer.username}
                        </Title>
                        <FineractStatusBadge status={customer.fineractStatus} />
                        {customer.kycStatus === 'VERIFIED' ? (
                            <Tag color="success" icon={<CheckCircleOutlined />} style={{ borderRadius: 4, margin: 0 }}>KYC Đã xác minh</Tag>
                        ) : customer.kycStatus === 'PENDING' ? (
                            <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ borderRadius: 4, margin: 0 }}>KYC Chờ duyệt</Tag>
                        ) : customer.kycStatus === 'REJECTED' ? (
                            <Tag color="error" icon={<CloseCircleOutlined />} style={{ borderRadius: 4, margin: 0 }}>KYC Từ chối</Tag>
                        ) : (
                            <Tag style={{ borderRadius: 4, margin: 0 }}>Chưa KYC</Tag>
                        )}
                    </div>
                    {/* Compact metadata row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <HomeOutlined style={{ marginRight: 4 }} /> {customer.officeName || 'Head Office'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <PhoneOutlined style={{ marginRight: 4 }} /> {customer.mobileNo || customer.username || '–'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <MailOutlined style={{ marginRight: 4 }} /> {customer.email || '–'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <IdcardOutlined style={{ marginRight: 4 }} /> {customer.fineractClientId ? String(customer.fineractClientId).padStart(9, '0') : '–'}
                        </Text>
                        {customer.staffName && (
                            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                <UserOutlined style={{ marginRight: 4 }} /> {customer.staffName}
                            </Text>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );

    // Performance History Section - Redesigned to be flat
    const PerformanceSection = () => {
        const statCardStyle = (color: string) => ({
            borderRadius: 16,
            border: 'none',
            background: `${token.colorBgContainer}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            height: '100%',
        } as React.CSSProperties);

        return (
            <div style={{ marginBottom: 24 }}>
                {summary ? (
                    <>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={12} lg={6}>
                                <Card variant="borderless" style={statCardStyle(token.colorWarning)} styles={{ body: { padding: '20px' } }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${token.colorWarning}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <ClockCircleOutlined style={{ fontSize: 20, color: token.colorWarning }} />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Chu kỳ vay</Text>
                                            <Text style={{ fontSize: 24, fontWeight: 800, color: token.colorWarning }}>{summary.loanCycles}</Text>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Card variant="borderless" style={statCardStyle(token.colorPrimary)} styles={{ body: { padding: '20px' } }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${token.colorPrimary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <DollarOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Khoản vay hoạt động</Text>
                                            <Text style={{ fontSize: 24, fontWeight: 800, color: token.colorPrimary }}>{summary.activeLoans}</Text>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Card variant="borderless" style={statCardStyle(token.colorSuccess)} styles={{ body: { padding: '20px' } }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${token.colorSuccess}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <BankOutlined style={{ fontSize: 20, color: token.colorSuccess }} />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tiết kiệm hoạt động</Text>
                                            <Text style={{ fontSize: 24, fontWeight: 800, color: token.colorSuccess }}>{summary.activeSavings}</Text>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Card variant="borderless" style={statCardStyle(token.colorInfo)} styles={{ body: { padding: '20px' } }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${token.colorInfo}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <CheckCircleOutlined style={{ fontSize: 20, color: token.colorInfo }} />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tổng tiết kiệm</Text>
                                            <Text style={{ fontSize: 24, fontWeight: 800, color: token.colorInfo }}>{fmtVND(summary.totalSavings)}</Text>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        </Row>
                        <div style={{
                            marginTop: 16,
                            padding: '10px 20px',
                            background: `${token.colorFillQuaternary}`,
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: 13
                        }}>
                            <span style={{ color: token.colorTextSecondary, marginRight: 8 }}>Khoản vay gần nhất:</span>
                            <span style={{ fontWeight: 600 }}>{fmtVND(summary.lastLoanAmount || 0)}</span>
                        </div>
                    </>
                ) : (
                    <Empty description="Chưa có dữ liệu hiệu suất" />
                )}
            </div>
        );
    };

    // Loans Tab Content — follows LoansPage UI pattern with stat cards
    const LoansTab = () => {
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

        // Compute stats from local loans data
        const loanStats = {
            total: loans.length,
            pending: loans.filter(l => ['pending', 'submitted'].includes(String(l.status?.code || l.status).toLowerCase())).length,
            approved: loans.filter(l => String(l.status?.code || l.status).toLowerCase() === 'approved').length,
            disbursed: loans.filter(l => ['disbursed', 'active'].includes(String(l.status?.code || l.status).toLowerCase())).length,
            overdue: loans.filter(l => Number((l as any).delinquentDays || 0) > 0).length,
            closed: loans.filter(l => String(l.status?.code || l.status).toLowerCase() === 'closed').length,
        };

        const loanStatItems = [
            { title: 'Tổng khoản vay', value: loanStats.total, color: '#1E40AF', gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)', icon: <DollarOutlined /> },
            { title: 'Chờ duyệt', value: loanStats.pending, color: '#D97706', gradient: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', icon: <ClockCircleOutlined /> },
            { title: 'Đã phê duyệt', value: loanStats.approved, color: '#7C3AED', gradient: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)', icon: <FileDoneOutlined /> },
            { title: 'Đang hoạt động', value: loanStats.disbursed, color: '#059669', gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', icon: <CheckCircleOutlined /> },
            { title: 'Quá hạn', value: loanStats.overdue, color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)', icon: <ExclamationCircleOutlined /> },
            { title: 'Đã đóng', value: loanStats.closed, color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)', icon: <CloseCircleOutlined /> },
        ];

        return (
            <div style={{ padding: '8px 0 24px 0' }}>
                <StatDisplayCards
                    items={loanStatItems}
                    colSpan={{ xs: 12, sm: 8, md: 6, lg: 4 }}
                />

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
                        ability.can(Action.Update, 'Customer') && (
                            <Tooltip key="sync" title="Đồng bộ dữ liệu mới nhất từ Fineract">
                                <Button icon={<ReloadOutlined />} onClick={handleSyncAllLoans} loading={syncingAll}>
                                    Đồng bộ
                                </Button>
                            </Tooltip>
                        ),
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
            </div>
        );
    };

    // General Tab Content
    const GeneralTab = () => {
        const cardStyle: React.CSSProperties = {
            background: token.colorBgContainer,
            borderRadius: 16,
            border: `1px solid ${token.colorBorderSecondary}`,
        };
        const iconBoxStyle = (color: string): React.CSSProperties => ({
            width: 38, height: 38, borderRadius: 10,
            background: `${color}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        });

        return (
            <div style={{ padding: '0 0 8px 0' }}>
                {/* Row 1: Overview Panel + Savings */}
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={24} lg={16}>
                        <div style={{ ...cardStyle, height: '100%', padding: '24px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            {/* Title + Capital badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
                                        Tổng quan hoạt động
                                    </Title>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Thống kê tài chính và hiệu suất giải ngân</Text>
                                </div>
                                <div style={{
                                    padding: '10px 20px', borderRadius: 12,
                                    background: `${token.colorPrimary}10`,
                                    textAlign: 'right',
                                }}>
                                    <Text type="secondary" style={{ fontSize: 9, display: 'block', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 600, color: token.colorPrimary }}>
                                        Tổng vốn vay
                                    </Text>
                                    <Text style={{ fontSize: 22, fontWeight: 800, color: token.colorPrimary }}>{fmtVND(totalCapital)}</Text>
                                </div>
                            </div>
                            {/* Divider + Meta stats */}
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${token.colorBorderSecondary}`, display: 'flex', gap: 32, alignItems: 'center' }}>
                                <div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Khoản vay gần nhất</Text>
                                    <Text strong style={{ fontSize: 14 }}>{fmtVND(summary?.lastLoanAmount || 0)}</Text>
                                </div>
                                <div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Tổng vốn giải ngân</Text>
                                    <Text strong style={{ fontSize: 14 }}>
                                        {fmtVND(loans.reduce((s, l) => s + (['disbursed', 'active', 'closed'].includes(String(l.status?.code || l.status).toLowerCase()) ? (l.capital || 0) : 0), 0))}
                                    </Text>
                                </div>
                                {ability.can(Action.Update, 'Customer') && (
                                    <div style={{ marginLeft: 'auto' }}>
                                        <Button
                                            icon={<ReloadOutlined />}
                                            onClick={handleSyncAllLoans}
                                            loading={syncingAll}
                                            type="link"
                                            size="small"
                                            style={{ padding: '6px 12px', borderRadius: 8, background: `${token.colorPrimary}10` }}
                                        >
                                            Làm mới từ Fineract
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Col>
                    <Col xs={24} lg={8}>
                        <div style={{ ...cardStyle, height: '100%', padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#06B6D410', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <BankOutlined style={{ fontSize: 22, color: '#22D3EE' }} />
                            </div>
                            <div>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tổng tiết kiệm hiện có</Text>
                                <Text style={{ fontSize: 22, fontWeight: 800, color: '#22D3EE' }}>{fmtVND(summary?.totalSavings || 0)}</Text>
                            </div>
                        </div>
                    </Col>
                </Row>

                {/* Row 2: Operation Stats */}
                <Row gutter={[12, 12]}>
                    {[
                        { label: 'Chu kỳ vay', value: summary?.loanCycles, color: '#F59E0B', Icon: ClockCircleOutlined },
                        { label: 'Khoản vay hoạt động', value: summary?.activeLoans, color: '#3B82F6', Icon: DollarOutlined },
                        { label: 'Tiết kiệm hoạt động', value: summary?.activeSavings, color: '#10B981', Icon: BankOutlined },
                        { label: 'Số lượng khoản vay', value: loans.length, color: '#F59E0B', Icon: FileTextOutlined },
                        { label: 'Đang chờ phê duyệt', value: loans.filter(l => ['pending', 'submitted'].includes(String(l.status?.code || l.status).toLowerCase())).length, color: '#8B5CF6', Icon: HourglassOutlined }
                    ].map((item, idx) => (
                        <Col key={idx} flex="1 1 0">
                            <div style={{ ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={iconBoxStyle(item.color)}>
                                    <item.Icon style={{ fontSize: 18, color: item.color }} />
                                </div>
                                <div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: '1.3' }}>{item.label}</Text>
                                    <Text style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</Text>
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            </div>
        );
    };

    // KYC Tab Content
    const KycTab = () => {
        const kycStatus = customer?.kycStatus || 'NONE';
        const canApproveKyc = !['VERIFIED', 'REJECTED'].includes(kycStatus);
        const isDirectKyc = !kyc; // Chưa có dữ liệu KYC = trường hợp xác minh trực tiếp tại chỗ

        const ApprovalCard = () => (
            <div style={{
                marginBottom: 20,
                borderRadius: 12,
                padding: '14px 20px',
                background: `${token.colorWarning}08`,
                border: `1px solid ${token.colorWarningBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
            }}>
                <ExclamationCircleOutlined style={{ fontSize: 22, color: token.colorWarning, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 14, color: token.colorWarning, display: 'block' }}>
                        {isDirectKyc ? 'KYC trực tiếp – Đã xác minh khách hàng tại chỗ' : 'Hồ sơ KYC đang chờ phê duyệt'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {isDirectKyc
                            ? 'Chưa nộp eKYC. Kích hoạt nếu đã xác minh trực tiếp.'
                            : 'Vui lòng xác minh thông tin OCR và ảnh CCCD trước khi phê duyệt.'}
                    </Text>
                </div>
                {ability.can(Action.Approve, 'Kyc') && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <Popconfirm
                            title="Kích hoạt tài khoản"
                            description={isDirectKyc ? 'Xác nhận đã xác minh trực tiếp và kích hoạt?' : 'Xác nhận kích hoạt tài khoản?'}
                            onConfirm={handleApproveKyc}
                            okText="Kích hoạt"
                            cancelText="Hủy"
                        >
                            <Button type="primary" icon={<CheckOutlined />} loading={kycApproving} style={{ borderRadius: 8 }}>
                                Phê duyệt
                            </Button>
                        </Popconfirm>
                        <Button
                            danger
                            icon={<CloseOutlined />}
                            loading={kycRejecting}
                            onClick={() => { setRejectReasonModal(true); }}
                            style={{ borderRadius: 8 }}
                        >
                            Từ chối
                        </Button>
                    </div>
                )}
            </div>
        );

        if (!kyc) {
            const ocrData = extractOcrFront(staffFrontOcr);
            const backData = extractOcrBack(staffBackOcr);
            return (
                <>
                    {canApproveKyc && <ApprovalCard />}
                    {/* Nhân viên tải CCCD lên và chạy OCR giúp khách hàng */}
                    <Card
                        variant="borderless"
                        style={{ marginBottom: 24, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
                        title={<Space><UploadOutlined style={{ color: token.colorPrimary }} /> <span style={{ fontWeight: 700 }}>Tải CCCD lên và nhận dạng OCR (nhân viên làm giúp khách hàng)</span></Space>}
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
                                        <Descriptions.Item label="Ngày cấp">{backData.issueDate || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Người ký/Cơ quan">{backData.issuer || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Đặc điểm">{backData.personalIdentification || '–'}</Descriptions.Item>
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
                    <Card variant="borderless" style={{ borderRadius: 12 }}>
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
            <div style={{ padding: '8px 0 24px 0' }}>
                {canApproveKyc && <ApprovalCard />}

                {/* Nhân viên tải CCCD lên khi chưa có OCR/ảnh (hoặc cần bổ sung) */}
                {showUploadCard && (
                    <Card
                        variant="borderless"
                        style={{ marginBottom: 24, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
                        title={<Space><UploadOutlined style={{ color: token.colorPrimary }} /> <span style={{ fontWeight: 700 }}>Tải CCCD lên và nhận dạng OCR (nhân viên làm giúp khách hàng)</span></Space>}
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
                                {(backData || ocr?.issueDate || metadata?.issueDate) && (
                                    <Descriptions column={1} size="small" style={{ marginTop: 12 }} bordered>
                                        <Descriptions.Item label="Ngày cấp">{backData?.issueDate || metadata?.issueDate || ocr?.issueDate || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Người ký/Cơ quan">{backData?.issuer || metadata?.issuer || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Đặc điểm">{backData?.personalIdentification || metadata?.personalIdentification || '–'}</Descriptions.Item>
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
                        title={<Space><IdcardOutlined style={{ color: token.colorPrimary }} /> <span style={{ fontWeight: 700 }}>Thông tin OCR (CCCD)</span></Space>}
                        variant="borderless"
                        style={{ marginBottom: 24, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
                    >
                        <Descriptions column={2} bordered size="small">
                            <Descriptions.Item label="Họ tên" span={1}>{ocr?.fullName || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Số CCCD" span={1}>{ocr?.ssn || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Ngày sinh" span={1}>{ocr?.dateOfBirth || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Ngày cấp" span={1}>{ocr?.issueDate || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Giới tính" span={1}>{ocr?.sex || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Cơ quan cấp" span={1}>{metadata?.issuer || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Địa chỉ" span={2}>{ocr?.address || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Đặc điểm" span={2}>{metadata?.personalIdentification || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Ngày hoàn thành KYC" span={2}>
                                {metadata?.kycCompletedAt ? new Date(metadata.kycCompletedAt).toLocaleString('vi-VN') : '–'}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                )}

                {/* KYC Documents */}
                <Card
                    title={<Space><FileTextOutlined style={{ color: token.colorPrimary }} /> <span style={{ fontWeight: 700 }}>Hình ảnh CCCD (từ Fineract)</span></Space>}
                    variant="borderless"
                    style={{ borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
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
            </div>
        );
    };

    // Ví điện tử Tab — follows LoansPage UI pattern
    const WalletTab = () => {
        const totalBalance = savingsAccounts.reduce((s: number, a: any) => s + (a.accountBalance ?? a.balance ?? 0), 0);
        const activeAccounts = savingsAccounts.filter((a: any) => a.status?.active).length;
        const totalCharges = charges.reduce((s: number, c: any) => s + (c.amount || 0), 0);
        const totalOutstanding = charges.reduce((s: number, c: any) => s + (c.amountOutstanding || 0), 0);

        const walletStatItems = [
            { title: 'Tổng số dư', value: fmtVND(totalBalance), color: '#059669', gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', icon: <WalletOutlined /> },
            { title: 'Tài khoản', value: savingsAccounts.length, color: '#1E40AF', gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)', icon: <BankOutlined /> },
            { title: 'Đang hoạt động', value: activeAccounts, color: '#7C3AED', gradient: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)', icon: <CheckCircleOutlined /> },
            { title: 'Tổng phí', value: fmtVND(totalCharges), color: '#D97706', gradient: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', icon: <DollarOutlined /> },
            { title: 'Chưa thanh toán', value: fmtVND(totalOutstanding), color: totalOutstanding > 0 ? '#DC2626' : '#6B7280', gradient: totalOutstanding > 0 ? 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)' : 'linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)', icon: <ExclamationCircleOutlined /> },
        ];

        return (
            <div style={{ padding: '8px 0 24px 0' }}>
                <StatDisplayCards
                    items={walletStatItems}
                    colSpan={{ xs: 12, sm: 8, md: 6, lg: 4 }}
                />

                {/* Savings Accounts Table */}
                <ProTable
                    {...PRO_TABLE_DEFAULTS}
                    cardProps={{
                        ...(typeof PRO_TABLE_DEFAULTS.cardProps === 'object' ? PRO_TABLE_DEFAULTS.cardProps : {}),
                        bodyStyle: { padding: '16px' },
                        style: { ...(typeof PRO_TABLE_DEFAULTS.cardProps === 'object' ? PRO_TABLE_DEFAULTS.cardProps?.style : {}), marginBottom: 20 }
                    }}
                    headerTitle={
                        <Space>
                            <BankOutlined style={{ color: '#3B82F6', fontSize: 16 }} />
                            <Text strong style={{ fontSize: 14 }}>Tài khoản tiết kiệm</Text>
                            <Tag style={{ borderRadius: 6 }}>{savingsAccounts.length} tài khoản</Tag>
                        </Space>
                    }
                    search={false}
                    options={false}
                    dataSource={savingsAccounts}
                    rowKey={(r: any) => r.id ?? r.savingsId ?? r.accountNo ?? String(Math.random())}
                    size="small"
                    pagination={false}
                    columns={[
                        { title: 'Số tài khoản', dataIndex: 'accountNo', key: 'accountNo', render: (_, r: any) => <Text strong>{r.accountNo || '–'}</Text> },
                        { title: 'Sản phẩm', dataIndex: 'productName', key: 'productName', render: (_, r: any) => r.productName || '–' },
                        { title: 'Số dư', key: 'balance', align: 'right' as const, render: (_, r: any) => <Text strong style={{ color: '#059669' }}>{fmtVND(r.accountBalance ?? r.balance ?? 0)}</Text> },
                        {
                            title: 'Trạng thái', key: 'status', render: (_, r: any) => (
                                <Tag color={r.status?.active ? 'success' : 'default'} style={{ borderRadius: 4 }}>
                                    {r.status?.value ?? r.status?.code ?? '–'}
                                </Tag>
                            )
                        },
                    ]}
                    locale={{ emptyText: <Empty description="Chưa có tài khoản tiết kiệm" style={{ padding: '40px 0' }} /> }}
                />

                {/* Charges Table */}
                {charges.length > 0 && (
                    <ProTable
                        {...PRO_TABLE_DEFAULTS}
                        cardProps={{
                            ...(typeof PRO_TABLE_DEFAULTS.cardProps === 'object' ? PRO_TABLE_DEFAULTS.cardProps : {}),
                            bodyStyle: { padding: '16px' },
                        }}
                        headerTitle={
                            <Space>
                                <DollarOutlined style={{ color: '#D97706', fontSize: 16 }} />
                                <Text strong style={{ fontSize: 14 }}>Các khoản phí sắp tới</Text>
                                <Tag color={totalOutstanding > 0 ? 'error' : 'success'} style={{ marginLeft: 8, borderRadius: 6 }}>
                                    {totalOutstanding > 0 ? `Còn nợ ${fmtVND(totalOutstanding)}` : 'Đã thanh toán hết'}
                                </Tag>
                            </Space>
                        }
                        search={false}
                        options={false}
                        dataSource={charges}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        columns={[
                            { title: 'Tên', dataIndex: 'name', key: 'name' },
                            { title: 'Đến hạn', dataIndex: 'dueDate', key: 'dueDate', render: (_, r: any) => r.dueDate ? [...r.dueDate].reverse().join('/') : '–' },
                            { title: 'Phải trả', dataIndex: 'amount', key: 'amount', align: 'right' as const, render: (_, r: any) => fmtVND(r.amount) },
                            { title: 'Đã trả', dataIndex: 'amountPaid', key: 'amountPaid', align: 'right' as const, render: (_, r: any) => fmtVND(r.amountPaid || 0) },
                            { title: 'Đã miễn', dataIndex: 'amountWaived', key: 'amountWaived', align: 'right' as const, render: (_, r: any) => fmtVND(r.amountWaived || 0) },
                            {
                                title: 'Chưa thanh toán', dataIndex: 'amountOutstanding', key: 'amountOutstanding', align: 'right' as const, render: (_, r: any) => (
                                    <Text type={(r.amountOutstanding || 0) > 0 ? 'danger' : 'success'} strong>{fmtVND(r.amountOutstanding || 0)}</Text>
                                )
                            },
                        ]}
                    />
                )}
            </div>
        );
    };

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
            key: 'loans',
            label: (
                <Space>
                    <DollarOutlined />
                    Khoản vay
                </Space>
            ),
            children: <LoansTab />
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
            key: 'wallet',
            label: (
                <Space>
                    <WalletOutlined />
                    Ví điện tử
                </Space>
            ),
            children: <WalletTab />
        },
    ];

    return (
        <div>
            {/* Back Button */}
            <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/customers')}
                type="text"
                style={{ marginBottom: 20, borderRadius: 8, fontWeight: 600, fontSize: 14, padding: '4px 12px', height: 'auto' }}
            >
                Quay lại danh sách
            </Button>

            {/* Header */}
            <HeaderCard />

            {/* Tabs */}
            <Card variant="borderless" style={{ borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.04)', marginTop: 16 }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    size="large"
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
                destroyOnHidden
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

            {/* KYC Reject Modal componentized to fix lag */}
            <KYCRejectModal
                open={rejectReasonModal}
                loading={kycRejecting}
                onCancel={() => setRejectReasonModal(false)}
                onReject={(reason) => handleRejectKyc(reason)}
            />
        </div>
    );
}
