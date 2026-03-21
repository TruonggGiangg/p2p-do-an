/**
 * Chi tiết khoản vay - Component thống nhất dùng cho tất cả màn hình:
 * - Khách hàng -> Chung -> Chi tiết khoản vay
 * - Quản lý khoản vay
 * - Phê duyệt khoản vay
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Drawer, Tabs, Table, Descriptions, Row, Col, Statistic, Tag, Typography, Badge, Select,
    Skeleton, Empty, Button, Space, Card, Alert, message, theme, Avatar, Popconfirm, Tooltip
} from 'antd';
import {
    CloseOutlined, EyeOutlined, ClockCircleOutlined, DollarOutlined,
    UserOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
    CheckOutlined, SendOutlined
} from '@ant-design/icons';
import { adminApi } from '../api/admin';
import { fmtVND } from '../utils/fineractStatus';
import { getInstallmentStatus } from '../utils/scheduleStatus';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';
import { useTheme } from '../App';

const { Text } = Typography;

export type LoanDetailDrawerMode = 'view' | 'approval';

export type LoanDetailDrawerProps = {
    open: boolean;
    onClose: () => void;
    loanId: number | null;
    /** userId để hiển thị nút "Xem khách hàng" */
    userId?: string | null;
    /** Chế độ phê duyệt: hiển thị nút Duyệt/Giải ngân, duyệt/từ chối tài liệu */
    mode?: LoanDetailDrawerMode;
    /** Gọi khi mở drawer (để pre-open từ URL) */
    onOpen?: (loanId: number) => void;
};

