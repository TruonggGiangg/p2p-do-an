/**
 * Cấu hình bảng khoản vay dùng chung - chi tiết nhất
 * Dùng cho: Quản lý khoản vay, Phê duyệt khoản vay, Chi tiết khách hàng
 * Chỉ khác: giai đoạn lọc ban đầu + tùy biến theo chức năng từng page
 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag, Typography, Space, Button, Tooltip, Progress } from 'antd';
import { UserOutlined, EyeOutlined } from '@ant-design/icons';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';

/** Row type: union của getLoans items + LoanDto */
export type LoanTableRow = {
    _id?: string;
    fineractLoanId?: number;
    userId?: string;
    customerName?: string;
    customerUsername?: string;
    clientName?: string;
    productId?: number;
    productName?: string;
    productShortName?: string;
    capital?: number;
    periodMonth?: number;
    monthlyPay?: number;
    entirelyPay?: number;
    monthlyRatePercent?: number;
    status?: any;
    willing?: string;
    createdAt?: string | number[];
    disbursementDate?: string | null;
    totalOverdue?: number;
    delinquentDays?: number;
    delinquencyClassification?: string | null;
    lastSyncedAt?: string | null;
    aiScore?: {
        pd: number;
        creditScore: number;
        grade: string;
        subGrade: string;
        tier: string;
        decision: string;
        riskLevel: string;
        riskFactors: any[];
        scoredAt: string;
    } | null;
    isFullMatch?: boolean;
    matchPercentage?: number;
    investedNotes?: number;
    totalNotes?: number;
};

export type TabKey = 'all' | 'pending' | 'approved' | 'waiting' | 'funded' | 'disbursed' | 'overdue' | 'closed' | 'rejected' | 'cancelled';

export const TAB_LABELS: Record<TabKey, string> = {
    all: 'Tất cả',
    pending: 'Chờ duyệt',
    approved: 'Đã phê duyệt',
    waiting: 'Chờ đầu tư',
    funded: 'Đã đủ vốn',
    disbursed: 'Đang hoạt động',
    overdue: 'Quá hạn',
    closed: 'Đã đóng',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
};

const STATUS_LABEL_MAP: Record<string, string> = {
    pending: 'Chờ duyệt',
    approved: 'Đã phê duyệt',
    waiting: 'Chờ đầu tư',
    funded: 'Đã đủ vốn',
    disbursed: 'Đang hoạt động',
    overdue: 'Quá hạn',
    closed: 'Đã đóng',
    rejected: 'Bị từ chối',
    cancelled: 'Đã hủy',
};

function getStatusDisplay(r: LoanTableRow) {
    const raw = r.status;
    if (!raw) return null;
    const code = typeof raw === 'string' ? raw : (raw?.code ?? raw?.value ?? '');
    const str = String(code).toLowerCase();
    
    if (str.includes('pending') || str.includes('submitted')) return { code: 'pending', label: STATUS_LABEL_MAP.pending };
    if (str.includes('approved')) {
        if (r.isFullMatch === false) return { code: 'waiting', label: STATUS_LABEL_MAP.waiting };
        if (r.isFullMatch === true) return { code: 'funded', label: STATUS_LABEL_MAP.funded };
        return { code: 'approved', label: STATUS_LABEL_MAP.approved };
    }
    if (str.includes('active') || str.includes('disbursed')) return { code: 'disbursed', label: STATUS_LABEL_MAP.disbursed };
    if (str.includes('overdue')) return { code: 'overdue', label: STATUS_LABEL_MAP.overdue };
    if (str.includes('closed') || str.includes('overpaid')) return { code: 'closed', label: STATUS_LABEL_MAP.closed };
    if (str.includes('rejected')) return { code: 'rejected', label: STATUS_LABEL_MAP.rejected };
    if (str.includes('cancelled') || str.includes('withdrawn')) return { code: 'cancelled', label: STATUS_LABEL_MAP.cancelled };
    
    return { code: str || 'unknown', label: code };
}

function getCustomerName(r: LoanTableRow) {
    return r.clientName || r.customerName || r.customerUsername || '–';
}

/** Lấy màu sắc theo điểm đánh giá (0-100) */
function getScoreColor(score: number): string {
    if (score >= 80) return '#52c41a'; // green - rủi ro thấp
    if (score >= 60) return '#1890ff'; // blue - trung bình
    if (score >= 40) return '#faad14'; // orange - cao
    return '#ff4d4f'; // red - rất cao
}

