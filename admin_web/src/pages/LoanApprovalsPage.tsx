import { useRef, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActionType } from '@ant-design/pro-components';
import { Button, Popconfirm, Tooltip, theme, Form } from 'antd';
import {
    CheckOutlined, SendOutlined, ReloadOutlined, ClockCircleOutlined, FilterOutlined,
    DollarOutlined, FileTextOutlined, EyeOutlined
} from '@ant-design/icons';
import { message } from 'antd';
import { Link } from 'react-router-dom';
import { adminApi, LoanDto } from '../api/admin';
import { fmtVND, getStatusCode } from '../utils/fineractStatus';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';
import LoanDetailDrawer from '../components/LoanDetailDrawer';
import LoanPageShell, { StatCard } from '../components/LoanPageShell';
import LoanTable from '../components/LoanTable';
import LoanFilterForm from '../components/LoanFilterForm';
import type { LoanTableRow } from '../config/loanTableConfig';

export default function LoanApprovalsPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const ability = useAbility(AbilityContext);
    const actionRef = useRef<ActionType>();
    const [loans, setLoans] = useState<LoanTableRow[]>([]);
    const [approving, setApproving] = useState<Set<number>>(new Set());
    const [disbursing, setDisbursing] = useState<Set<number>>(new Set());
    const [messageApi, contextHolder] = message.useMessage();
    const [viewLoanId, setViewLoanId] = useState<number | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [products, setProducts] = useState<Array<{ id: number; name: string; shortName: string }>>([]);
    const [form] = Form.useForm();

    useEffect(() => {
        adminApi.getLoanProducts().then(setProducts).catch(() => []);
    }, []);

    const handleApprove = useCallback(async (loan: LoanTableRow) => {
        const id = loan.fineractLoanId;
        if (!id) return;
        setApproving(s => new Set(s).add(id));
        try {
            await adminApi.approveLoan(id);
            messageApi.success(`Đã phê duyệt khoản vay #${id}`);
            actionRef.current?.reload?.();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message || 'Phê duyệt thất bại');
        } finally {
            setApproving(s => { const n = new Set(s); n.delete(id); return n; });
        }
    }, [messageApi]);

    const handleDisburse = useCallback(async (loan: LoanTableRow) => {
        const id = loan.fineractLoanId;
        if (!id) return;
        setDisbursing(s => new Set(s).add(id));
        try {
            await adminApi.disburseLoan(id);
            messageApi.success(`Đã giải ngân khoản vay #${id}`);
            actionRef.current?.reload?.();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message || 'Giải ngân thất bại');
        } finally {
            setDisbursing(s => { const n = new Set(s); n.delete(id); return n; });
        }
    }, [messageApi]);

    const handleViewDetails = useCallback((loanId: number, _userId?: string) => {
        setViewLoanId(loanId);
    }, []);

    const handleCloseDrawer = useCallback(() => {
        setViewLoanId(null);
        actionRef.current?.reload?.();
    }, []);

    const fetchData = useCallback(async (params: any) => {
        const data = await adminApi.getPendingLoans();
        let filtered = (data || []).filter(Boolean).filter(
            (l: LoanDto) => l && (l.fineractLoanId != null || (l as any)._id != null)
        ) as LoanTableRow[];

        const values = form.getFieldsValue();
        const keyword = String(values.keyword || '').toLowerCase().trim();
        const productId = values.productId ? Number(values.productId) : undefined;
        const dateRange = values.disbursementDate;

        if (keyword) {
            filtered = filtered.filter((l) => {
                const name = String(l.clientName || l.customerName || '').toLowerCase();
                const username = String(l.customerUsername || '').toLowerCase();
                const loanNo = String(l.fineractLoanId || '');
                return name.includes(keyword) || username.includes(keyword) || loanNo.includes(keyword);
            });
        }

        if (productId != null && !Number.isNaN(productId)) {
            filtered = filtered.filter((l) => Number(l.productId) === productId);
        }

        if (Array.isArray(dateRange) && dateRange[0] && dateRange[1]) {
            const from = dateRange[0].startOf('day').valueOf();
            const to = dateRange[1].endOf('day').valueOf();
            filtered = filtered.filter((l) => {
                const rawDate = l.createdAt || l.disbursementDate;
                if (!rawDate) return false;
                const dateVal = Array.isArray(rawDate)
                    ? new Date(rawDate[0], (rawDate[1] ?? 1) - 1, rawDate[2] ?? 1).getTime()
                    : new Date(rawDate as string).getTime();
                if (Number.isNaN(dateVal)) return false;
                return dateVal >= from && dateVal <= to;
            });
        }

        setLoans(filtered);
        const page = params.current ?? 1;
        const size = params.pageSize ?? 15;
        const start = (page - 1) * size;
        const paged = filtered.slice(start, start + size);
        return { data: paged, success: true, total: filtered.length };
    }, [form]);

    const totalCapital = loans.reduce((s, l) => s + (l.capital || 0), 0);
    const productCount = new Set(loans.map(l => l.productShortName || l.productName)).size;

    const statCards: StatCard[] = [
        {
            key: 'pending',
            title: 'Chờ duyệt',
            value: loans.length,
            gradient: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
            icon: <ClockCircleOutlined style={{ fontSize: 24, color: '#fff' }} />,
        },
        {
            key: 'capital',
            title: 'Tổng vốn cần duyệt',
            value: totalCapital,
            formatter: (v) => fmtVND(v),
            gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            icon: <DollarOutlined style={{ fontSize: 24, color: '#fff' }} />,
        },
        {
            key: 'products',
            title: 'Sản phẩm vay',
            value: `${productCount} loại`,
            gradient: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
            icon: <FileTextOutlined style={{ fontSize: 24, color: '#fff' }} />,
        },
    ];

    const actionColumn = (_: any, r: LoanTableRow) => {
        const id = r.fineractLoanId;
        if (!id) return null;
        const statusCode = getStatusCode(r.status).toLowerCase();
        const canApproveAction = ability.can(Action.Approve, 'Loan')
            && (!statusCode || statusCode.includes('pending') || statusCode.includes('submitted'));
        const canDisburseAction = ability.can(Action.Disburse, 'Loan')
            && (!statusCode || statusCode.includes('approved'));

        return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                <Tooltip title="Xem chi tiết hồ sơ, tài liệu, lịch trả nợ">
                    <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => handleViewDetails(id, r.userId)}>
                        Chi tiết
                    </Button>
                </Tooltip>
                {canApproveAction && (
                    <Popconfirm
                        title={`Phê duyệt #${id} (${fmtVND(r.capital)})?`}
                        onConfirm={() => handleApprove(r)}
                        okText="Duyệt"
                        cancelText="Hủy"
                        okButtonProps={{ type: 'primary', style: { background: token.colorSuccess, borderColor: token.colorSuccess } }}
                    >
                        <Tooltip title="Phê duyệt khoản vay sau khi kiểm tra hồ sơ">
                            <Button
                                size="small"
                                icon={<CheckOutlined />}
                                loading={approving.has(id)}
                                style={{ background: token.colorSuccess, borderColor: token.colorSuccess, color: '#fff', fontSize: 12 }}
                            >
                                Duyệt
                            </Button>
                        </Tooltip>
                    </Popconfirm>
                )}
                {canDisburseAction && (
                    <Popconfirm
                        title={`Giải ngân #${id} (${fmtVND(r.capital)})?`}
                        onConfirm={() => handleDisburse(r)}
                        okText="Giải ngân"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Giải ngân khi hợp đồng đã ký">
                            <Button
                                size="small"
                                icon={<SendOutlined />}
                                loading={disbursing.has(id)}
                                danger
                                style={{ fontSize: 12 }}
                            >
                                Giải ngân
                            </Button>
                        </Tooltip>
                    </Popconfirm>
                )}
            </div>
        );
    };

    return (
        <>
            {contextHolder}
            <LoanPageShell
                title="Phê duyệt khoản vay"
                description="Duyệt và giải ngân các khoản vay đã nộp hồ sơ. Kiểm tra tài liệu trước khi phê duyệt."
                breadcrumb={[
                    { label: 'Quản lý khoản vay', path: '/loans' },
                    { label: 'Phê duyệt khoản vay' },
                ]}
                stats={statCards}
                helpTooltip="Bấm Chi tiết để xem hồ sơ, tài liệu, lịch trả nợ. Duyệt khi đủ tài liệu bắt buộc. Giải ngân khi hợp đồng đã ký."
            >
                <LoanTable
                    variant="approval"
                    request={fetchData}
                    onViewDetails={handleViewDetails}
                    actionColumn={actionColumn}
                    actionRef={actionRef}
                    showFilterPanel={showFilters}
                    filterContent={(ref) => (
                        <LoanFilterForm
                            form={form}
                            actionRef={ref}
                            products={products}
                            ranges={[]}
                            activeTab="pending"
                        />
                    )}
                    headerTitle="Danh sách chờ duyệt"
                    emptyText={
                        <span>
                            Không có khoản vay nào chờ phê duyệt.
                            <br />
                            <Link to="/loans">Xem tất cả khoản vay</Link>
                        </span>
                    }
                    toolBarRender={() => [
                        <Tooltip key="filter" title="Bộ lọc nâng cao">
                            <Button icon={<FilterOutlined />} onClick={() => setShowFilters(!showFilters)} type={showFilters ? 'primary' : 'default'}>
                                Bộ lọc
                            </Button>
                        </Tooltip>,
                        <Tooltip key="reload" title="Làm mới danh sách">
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={() => actionRef.current?.reload?.()}
                            >
                                Làm mới
                            </Button>
                        </Tooltip>,
                        <Tooltip key="loans" title="Chuyển sang Quản lý khoản vay">
                            <Button onClick={() => navigate('/loans')}>
                                Quản lý khoản vay
                            </Button>
                        </Tooltip>,
                    ]}
                    pagination={{
                        pageSize: 15,
                        showSizeChanger: true,
                        showTotal: t => `Tổng ${t} khoản vay chờ duyệt`,
                        showQuickJumper: true,
                    }}
                    columnsStateKey="loan-approvals-table-v2"
                />

                <LoanDetailDrawer
                    open={!!viewLoanId}
                    onClose={handleCloseDrawer}
                    loanId={viewLoanId}
                    mode="approval"
                />
            </LoanPageShell>
        </>
    );
}