export default function LoanDetailDrawer({
    open,
    onClose,
    loanId,
    userId,
    mode = 'view',
}: LoanDetailDrawerProps) {
    const { token } = theme.useToken();
    const { isDarkMode } = useTheme();
    const navigate = useNavigate();
    const ability = useAbility(AbilityContext);

    const [loanDetails, setLoanDetails] = useState<any>(null);
    const [loanDocuments, setLoanDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [canApprove, setCanApprove] = useState(true);
    const [missingRequired, setMissingRequired] = useState<string[]>([]);
    const [contractStatus, setContractStatus] = useState<{ hasContract: boolean; contractStatus: string | null; signedAt: string | null } | null>(null);
    const [documentReviewing, setDocumentReviewing] = useState<Set<number>>(new Set());
    const [approving, setApproving] = useState(false);
    const [disbursing, setDisbursing] = useState(false);
    const [availableDocTypes, setAvailableDocTypes] = useState<Array<{ _id: string; name: string }>>([]); 
    const [classifyingDocs, setClassifyingDocs] = useState<Set<number>>(new Set());

    const fetchData = useCallback(async (id: number, sync = false) => {
        setLoading(true);
        setLoadingDocuments(true);
        setContractStatus(null);
        try {
            const [details, docs, ...rest] = await Promise.all([
                adminApi.getLoanDetails(id, sync),
                adminApi.getLoanDocuments(id),
                ...(mode === 'approval' ? [
                    adminApi.canApproveLoan(id),
                    adminApi.getContractStatus(id),
                ] : []),
            ]);
            setLoanDetails(details);
            setLoanDocuments(docs);
            if (mode === 'approval' && rest.length >= 2) {
                const [canApproveRes, contractRes] = rest as [any, any];
                setCanApprove(canApproveRes.canApprove);
                setMissingRequired(canApproveRes.missingRequired || []);
                setContractStatus(contractRes);
            }
            if (sync) message.success('Đã đồng bộ dữ liệu mới nhất');
        } catch {
            message.error('Không thể tải chi tiết khoản vay');
        } finally {
            setLoading(false);
            setLoadingDocuments(false);
        }
    }, [mode]);

    useEffect(() => {
        if (open && loanId) {
            fetchData(loanId);
            // Fetch available document types for reclassification
            if (mode === 'approval') {
                adminApi.getDocumentTypes().then(types => setAvailableDocTypes(types as any)).catch(() => {});
            }
        } else {
            setLoanDetails(null);
            setLoanDocuments([]);
        }
    }, [open, loanId, fetchData, mode]);

    const handleSync = useCallback(() => {
        if (loanId) fetchData(loanId, true);
    }, [loanId, fetchData]);

    const handleDownloadDocument = useCallback(async (documentId: number, fileName: string) => {
        if (!loanId) return;
        const hide = message.loading('Đang chuẩn bị tài liệu...', 0);
        try {
            const response = await adminApi.downloadLoanDocument(loanId, documentId);
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
        } catch {
            message.error('Không thể tải tài liệu');
        } finally {
            hide();
        }
    }, [loanId]);

    const refreshDocumentsAndCanApprove = useCallback(async () => {
        if (!loanId || mode !== 'approval') return;
        try {
            const [docs, canApproveRes] = await Promise.all([
                adminApi.getLoanDocuments(loanId),
                adminApi.canApproveLoan(loanId),
            ]);
            setLoanDocuments(docs);
            setCanApprove(canApproveRes.canApprove);
            setMissingRequired(canApproveRes.missingRequired || []);
        } catch {
            message.error('Không thể cập nhật');
        }
    }, [loanId, mode]);

    const handleApproveDocument = useCallback(async (documentId: number) => {
        if (!loanId) return;
        setDocumentReviewing(s => new Set(s).add(documentId));
        try {
            await adminApi.approveDocument(loanId, documentId);
            message.success('Đã duyệt tài liệu');
            await refreshDocumentsAndCanApprove();
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Duyệt tài liệu thất bại');
        } finally {
            setDocumentReviewing(s => { const n = new Set(s); n.delete(documentId); return n; });
        }
    }, [loanId, refreshDocumentsAndCanApprove]);

    const handleRejectDocument = useCallback(async (documentId: number) => {
        if (!loanId) return;
        setDocumentReviewing(s => new Set(s).add(documentId));
        try {
            await adminApi.rejectDocument(loanId, documentId);
            message.success('Đã từ chối tài liệu');
            await refreshDocumentsAndCanApprove();
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Từ chối tài liệu thất bại');
        } finally {
            setDocumentReviewing(s => { const n = new Set(s); n.delete(documentId); return n; });
        }
    }, [loanId, refreshDocumentsAndCanApprove]);

    const handleClassifyDocument = useCallback(async (documentId: number, documentTypeId: string) => {
        if (!loanId) return;
        setClassifyingDocs(s => new Set(s).add(documentId));
        try {
            await adminApi.classifyDocument(loanId, documentId, documentTypeId);
            message.success('Đã phân loại tài liệu');
            await refreshDocumentsAndCanApprove();
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Phân loại tài liệu thất bại');
        } finally {
            setClassifyingDocs(s => { const n = new Set(s); n.delete(documentId); return n; });
        }
    }, [loanId, refreshDocumentsAndCanApprove]);

    const handleApprove = useCallback(async () => {
        if (!loanId) return;
        setApproving(true);
        try {
            await adminApi.approveLoan(loanId);
            message.success(`Đã phê duyệt khoản vay #${loanId}`);
            onClose();
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Phê duyệt thất bại');
        } finally {
            setApproving(false);
        }
    }, [loanId, onClose]);

    const handleDisburse = useCallback(async () => {
        if (!loanId) return;
        setDisbursing(true);
        try {
            await adminApi.disburseLoan(loanId);
            message.success(`Đã giải ngân khoản vay #${loanId}`);
            onClose();
        } catch (e: any) {
            message.error(e?.response?.data?.message || 'Giải ngân thất bại');
        } finally {
            setDisbursing(false);
        }
    }, [loanId, onClose]);

    const handleClose = () => {
        setLoanDetails(null);
        setLoanDocuments([]);
        setCanApprove(true);
        setMissingRequired([]);
        setContractStatus(null);
        onClose();
    };

    const headerActions = (
        <Space>
            {mode === 'view' && (
                <>
                    <Button type="primary" icon={<ClockCircleOutlined />} onClick={handleSync} loading={loading}>
                        Làm mới thông tin
                    </Button>
                    {userId && (
                        <Button onClick={() => navigate(`/customers/${userId}?viewLoan=${loanId}`)}>
                            Xem khách hàng
                        </Button>
                    )}
                </>
            )}
            {mode === 'approval' && loanId && (
                <Space>
                    {ability.can(Action.Approve, 'Loan') && (canApprove ? (
                        <Popconfirm
                            title="Phê duyệt khoản vay"
                            description={`Xác nhận phê duyệt khoản vay #${loanId}?`}
                            onConfirm={handleApprove}
                            okText="Duyệt ngay"
                            cancelText="Hủy"
                            okButtonProps={{ type: 'primary', size: 'middle' }}
                        >
                            <Button type="primary" size="middle" icon={<CheckOutlined />} loading={approving} style={{ borderRadius: 10, fontWeight: 600 }}>
                                Duyệt khoản vay
                            </Button>
                        </Popconfirm>
                    ) : (
                        <Tooltip title={`Thiếu: ${missingRequired.join(', ')}`}>
                            <Button size="middle" icon={<CheckOutlined />} disabled style={{ borderRadius: 10 }}>
                                Duyệt khoản vay
                            </Button>
                        </Tooltip>
                    ))}
                    {ability.can(Action.Disburse, 'Loan') && (contractStatus?.hasContract && contractStatus.contractStatus === 'signed' ? (
                        <Popconfirm
                            title="Giải ngân khoản vay"
                            description="Xác nhận giải ngân ngay bây giờ?"
                            onConfirm={handleDisburse}
                            okText="Giải ngân"
                            cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="middle" danger icon={<SendOutlined />} loading={disbursing} style={{ borderRadius: 10, fontWeight: 600 }}>
                                Giải ngân
                            </Button>
                        </Popconfirm>
                    ) : (
                        <Tooltip title={
                            !contractStatus?.hasContract
                                ? 'Chưa có hợp đồng cho khoản vay này'
                                : contractStatus?.contractStatus === 'pending_signature'
                                    ? 'Người vay chưa ký hợp đồng. Cần ký trước khi giải ngân.'
                                    : `Trạng thái hợp đồng: ${contractStatus?.contractStatus}`
                        }>
                            <Button size="middle" icon={<SendOutlined />} disabled style={{ borderRadius: 10, fontWeight: 600 }}>
                                Giải ngân
                            </Button>
                        </Tooltip>
                    ))}
                </Space>
            )}
            <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </Space>
    );

    return (
        <Drawer
            title={loanDetails ? `Chi tiết khoản vay #${loanDetails.id}` : 'Đang tải...'}
            open={open}
            onClose={handleClose}
            width={Math.min(960, window.innerWidth * 0.92)}
            destroyOnClose
            styles={{ body: { padding: 0 } }}
            extra={headerActions}
        >
            {loading ? (
                <div style={{ padding: '40px 24px' }}><Skeleton active paragraph={{ rows: 8 }} /></div>
            ) : !loanDetails ? (
                <Empty description="Không có dữ liệu" style={{ padding: 48 }} />
            ) : (
                <Tabs defaultActiveKey="overview" type="card" className="mifos-tabs" items={[
                    {
                        key: 'overview',
                        label: 'Chung',
                        children: (
                            <div>
                                <div style={{
                                    background: token.colorPrimaryBg,
                                    padding: '24px 32px',
                                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 16,
                                }}>
                                    <Space size={24}>
                                        <Avatar size={64} icon={<DollarOutlined />} style={{ backgroundColor: token.colorPrimaryBg, color: token.colorPrimary }} />
                                        <div>
                                            <div style={{ marginBottom: 4 }}>
                                                <Text strong style={{ fontSize: 18 }}>{loanDetails.loanProductName}</Text>
                                                <Text type="secondary" style={{ marginLeft: 8 }}>#{loanDetails.accountNo}</Text>
                                            </div>
                                            <Space>
                                                <Tag color={loanDetails.delinquencyRange?.classification ? 'red' : 'green'}>
                                                    {loanDetails.delinquencyRange?.classification || 'Nợ đủ tiêu chuẩn'}
                                                </Tag>
                                                {loanDetails.delinquencyRange?.pastDueDays > 0 && (
                                                    <Tag color="error">Quá hạn {loanDetails.delinquencyRange.pastDueDays} ngày</Tag>
                                                )}
                                            </Space>
                                            <div style={{ marginTop: 8 }}>
                                                <Space><UserOutlined /><Text>{loanDetails.clientName}</Text></Space>
                                            </div>
                                        </div>
                                    </Space>
                                    {mode === 'approval' && contractStatus?.hasContract && (
                                        <Tag color={contractStatus.contractStatus === 'signed' ? 'blue' : contractStatus.contractStatus === 'active' ? 'green' : contractStatus.contractStatus === 'pending_signature' ? 'orange' : 'default'}>
                                            {contractStatus.contractStatus === 'pending_signature' ? '📝 Chờ ký hợp đồng' : contractStatus.contractStatus === 'signed' ? ' Đã ký hợp đồng' : contractStatus.contractStatus === 'active' ? '📄 HĐ đang hiệu lực' : `HĐ: ${contractStatus.contractStatus}`}
                                        </Tag>
                                    )}
                                    <Row gutter={32}>
                                        <Col>
                                            <Statistic title="Dư nợ hiện tại" value={loanDetails.summary?.totalOutstanding} formatter={v => fmtVND(Number(v))} valueStyle={{ fontWeight: 700 }} />
                                        </Col>
                                        <Col>
                                            <Statistic title="Tiền quá hạn" value={loanDetails.summary?.totalOverdue} formatter={v => fmtVND(Number(v))} valueStyle={{ color: (loanDetails.summary?.totalOverdue || 0) > 0 ? token.colorError : 'inherit', fontWeight: 700 }} />
                                        </Col>
                                    </Row>
                                </div>

                                <div style={{ padding: '24px' }}>
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
                                                { title: 'Quá hạn', dataIndex: 'overdue', key: 'overdue', align: 'right', render: (v: number) => <Text type={(v || 0) > 0 ? 'danger' : 'secondary'}>{fmtVND(v)}</Text> },
                                            ]}
                                        />
                                    </Card>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: 'details',
                        label: 'Chi tiết tài khoản',
                        children: (
                            <div style={{ padding: '24px' }}>
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
                        ),
                    },
                    {
                        key: 'transactions',
                        label: 'Giao dịch',
                        children: (
                            <div style={{ padding: '24px' }}>
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
                        ),
                    },
                    {
                        key: 'schedule',
                        label: 'Lịch trả nợ',
                        children: (
                            <Table
                                dataSource={Array.isArray(loanDetails.repaymentSchedule) ? loanDetails.repaymentSchedule : (loanDetails.repaymentSchedule?.periods || [])}
                                pagination={false}
                                size="small"
                                scroll={{ y: 600, x: 1800 }}
                                rowKey="period"
                                rowClassName={(record) => `schedule-row-${getInstallmentStatus(record)}`}
                                columns={[
                                    { title: '#', dataIndex: 'period', width: 50, fixed: 'left' },
                                    {
                                        title: 'Tình trạng', key: 'status', width: 120, fixed: 'left', render: (_: any, record: any) => {
                                            const s = getInstallmentStatus(record);
                                            const config = { paid: { color: 'success', label: 'Đã trả' }, overdue: { color: 'error', label: 'Quá hạn' }, current: { color: 'processing', label: 'Đang đến hạn' }, upcoming: { color: 'default', label: 'Chưa đến hạn' } };
                                            return <Tag color={config[s].color}>{config[s].label}</Tag>;
                                        }
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
                        ),
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
                                                        <Statistic title="Tổng tiền quá hạn" value={loanDetails.summary?.totalOverdue} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorError, fontWeight: 700 }} />
                                                    </Col>
                                                    <Col>
                                                        <Statistic title="Số ngày quá hạn" value={loanDetails.delinquencyRange?.pastDueDays ?? 0} suffix="ngày" valueStyle={{ color: (loanDetails.delinquencyRange?.pastDueDays || 0) > 0 ? token.colorError : 'inherit', fontWeight: 700 }} />
                                                    </Col>
                                                    <Col>
                                                        <Statistic title="Phân loại hiện tại" value={loanDetails.delinquencyRange?.classification || 'Nhóm 1'} valueStyle={{ color: loanDetails.delinquencyRange?.classification ? token.colorError : token.colorSuccess, fontWeight: 700 }} />
                                                    </Col>
                                                </Row>
                                            }
                                            type={(loanDetails.summary?.totalOverdue || 0) > 0 ? 'error' : 'success'}
                                            showIcon
                                            icon={<ExclamationCircleOutlined />}
                                            style={{ marginBottom: 24, borderRadius: 8 }}
                                        />
                                    </Col>
                                    <Col span={24}>
                                        <Card size="small" title={<Space><ClockCircleOutlined /> Lịch sử thẻ nợ (Delinquency Tags)</Space>} bordered={false} style={{ boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.04)' }}>
                                            <Table
                                                size="small"
                                                pagination={false}
                                                dataSource={loanDetails.delinquencyTags || []}
                                                columns={[
                                                    { title: 'Phân loại', dataIndex: ['delinquencyRange', 'classification'], render: (v: any) => <Tag color="red">{v}</Tag> },
                                                    { title: 'Ngày bắt đầu', dataIndex: 'addedOnDate', render: (v: any) => v ? [...v].reverse().join('/') : '–' },
                                                    { title: 'Ngày kết thúc', dataIndex: 'liftedOnDate', render: (v: any) => v ? [...v].reverse().join('/') : <Text type="secondary">Đang áp dụng</Text> },
                                                ]}
                                                locale={{ emptyText: 'Chưa có lịch sử thẻ nợ' }}
                                            />
                                        </Card>
                                    </Col>
                                    <Col span={12}>
                                        <Card size="small" title="Quá hạn theo kỳ trả nợ" bordered={false} style={{ boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
                                            <Table
                                                size="small"
                                                pagination={false}
                                                scroll={{ x: 320 }}
                                                dataSource={loanDetails.periodDelinquency && loanDetails.periodDelinquency.length > 0 ? loanDetails.periodDelinquency : []}
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
                                        <Card size="small" title="Phân bổ tiền quá hạn (Phổ nợ)" bordered={false} style={{ boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.04)', height: '100%' }}>
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
                                </Row>
                            </div>
                        ),
                    },
                    {
                        key: 'charges',
                        label: 'Các khoản phí',
                        children: (
                            <div style={{ padding: '24px' }}>
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
                            </div>
                        ),
                    },
                    {
                        key: 'documents',
                        label: (
                            <Badge count={loanDocuments.length} size="small" offset={[10, 0]}>
                                Hồ sơ tài liệu
                            </Badge>
                        ),
                        children: (
                            <div style={{ padding: '24px' }}>
                                {mode === 'approval' && !canApprove && missingRequired.length > 0 && (
                                    <div style={{ marginBottom: 12, padding: '8px 12px', background: token.colorWarningBg, borderRadius: 10, border: `1px solid ${token.colorWarningBorder}` }}>
                                        <Text type="warning">
                                            <strong>Lưu ý:</strong> Cần duyệt đủ tài liệu bắt buộc trước khi duyệt khoản vay: {missingRequired.join(', ')}
                                        </Text>
                                    </div>
                                )}
                                <Table
                                    dataSource={loanDocuments}
                                    loading={loadingDocuments}
                                    pagination={false}
                                    size="small"
                                    rowKey="id"
                                    columns={[
                                        { title: 'Loại tài liệu', dataIndex: 'documentTypeName', width: 200, render: (v: any, r: any) => {
                                            if (v && v !== 'Chưa phân loại') return v;
                                            // Show Select for unknown docs in approval mode
                                            if (mode === 'approval' && availableDocTypes.length > 0) {
                                                return (
                                                    <Select
                                                        size="small"
                                                        placeholder="Chọn loại tài liệu"
                                                        loading={classifyingDocs.has(r.id)}
                                                        style={{ width: '100%', minWidth: 160 }}
                                                        onChange={(typeId: string) => handleClassifyDocument(r.id, typeId)}
                                                        options={availableDocTypes.map(t => ({ value: t._id, label: t.name }))}
                                                    />
                                                );
                                            }
                                            return <Text type="secondary">Chưa phân loại</Text>;
                                        }},
                                        { title: 'Tên file gốc', dataIndex: 'originalName', ellipsis: true, render: (v: any, r: any) => v || r.fileName },
                                        ...(mode === 'approval' ? [{
                                            title: 'Trạng thái',
                                            dataIndex: 'reviewStatus',
                                            width: 120,
                                            align: 'center' as const,
                                            render: (v: any) => {
                                                if (v === 'approved') return <Tag color="success">Đã duyệt</Tag>;
                                                if (v === 'rejected') return <Tag color="error">Từ chối</Tag>;
                                                return <Tag color="processing">Chờ duyệt</Tag>;
                                            },
                                        }] : []),
                                        { title: 'Định dạng', dataIndex: 'type', width: 120, align: 'center' as const },
                                        { title: 'Ngày tải lên', key: 'createdAt', width: 180, align: 'center' as const, render: (_: any, r: any) => (r.uploadedAt || r.createdDate) ? new Date(r.uploadedAt || r.createdDate).toLocaleString('vi-VN') : '–' },
                                        {
                                            title: 'Hành động',
                                            key: 'action',
                                            width: mode === 'approval' ? 300 : 150,
                                            align: 'right' as const,
                                            render: (_: any, r: any) => (
                                                <Space size={4}>
                                                    <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleDownloadDocument(r.id, r.originalName || r.fileName || 'document')}>
                                                        Xem/Tải về
                                                    </Button>
                                                    {mode === 'approval' && ability.can(Action.Approve, 'LoanDocument') && r.reviewStatus !== 'approved' && (
                                                        <Button type="link" size="small" icon={<CheckOutlined />} loading={documentReviewing.has(r.id)} onClick={() => handleApproveDocument(r.id)} style={{ color: token.colorSuccess }}>
                                                            Duyệt
                                                        </Button>
                                                    )}
                                                    {mode === 'approval' && ability.can(Action.Approve, 'LoanDocument') && r.reviewStatus !== 'rejected' && (
                                                        <Button type="link" size="small" danger icon={<CloseCircleOutlined />} loading={documentReviewing.has(r.id)} onClick={() => handleRejectDocument(r.id)}>
                                                            Từ chối
                                                        </Button>
                                                    )}
                                                </Space>
                                            ),
                                        },
                                    ]}
                                    locale={{ emptyText: 'Chưa có tài liệu đính kèm' }}
                                />
                            </div>
                        ),
                    },
                ]} />
            )}
            <style>{`
                .mifos-tabs .ant-tabs-nav {
                    background: ${isDarkMode ? '#1e293b' : '#f4f4f4'};
                    margin: 0 !important;
                    padding: 0 24px;
                }
                .mifos-tabs .ant-tabs-tab {
                    border: none !important;
                    background: transparent !important;
                    margin: 0 !important;
                    padding: 12px 20px !important;
                    color: ${isDarkMode ? '#94a3b8' : 'inherit'} !important;
                }
                .mifos-tabs .ant-tabs-tab:hover {
                    color: ${isDarkMode ? '#e2e8f0' : 'inherit'} !important;
                }
                .mifos-tabs .ant-tabs-tab-active {
                    background: ${isDarkMode ? '#0f172a' : '#fff'} !important;
                    border-top: 3px solid ${isDarkMode ? '#3b82f6' : '#0071b9'} !important;
                    color: ${isDarkMode ? '#f1f5f9' : 'inherit'} !important;
                }
                .mifos-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
                    color: ${isDarkMode ? '#f1f5f9' : 'inherit'} !important;
                }
                .mifos-tabs .ant-tabs-content-holder {
                    background: ${isDarkMode ? '#0f172a' : '#fff'};
                }
            `}</style>
        </Drawer>
    );
}
