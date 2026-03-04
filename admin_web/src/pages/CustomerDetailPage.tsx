import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
    CheckOutlined, UploadOutlined
} from '@ant-design/icons';
import { adminApi, LoanDto, CustomerDetailDto, KycDetailDto } from '../api/admin';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';

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
    const [detail, setDetail] = useState<CustomerDetailDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('general');

    // KYC Document view states
    const [kycDocImages, setKycDocImages] = useState<Record<string, string>>({});
    const [viewingKycDoc, setViewingKycDoc] = useState<{entityType: string; entityId: number; documentId: number; name: string} | null>(null);

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

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        adminApi.getCustomerDetail(id)
            .then(setDetail)
            .catch(() => setError('Không thể tải thông tin khách hàng'))
            .finally(() => setLoading(false));
    }, [id]);

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

    const handleViewDetails = async (fineractLoanId: number) => {
        setIsModalOpen(true);
        setModalLoading(true);
        setLoadingDocuments(true);
        setViewLoanId(fineractLoanId);
        try {
            const [data, docs] = await Promise.all([
                adminApi.getLoanDetails(fineractLoanId),
                adminApi.getLoanDocuments(fineractLoanId),
            ]);
            setLoanDetails(data);
            setLoanDocuments(docs);
        } catch (err) {
            message.error('Không thể tải chi tiết khoản vay');
        } finally {
            setModalLoading(false);
            setLoadingDocuments(false);
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
                background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`, 
                color: '#fff', 
                borderRadius: 0,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
            }}
        >
            <Row gutter={[24, 16]} align="middle">
                <Col flex="none">
                    <Avatar 
                        size={80} 
                        icon={<UserOutlined />} 
                        style={{ 
                            background: 'rgba(255,255,255,0.25)', 
                            fontSize: 36,
                            border: '3px solid rgba(255,255,255,0.5)'
                        }} 
                    />
                </Col>
                <Col flex="auto">
                    <Title level={3} style={{ margin: 0, color: '#fff', fontWeight: 600 }}>
                        {customer.displayName || customer.username}
                    </Title>
                    <div style={{ marginTop: 12, opacity: 0.95, fontSize: 14, lineHeight: 2 }}>
                        <Row gutter={[32, 8]}>
                            <Col>
                                <Space><HomeOutlined /> <strong>Văn phòng:</strong> {customer.officeName || 'Head Office'}</Space>
                            </Col>
                            <Col>
                                <Space><TeamOutlined /> <strong>Khách hàng:</strong> {customer.fineractClientId ? String(customer.fineractClientId).padStart(9, '0') : '–'}</Space>
                            </Col>
                            <Col>
                                <Space><IdcardOutlined /> <strong>ID bên ngoài:</strong> {customer.externalId || customer.username || '–'}</Space>
                            </Col>
                            <Col>
                                <Space><UserOutlined /> <strong>Nhân viên:</strong> {customer.staffName || 'Chưa phân công'}</Space>
                            </Col>
                        </Row>
                        <Row gutter={[32, 8]} style={{ marginTop: 4 }}>
                            <Col>
                                <Space><PhoneOutlined /> <strong>Số điện thoại:</strong> {customer.mobileNo || customer.username || '–'}</Space>
                            </Col>
                            <Col>
                                <Space><MailOutlined /> <strong>Email:</strong> {customer.email || '–'}</Space>
                            </Col>
                        </Row>
                    </div>
                </Col>
                <Col flex="none" style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: 12 }}>
                        <FineractStatusBadge status={customer.fineractStatus} />
                    </div>
                    {customer.kycStatus === 'VERIFIED' && (
                        <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 13, padding: '4px 12px' }}>
                            Đã xác minh KYC
                        </Tag>
                    )}
                    {customer.kycStatus === 'PENDING' && (
                        <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ fontSize: 13, padding: '4px 12px' }}>
                            Có thông tin KYC và đang chờ phê duyệt
                        </Tag>
                    )}
                    {customer.kycStatus === 'REJECTED' && (
                        <Tag color="error" icon={<CloseCircleOutlined />} style={{ fontSize: 13, padding: '4px 12px' }}>
                            Từ chối KYC
                        </Tag>
                    )}
                    {(customer.kycStatus === 'NONE' || !customer.kycStatus) && (
                        <Tag style={{ fontSize: 13, padding: '4px 12px' }}>
                            Chưa KYC
                        </Tag>
                    )}
                </Col>
            </Row>
        </Card>
    );

    // Performance History Section
    const PerformanceSection = () => (
        <Card 
            title={<Space><InfoCircleOutlined /> Lịch sử hiệu suất</Space>} 
            bordered={false} 
            style={{ marginBottom: 24, borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
            {summary ? (
                <Row gutter={[48, 24]}>
                    <Col span={12}>
                        <Statistic 
                            title="Số chu kỳ vay" 
                            value={summary.loanCycles} 
                            valueStyle={{ color: token.colorPrimary, fontSize: 28 }}
                        />
                        <div style={{ marginTop: 16, lineHeight: 2, color: token.colorTextSecondary }}>
                            Số khoản vay đang hoạt động: <strong style={{ color: token.colorText }}>{summary.activeLoans}</strong><br />
                            Số tiền vay cuối cùng: <strong style={{ color: token.colorText }}>{fmtVND(summary.lastLoanAmount)}</strong>
                        </div>
                    </Col>
                    <Col span={12}>
                        <Statistic 
                            title="Số tiết kiệm đang hoạt động" 
                            value={summary.activeSavings} 
                            valueStyle={{ color: token.colorSuccess, fontSize: 28 }}
                        />
                        <div style={{ marginTop: 16, lineHeight: 2, color: token.colorTextSecondary }}>
                            Tổng tiết kiệm: <strong style={{ color: token.colorText, fontSize: 18 }}>{fmtVND(summary.totalSavings)}</strong>
                        </div>
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
            
            {/* Quick Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col span={8}>
                    <Card bordered={false} style={{ borderRadius: 0, background: token.colorPrimaryBg, textAlign: 'center' }}>
                        <Statistic 
                            title="Khoản vay" 
                            value={loans.length} 
                            prefix={<DollarOutlined />} 
                            valueStyle={{ color: token.colorPrimary, fontSize: 32 }} 
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={false} style={{ borderRadius: 0, background: token.colorSuccessBg, textAlign: 'center' }}>
                        <Statistic 
                            title="Tổng vốn" 
                            value={totalCapital} 
                            formatter={v => fmtVND(Number(v))} 
                            valueStyle={{ color: token.colorSuccess, fontSize: 24 }} 
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={false} style={{ borderRadius: 0, background: token.colorWarningBg, textAlign: 'center' }}>
                        <Statistic
                            title="Chờ duyệt"
                            value={loans.filter(l => {
                                const code = l.status && typeof l.status === 'object' ? l.status.code : l.status;
                                return String(code || '').includes('pending');
                            }).length}
                            valueStyle={{ color: token.colorWarning, fontSize: 32 }}
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
        const showUploadCard = canApproveKyc;

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
                            { title: 'Trạng thái', key: 'status', render: (_: any, r: any) => (
                                <Tag color={r.status?.active ? 'success' : 'default'}>
                                    {r.status?.value ?? r.status?.code ?? '–'}
                                </Tag>
                            )},
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
                            { title: 'Chưa thanh toán', dataIndex: 'amountOutstanding', key: 'amountOutstanding', align: 'right', render: (v: number) => (
                                <Text type={v > 0 ? 'danger' : 'success'} strong>{fmtVND(v || 0)}</Text>
                            )},
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
                styles={{ body: { padding: '0 24px 24px' } }}
                extra={
                    <Button type="text" icon={<CloseOutlined />} onClick={() => { setIsModalOpen(false); setLoanDetails(null); setLoanDocuments([]); setViewLoanId(null); }} />
                }
            >
                {modalLoading ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}><Skeleton active /></div>
                ) : loanDetails && (
                    <Tabs defaultActiveKey="overview" items={[
                        {
                            key: 'overview',
                            label: 'Tổng quan',
                            children: (
                                <div style={{ padding: '8px 0' }}>
                                    <div style={{
                                        background: token.colorPrimary,
                                        padding: '24px',
                                        borderRadius: '12px',
                                        marginBottom: '24px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        color: '#fff',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ display: 'flex', gap: '48px' }}>
                                            <div>
                                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sản phẩm vay</div>
                                                <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{loanDetails.loanProductName} <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 'normal' }}>({loanDetails.accountNo})</Text></div>
                                            </div>
                                            <Divider type="vertical" style={{ height: '40px', background: 'rgba(255,255,255,0.2)', margin: 'auto 0' }} />
                                            <div>
                                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Khách hàng</div>
                                                <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{loanDetails.clientName}</div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Trạng thái</div>
                                            <Tag color={loanDetails.status?.active ? 'success' : 'processing'} style={{ padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', border: 'none' }}>
                                                {loanDetails.status?.value?.toUpperCase()}
                                            </Tag>
                                        </div>
                                    </div>

                                    <Row gutter={[16, 16]}>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic title="Số tiền giải ngân" value={loanDetails.principal} prefix={<DollarOutlined />} formatter={v => fmtVND(Number(v))} />
                                            </Card>
                                        </Col>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic title="Dư nợ gốc" value={loanDetails.summary?.principalOutstanding} prefix={<BankOutlined />} formatter={v => fmtVND(Number(v))} />
                                            </Card>
                                        </Col>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic title="Tổng nợ đến hạn" value={loanDetails.summary?.totalExpectedRepayment} prefix={<ClockCircleOutlined />} formatter={v => fmtVND(Number(v))} />
                                            </Card>
                                        </Col>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic
                                                    title="Tổng nợ quá hạn"
                                                    value={loanDetails.summary?.totalOverdue}
                                                    valueStyle={{ color: (loanDetails.summary?.totalOverdue > 0) ? token.colorError : token.colorSuccess }}
                                                    prefix={<InfoCircleOutlined />}
                                                    formatter={v => fmtVND(Number(v))}
                                                />
                                                {loanDetails.summary?.pastDueDays > 0 && (
                                                    <div style={{ fontSize: 12, color: token.colorError, marginTop: 4 }}>
                                                        Quá hạn {loanDetails.summary.pastDueDays} ngày
                                                    </div>
                                                )}
                                            </Card>
                                        </Col>
                                    </Row>
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
                            key: 'schedule',
                            label: 'Lịch trả nợ',
                            children: (
                                <Table
                                    dataSource={loanDetails.repaymentSchedule?.periods || []}
                                    pagination={false}
                                    size="small"
                                    scroll={{ y: 500, x: 1300 }}
                                    rowKey="period"
                                    columns={[
                                        { title: '#', dataIndex: 'period', width: 60, fixed: 'left', align: 'center' },
                                        {
                                            title: 'Ngày đến hạn',
                                            dataIndex: 'dueDate',
                                            width: 120,
                                            align: 'center',
                                            render: (v: any) => v ? v.reverse().join('/') : '–'
                                        },
                                        {
                                            title: 'Ngày trả',
                                            dataIndex: 'obligationsMetOnDate',
                                            width: 120,
                                            align: 'center',
                                            render: (v: any) => v ? <Text type="success">{v.reverse().join('/')}</Text> : '–'
                                        },
                                        {
                                            title: 'Dư nợ gốc',
                                            dataIndex: 'principalLoanBalanceOutstanding',
                                            align: 'right',
                                            width: 150,
                                            render: (v: any) => v != null ? fmtVND(v) : '–'
                                        },
                                        {
                                            title: 'Gốc (Hẹn/Trả)',
                                            key: 'principal',
                                            align: 'right',
                                            width: 180,
                                            render: (_: any, r: any) => (
                                                <div>
                                                    <div>{fmtVND(r.principalDue)}</div>
                                                    <div style={{ fontSize: '11px', color: token.colorSuccess }}>{fmtVND(r.principalPaid)}</div>
                                                </div>
                                            )
                                        },
                                        {
                                            title: 'Lãi (Hẹn/Trả)',
                                            key: 'interest',
                                            align: 'right',
                                            width: 180,
                                            render: (_: any, r: any) => (
                                                <div>
                                                    <div>{fmtVND(r.interestDue)}</div>
                                                    <div style={{ fontSize: '11px', color: token.colorSuccess }}>{fmtVND(r.interestPaid)}</div>
                                                </div>
                                            )
                                        },
                                        {
                                            title: 'Phí/Phạt',
                                            key: 'fees',
                                            align: 'right',
                                            width: 140,
                                            render: (_: any, r: any) => fmtVND((r.feeChargesDue || 0) + (r.penaltyChargesDue || 0))
                                        },
                                        {
                                            title: 'Tổng kỳ',
                                            dataIndex: 'totalDueForPeriod',
                                            align: 'right',
                                            width: 150,
                                            render: (v: any) => <Text strong>{fmtVND(v)}</Text>
                                        },
                                        {
                                            title: 'Chưa trả',
                                            dataIndex: 'totalOutstandingForPeriod',
                                            align: 'right',
                                            width: 130,
                                            render: (v: any) => v > 0 ? <Text type="danger">{fmtVND(v)}</Text> : <Badge status="success" text="Đã xong" />
                                        },
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
                        {
                            key: 'transactions',
                            label: 'Giao dịch',
                            children: (
                                <Table
                                    dataSource={loanDetails.transactions || []}
                                    pagination={false}
                                    size="small"
                                    scroll={{ y: 400 }}
                                    rowKey="id"
                                    columns={[
                                        { title: 'ID', dataIndex: 'id', width: 80, align: 'center' },
                                        {
                                            title: 'Ngày',
                                            dataIndex: 'date',
                                            width: 150,
                                            align: 'center',
                                            render: (v: any) => v ? v.reverse().join('/') : '–'
                                        },
                                        { title: 'Loại giao dịch', dataIndex: 'type', render: (v: any) => v?.value },
                                        {
                                            title: 'Số tiền',
                                            dataIndex: 'amount',
                                            width: 180,
                                            align: 'right',
                                            render: (v: any) => <Text strong>{fmtVND(v)}</Text>
                                        },
                                        {
                                            title: 'Trạng thái',
                                            dataIndex: 'manuallyReversed',
                                            width: 150,
                                            align: 'center',
                                            render: (v: any) => v ? <Tag color="error">Đã hủy</Tag> : <Tag color="success">Thành công</Tag>
                                        },
                                    ]}
                                />
                            )
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
        </div>
    );
}
