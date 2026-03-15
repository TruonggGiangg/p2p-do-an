/**
 * Cấu hình bảng khoản vay dùng chung - chi tiết nhất
 * Dùng cho: Quản lý khoản vay, Phê duyệt khoản vay, Chi tiết khách hàng
 * Chỉ khác: giai đoạn lọc ban đầu + tùy biến theo chức năng từng page
 */
import type { ProColumns } from '@ant-design/pro-components';
import { Tag, Typography, Space, Button, Tooltip } from 'antd';
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
};

export type TabKey = 'all' | 'pending' | 'approved' | 'disbursed' | 'overdue' | 'closed';

export const TAB_LABELS: Record<TabKey, string> = {
    all: 'Tất cả',
    pending: 'Chờ duyệt',
    approved: 'Đã phê duyệt',
    disbursed: 'Đang hoạt động',
    overdue: 'Quá hạn',
    closed: 'Đã đóng',
};

const STATUS_LABEL_MAP: Record<string, string> = {
    pending: 'Chờ duyệt',
    approved: 'Đã phê duyệt',
    disbursed: 'Đang hoạt động',
    overdue: 'Quá hạn',
    closed: 'Đã đóng',
};

function getStatusDisplay(r: LoanTableRow) {
    const raw = r.status;
    if (!raw) return null;
    const code = typeof raw === 'string' ? raw : (raw?.code ?? raw?.value ?? '');
    const str = String(code).toLowerCase();
    if (str.includes('pending') || str.includes('submitted')) return { code: 'pending', label: STATUS_LABEL_MAP.pending };
    if (str.includes('approved')) return { code: 'approved', label: STATUS_LABEL_MAP.approved };
    if (str.includes('active') || str.includes('disbursed')) return { code: 'disbursed', label: STATUS_LABEL_MAP.disbursed };
    if (str.includes('overdue')) return { code: 'overdue', label: STATUS_LABEL_MAP.overdue };
    if (str.includes('closed') || str.includes('overpaid')) return { code: 'closed', label: STATUS_LABEL_MAP.closed };
    return { code: str || 'unknown', label: code };
}

function getCustomerName(r: LoanTableRow) {
    return r.clientName || r.customerName || r.customerUsername || '–';
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
                if (statusObj && typeof statusObj === 'object' && 'value' in statusObj) {
                    return <FineractStatusBadge status={statusObj} />;
                }
                const disp = getStatusDisplay(r);
                if (!disp) return '–';
                const color = disp.code === 'overdue' ? 'error' : disp.code === 'pending' ? 'warning' : disp.code === 'closed' ? 'default' : 'success';
                return <Tag color={color}>{disp.label}</Tag>;
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

    return [...normalizedBase, actionCol];
}
