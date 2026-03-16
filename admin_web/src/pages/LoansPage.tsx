import { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ActionType } from '@ant-design/pro-components';
import { Button, Form, message, Tooltip } from 'antd';
import {
    SyncOutlined, FilterOutlined, ReloadOutlined,
    DollarOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, FileDoneOutlined,
} from '@ant-design/icons';
import { adminApi } from '../api/admin';
import LoanDetailDrawer from '../components/LoanDetailDrawer';
import LoanTable from '../components/LoanTable';
import LoanFilterForm from '../components/LoanFilterForm';
import { type TabKey } from '../config/loanTableConfig';
import { PageWithStatsSkeleton } from '../components/PageSkeleton';
import PageHeader from '../components/PageHeader';
import StatFilterCards, { type StatFilterItem } from '../components/StatFilterCards';

const STATUS_MAP: Record<string, TabKey> = {
    all: 'all',
    pending: 'pending',
    approved: 'approved',
    disbursed: 'disbursed',
    overdue: 'overdue',
    closed: 'closed',
};

export default function LoansPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const actionRef = useRef<ActionType>();
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, disbursed: 0, overdue: 0, closed: 0 });
    const [products, setProducts] = useState<Array<{ id: number; name: string; shortName: string }>>([]);
    const [ranges, setRanges] = useState<Array<{ id: number; classification: string; minimumAgeDays?: number }>>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [form] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();

    const tabFromUrl = (searchParams.get('tab') as TabKey) || 'all';
    const [activeTab, setActiveTab] = useState<TabKey>(STATUS_MAP[tabFromUrl] || 'all');

    const [drawerLoanId, setDrawerLoanId] = useState<number | null>(null);
    const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            adminApi.getLoansStats().then(setStats).catch(() => { }),
            adminApi.getLoanProducts().then(setProducts).catch(() => []),
            adminApi.getDelinquencyRanges().then(setRanges).catch(() => []),
        ]).finally(() => setInitialLoading(false));
    }, []);

    const handleTabChange = (key: string) => {
        const k = key as TabKey;
        setActiveTab(k);
        setSearchParams((p) => {
            const next = new URLSearchParams(p);
            if (k === 'all') next.delete('tab');
            else next.set('tab', k);
            return next;
        });
        actionRef.current?.reloadAndRest?.();
    };

    const handleSync = useCallback(async () => {
        setSyncing(true);
        try {
            const result = await adminApi.syncDisbursedLoans(300);
            messageApi.success(`Đồng bộ xong: ${result.synced} khoản; ${result.errors} lỗi`);
            adminApi.getLoansStats().then(setStats);
            actionRef.current?.reloadAndRest?.();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message ?? 'Đồng bộ thất bại');
        } finally {
            setSyncing(false);
        }
    }, [messageApi]);

    const handleViewDetails = useCallback((loanId: number, userId?: string) => {
        setDrawerLoanId(loanId);
        setDrawerUserId(userId ?? null);
    }, []);

    const fetchData = useCallback(async (params: any) => {
        const currentPage = Number(params.current ?? 1) || 1;
        const pageSize = Number(params.pageSize ?? 20) || 20;
        const filters: any = {
            page: currentPage,
            limit: pageSize,
            status: activeTab,
        };
        const formValues = form.getFieldsValue();
        if (formValues.keyword) filters.keyword = formValues.keyword;
        if (formValues.productId) filters.productId = formValues.productId;
        if (formValues.classification) filters.classification = formValues.classification;
        if (formValues.delinquentDaysMin != null) filters.delinquentDaysMin = formValues.delinquentDaysMin;
        if (formValues.delinquentDaysMax != null) filters.delinquentDaysMax = formValues.delinquentDaysMax;
        if (formValues.minOverdueAmount != null) filters.minOverdueAmount = formValues.minOverdueAmount;
        if (formValues.maxOverdueAmount != null) filters.maxOverdueAmount = formValues.maxOverdueAmount;
        if (formValues.disbursementDate?.[0]) filters.disbursementDateFrom = formValues.disbursementDate[0].format('YYYY-MM-DD');
        if (formValues.disbursementDate?.[1]) filters.disbursementDateTo = formValues.disbursementDate[1].format('YYYY-MM-DD');

        const res = await adminApi.getLoans(filters);

        if (currentPage > 1 && (res.total ?? 0) > 0 && (!Array.isArray(res.items) || res.items.length === 0)) {
            const firstPageRes = await adminApi.getLoans({ ...filters, page: 1 });
            return { data: firstPageRes.items ?? [], success: true, total: firstPageRes.total ?? 0 };
        }

        return { data: res.items ?? [], success: true, total: res.total ?? 0 };
    }, [activeTab, form]);

    const statCards: StatFilterItem[] = [
        { filterKey: 'all', title: 'Tổng khoản vay', value: stats.total, color: '#1E40AF', gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)', icon: <DollarOutlined /> },
        { filterKey: 'pending', title: 'Chờ duyệt', value: stats.pending, color: '#D97706', gradient: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', icon: <ClockCircleOutlined /> },
        { filterKey: 'approved', title: 'Đã phê duyệt', value: stats.approved, color: '#7C3AED', gradient: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)', icon: <FileDoneOutlined /> },
        { filterKey: 'disbursed', title: 'Đang hoạt động', value: stats.disbursed, color: '#059669', gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', icon: <CheckCircleOutlined /> },
        { filterKey: 'overdue', title: 'Quá hạn', value: stats.overdue, color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)', icon: <ExclamationCircleOutlined /> },
        { filterKey: 'closed', title: 'Đã đóng', value: stats.closed, color: '#6B7280', gradient: 'linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)', icon: <CloseCircleOutlined /> },
    ];

    if (initialLoading) {
        return (
            <div>
                <PageHeader
                    title="Quản lý khoản vay"
                    description="Quản lý toàn bộ khoản vay theo từng giai đoạn: chờ duyệt, đã phê duyệt, đang hoạt động, quá hạn, đã đóng."
                    breadcrumb={[{ label: 'Quản lý khoản vay' }]}
                />
                <PageWithStatsSkeleton statCount={6} tableRows={6} tableColumns={6} />
            </div>
        );
    }

    return (
        <>
            {contextHolder}
            <PageHeader
                title="Quản lý khoản vay"
                description="Quản lý toàn bộ khoản vay theo từng giai đoạn: chờ duyệt, đã phê duyệt, đang hoạt động, quá hạn, đã đóng."
                breadcrumb={[{ label: 'Quản lý khoản vay' }]}
            />
            <StatFilterCards
                items={statCards}
                activeKey={activeTab}
                onChange={handleTabChange}
                colSpan={{ xs: 12, sm: 8, md: 6, lg: 4 }}
            />


            <LoanTable
                variant="management"
                request={fetchData}
                onViewDetails={handleViewDetails}
                activeTab={activeTab}
                showFilterPanel={showFilters}
                filterContent={(ref) => (
                    <LoanFilterForm
                        form={form}
                        actionRef={ref}
                        products={products}
                        ranges={ranges}
                        activeTab={activeTab}
                    />
                )}
                actionRef={actionRef}
                toolBarRender={() => [
                    <Tooltip key="filter" title="Bộ lọc nâng cao theo sản phẩm, ngày giải ngân, quá hạn">
                        <Button icon={<FilterOutlined />} onClick={() => setShowFilters(!showFilters)} type={showFilters ? 'primary' : 'default'}>
                            Bộ lọc
                        </Button>
                    </Tooltip>,
                    <Tooltip key="sync" title="Đồng bộ dữ liệu mới nhất từ Fineract">
                        <Button icon={<SyncOutlined />} onClick={handleSync} loading={syncing}>
                            Đồng bộ
                        </Button>
                    </Tooltip>,
                    <Tooltip key="refresh" title="Làm mới danh sách và thống kê">
                        <Button icon={<ReloadOutlined />} onClick={() => { adminApi.getLoansStats().then(setStats); actionRef.current?.reloadAndRest?.(); }}>
                            Làm mới
                        </Button>
                    </Tooltip>,
                ]}
                headerTitle="Danh sách khoản vay"
                columnsStateKey="loans-management-table-v2"
            />


            <LoanDetailDrawer
                open={!!drawerLoanId}
                onClose={() => { setDrawerLoanId(null); setDrawerUserId(null); }}
                loanId={drawerLoanId}
                userId={drawerUserId ?? undefined}
                mode="view"
            />
        </>
    );
}