/** Lấy CSS class cho row theo điểm đánh giá */
export function getRowClassName(score: number | undefined | null): string {
    if (score == null) return 'ai-row-gray';
    if (score < 40) return 'ai-row-red';
    if (score < 60) return 'ai-row-orange';
    if (score < 80) return 'ai-row-blue';
    return 'ai-row-green';
}

function getDecisionTag(decision: string) {
    switch (decision) {
        case 'APPROVE':
            return <Tag color="success">Tự động duyệt</Tag>;
        case 'REJECT':
            return <Tag color="error">Tự động từ chối</Tag>;
        case 'REVIEW':
        default:
            return <Tag color="warning">Chờ thẩm định</Tag>;
    }
}

function formatCreatedAt(v: string | number[] | undefined) {
    if (!v) return '–';
    if (Array.isArray(v) && v.length >= 3) {
        const d = new Date(v[0], (v[1] ?? 1) - 1, v[2] ?? 1);
        return d.toLocaleDateString('vi-VN');
    }
    return new Date(v as string).toLocaleDateString('vi-VN');
}

export type LoanTableVariant = 'management' | 'approval' | 'customer';

export type BuildColumnsOptions = {
    variant: LoanTableVariant;
    themeToken?: any;
    onViewDetails: (loanId: number, userId?: string) => void;
    onNavigateToCustomer?: (userId: string, loanId?: number) => void;
    /** Cột hành động tùy biến (Duyệt, Giải ngân cho approval) */
    actionColumn?: ProColumns<LoanTableRow>['render'];
    /** Bật search cho cột (approval page) */
    enableSearch?: boolean;
};

/** Tạo columns dùng chung - chi tiết nhất */
export function buildLoanColumns(options: BuildColumnsOptions): ProColumns<LoanTableRow>[] {
    const {
        variant,
        themeToken,
        onViewDetails,
        onNavigateToCustomer,
        actionColumn,
        enableSearch = false,
    } = options;

    const base: ProColumns<LoanTableRow>[] = [
        {
            title: '#',
            dataIndex: 'fineractLoanId',
            width: 90,
            copyable: variant === 'approval',
            search: false,
            render: (_, record) => {
                const id = record?.fineractLoanId;
                const num = typeof id === 'number' ? id : (typeof id === 'object' && id != null && 'id' in id ? (id as { id: number }).id : Number(id));
                const valid = num != null && !Number.isNaN(num);
                const userId = record?.userId;
                return valid ? (
                    <Typography.Link onClick={() => onViewDetails(num, userId)}>
                        <Tag color="blue" style={{ fontFamily: 'monospace', cursor: 'pointer' }}>#{num}</Tag>
                    </Typography.Link>
                ) : (
                    <Tag color="orange">Chưa sync</Tag>
                );
            },
        },
        {
            title: 'Khách hàng',
            dataIndex: 'clientName',
            key: 'customer',
            width: 180,
            ellipsis: true,
            search: enableSearch ? { transform: (v) => v?.trim() || undefined } : false,
            fieldProps: enableSearch ? { placeholder: 'Tìm theo tên...' } : undefined,
            render: (_, r) => {
                const name = getCustomerName(r);
                const userId = r.userId;
                const loanId = r.fineractLoanId;
                if (variant !== 'customer' && userId && onNavigateToCustomer) {
                    return (
                        <Space>
                            <UserOutlined />
                            <a onClick={() => onNavigateToCustomer(userId, loanId)}>{name}</a>
                        </Space>
                    );
                }
                return (
                    <Space>
                        <UserOutlined />
                        <span>{name}</span>
                    </Space>
                );
            },
        },
        {
            title: 'Sản phẩm',
            key: 'product',
            width: 160,
            dataIndex: 'productShortName',
            search: enableSearch ? { transform: (v) => v?.trim() || undefined } : false,
            fieldProps: enableSearch ? { placeholder: 'Mã sản phẩm...' } : undefined,
            render: (_, r) => (
                <Space size={4} style={{ whiteSpace: 'nowrap' }}>
                    <Tag color="gold">{r.productShortName || r.productName?.slice(0, 8) || '–'}</Tag>
                    <Typography.Text ellipsis style={{ fontSize: 12, maxWidth: 100 }}>
                        {r.productName || '–'}
                    </Typography.Text>
                </Space>
            ),
        },
        {
            title: 'Số tiền vay',
            dataIndex: 'capital',
            width: 120,
            align: 'right',
            sorter: (a, b) => (a.capital || 0) - (b.capital || 0),
            search: false,
            render: (_, r) => (
                <Typography.Text strong style={{ color: themeToken?.colorPrimary, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {fmtVND(r.capital)}
                </Typography.Text>
            ),
        },
        {
            title: 'Kỳ hạn',
            dataIndex: 'periodMonth',
            width: 80,
            align: 'center',
            sorter: (a, b) => (a.periodMonth || 0) - (b.periodMonth || 0),
            search: false,
            render: (v) => <Typography.Text style={{ fontSize: 12 }}>{v != null ? `${v} tháng` : '–'}</Typography.Text>,
        },
        {
            title: 'Trả/tháng',
            dataIndex: 'monthlyPay',
            width: 110,
            align: 'right',
            search: false,
            render: (v) => <Typography.Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{v != null && Number(v) > 0 ? fmtVND(Number(v)) : 'Chưa tính'}</Typography.Text>,
        },
        {
            title: 'Tổng trả',
            dataIndex: 'entirelyPay',
            width: 110,
            align: 'right',
            search: false,
            render: (v) => <Typography.Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{v != null && Number(v) > 0 ? fmtVND(Number(v)) : 'Chưa tính'}</Typography.Text>,
        },
        {
            title: 'Lãi suất',
            dataIndex: 'monthlyRatePercent',
            width: 90,
            align: 'center',
            search: false,
            render: (v) => <Typography.Text style={{ fontSize: 12 }}>{v != null && Number(v) > 0 ? `${Number(v).toFixed(2)}%/tháng` : 'Chưa áp dụng'}</Typography.Text>,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 140,
            align: 'center',
            search: false,
            render: (_, r) => {
                const statusObj = r.status;
                const disp = getStatusDisplay(r);
                if (!disp) return '–';

                const isWaitingForPayment = disp.code === 'waiting' && Math.round(r.matchPercentage || 0) >= 100;
                
                const colorMap: Record<string, string> = {
                    pending: 'warning',
                    approved: 'processing',
                    waiting: 'blue',
                    paying: 'purple',
                    funded: 'geekblue',
                    disbursed: 'success',
                    overdue: 'error',
                    closed: 'default',
                    rejected: 'error',
                    cancelled: 'magenta',
                };

                const currentCode = isWaitingForPayment ? 'paying' : disp.code;
                const currentLabel = isWaitingForPayment ? 'Chờ thanh toán' : disp.label;

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <Tag color={colorMap[currentCode] || 'default'} style={{ margin: 0, minWidth: 100, textAlign: 'center' }}>
                            {currentLabel}
                        </Tag>
                        {(disp.code === 'waiting' || disp.code === 'funded' || currentCode === 'paying') && r.totalNotes && r.totalNotes > 0 ? (
                            <Tooltip title={`${r.investedNotes || 0} / ${r.totalNotes} notes`}>
                                <div style={{ display: 'flex', alignItems: 'center', width: 100, gap: 4 }}>
                                    <Progress 
                                        percent={Math.round(r.matchPercentage || 0)} 
                                        size="small" 
                                        showInfo={false}
                                        style={{ margin: 0, flex: 1 }}
                                        strokeColor={r.isFullMatch ? '#52c41a' : (isWaitingForPayment ? '#722ed1' : '#1677ff')}
                                    />
                                    <span style={{ fontSize: 10, minWidth: 26, textAlign: 'right', color: '#8c8c8c' }}>
                                        {Math.round(r.matchPercentage || 0)}%
                                    </span>
                                </div>
                            </Tooltip>
                        ) : null}
                    </div>
                );
            },
        },
        {
            title: 'Ngày nộp',
            dataIndex: 'createdAt',
            width: 110,
            search: false,
            sorter: (a, b) => {
                const da = a.createdAt ? (Array.isArray(a.createdAt) ? new Date(a.createdAt[0], (a.createdAt[1] ?? 1) - 1, a.createdAt[2] ?? 1).getTime() : new Date(a.createdAt as string).getTime()) : 0;
                const db = b.createdAt ? (Array.isArray(b.createdAt) ? new Date(b.createdAt[0], (b.createdAt[1] ?? 1) - 1, b.createdAt[2] ?? 1).getTime() : new Date(b.createdAt as string).getTime()) : 0;
                return da - db;
            },
            render: (_, r) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatCreatedAt(r.createdAt)}</Typography.Text>,
        },
        {
            title: 'Ngày giải ngân',
            dataIndex: 'disbursementDate',
            width: 110,
            search: false,
            render: (v) => {
                const val = typeof v === 'string' || typeof v === 'number' ? v : null;
                if (val) {
                    const d = new Date(val);
                    return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{!isNaN(d.getTime()) ? d.toLocaleDateString('vi-VN') : 'Chưa giải ngân'}</Typography.Text>;
                }
                if (Array.isArray(v) && v.length >= 3) {
                    const d = new Date(v[0], (v[1] ?? 1) - 1, v[2] ?? 1);
                    return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{d.toLocaleDateString('vi-VN')}</Typography.Text>;
                }
                return <Typography.Text type="secondary" style={{ fontSize: 12 }}>Chưa giải ngân</Typography.Text>;
            },
        },
        {
            title: 'Quá hạn',
            key: 'overdue',
            width: 140,
            align: 'right',
            search: false,
            render: (_, r) => {
                const days = r.delinquentDays;
                const amount = r.totalOverdue;
                const cls = r.delinquencyClassification;
                if (days == null && amount == null && !cls) return <Typography.Text type="secondary" style={{ fontSize: 11 }}>Không</Typography.Text>;
                const hasOverdue = (amount != null && amount > 0) || (days != null && days > 0) || !!cls;
                if (!hasOverdue) return <Typography.Text type="secondary" style={{ fontSize: 11 }}>Không</Typography.Text>;
                return (
                    <Space direction="vertical" size={0}>
                        {amount != null && amount > 0 && <Typography.Text type="danger" strong style={{ fontSize: 12 }}>{fmtVND(amount)}</Typography.Text>}
                        {days != null && days > 0 && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{days} ngày</Typography.Text>}
                        {cls && <Tag color="orange" style={{ fontSize: 10 }}>{cls}</Tag>}
                    </Space>
                );
            },
        },
    ];

    const actionCol: ProColumns<LoanTableRow> = {
        title: '',
        key: 'action',
        width: actionColumn ? 260 : 100,
        fixed: actionColumn ? 'right' : undefined,
        search: false,
        onCell: actionColumn ? () => ({ style: { paddingLeft: 12, paddingRight: 12, whiteSpace: 'nowrap' } }) : undefined,
        render: actionColumn ?? ((_, r) => {
            const num = r.fineractLoanId;
            const userId = r.userId;
            if (!num) return null;
            return (
                <Tooltip title="Xem chi tiết khoản vay">
                    <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onViewDetails(num, userId)}>
                        Chi tiết
                    </Button>
                </Tooltip>
            );
        }),
    };

    const normalizedBase = variant === 'customer'
        ? base.filter((col) => col.key !== 'customer')
        : base;

    // Add AI Score columns for approval variant
    const aiScoreColumns: ProColumns<LoanTableRow>[] = variant === 'approval' ? [
        {
            title: 'Điểm AI',
            key: 'aiScore',
            width: 130,
            align: 'center',
            search: false,
            sorter: (a, b) => (a.aiScore?.creditScore ?? -1) - (b.aiScore?.creditScore ?? -1),
            defaultSortOrder: 'descend',
            render: (_, r) => {
                const ai = r.aiScore;
                if (!ai) return <Typography.Text type="secondary" style={{ fontSize: 11 }}>Chưa chấm</Typography.Text>;
                const score = ai.creditScore;
                const color = getScoreColor(score);
                return (
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                        <Progress
                            percent={score}
                            size="small"
                            strokeColor={color}
                            format={() => <span style={{ fontWeight: 700, color, fontSize: 13 }}>{score}</span>}
                        />
                        <Typography.Text style={{ fontSize: 10, color: '#888' }}>
                            PD: {(ai.pd * 100).toFixed(1)}%
                        </Typography.Text>
                    </Space>
                );
            },
        },
        {
            title: 'Hạng',
            key: 'aiGrade',
            width: 140,
            align: 'center',
            search: false,
            render: (_, r) => {
                const ai = r.aiScore;
                if (!ai) return '–';
                const gradeColorMap: Record<string, string> = {
                    'A': 'green', 'B': 'blue', 'C': 'orange', 'D': 'red', 'E': 'red',
                };
                return (
                    <Space direction="vertical" size={0}>
                        <Tag color={gradeColorMap[ai.grade] || 'default'} style={{ fontWeight: 700, fontSize: 13 }}>
                            {ai.grade}
                        </Tag>
                        <Typography.Text style={{ fontSize: 10, color: '#888' }}>
                            {ai.subGrade}
                        </Typography.Text>
                    </Space>
                );
            },
        },
        {
            title: 'Quyết định',
            key: 'aiDecision',
            width: 130,
            align: 'center',
            search: false,
            render: (_, r) => {
                const ai = r.aiScore;
                if (!ai) return '–';
                return getDecisionTag(ai.decision);
            },
        },
    ] : [];

    return [...normalizedBase, ...aiScoreColumns, actionCol];
}
