import { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ActionType } from '@ant-design/pro-components';
import { Card, Button, Space, Tag, Form, message, Tooltip, Row, Col } from 'antd';
import {
    SyncOutlined, FilterOutlined, ReloadOutlined,
    DollarOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined,
    PlusOutlined
} from '@ant-design/icons';
import { adminApi } from '../api/admin';
import LoanDetailDrawer from '../components/LoanDetailDrawer';
import LoanPageShell, { StatCard } from '../components/LoanPageShell';
import LoanTable from '../components/LoanTable';
import LoanFilterForm from '../components/LoanFilterForm';
import { TAB_LABELS, type TabKey } from '../config/loanTableConfig';
import { LoanPageShellSkeleton } from '../components/PageSkeleton';
import Text from 'antd/es/typography/Text';
import PageHeader from '../components/PageHeader';

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

    const statCards: StatCard[] = [
        { key: 'total', title: 'Tổng khoản vay', value: stats.total, gradient: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)', icon: <DollarOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { key: 'pending', title: 'Chờ duyệt', value: stats.pending, gradient: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)', icon: <ClockCircleOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { key: 'disbursed', title: 'Đang hoạt động', value: stats.disbursed, gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)', icon: <CheckCircleOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { key: 'overdue', title: 'Quá hạn', value: stats.overdue, gradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)', icon: <ExclamationCircleOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { key: 'closed', title: 'Đã đóng', value: stats.closed, gradient: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)', icon: <CloseCircleOutlined style={{ fontSize: 24, color: '#fff' }} /> },
    ];

    const tabItems = [
        { key: 'all', label: TAB_LABELS.all, count: stats.total },
        { key: 'pending', label: TAB_LABELS.pending, count: stats.pending },
        { key: 'approved', label: TAB_LABELS.approved, count: stats.approved },
        { key: 'disbursed', label: TAB_LABELS.disbursed, count: stats.disbursed },
        { key: 'overdue', label: TAB_LABELS.overdue, count: stats.overdue },
        { key: 'closed', label: TAB_LABELS.closed, count: stats.closed },
    ];

    if (initialLoading) {
        return (
            <LoanPageShellSkeleton
                statCount={5}
                tableRows={6}
                tableColumns={6}
                title="Quản lý khoản vay"
                description="Quản lý toàn bộ khoản vay theo từng giai đoạn: chờ duyệt, đã phê duyệt, đang hoạt động, quá hạn, đã đóng."
                breadcrumbLabels={['Quản lý khoản vay']}
            />
        );
    }

    return (
        <>
            {contextHolder}
            {/* <LoanPageShell
                title="Quản lý khoản vay"
                description="Quản lý toàn bộ khoản vay theo từng giai đoạn: chờ duyệt, đã phê duyệt, đang hoạt động, quá hạn, đã đóng."
                breadcrumb={[{ label: 'Quản lý khoản vay' }]}
                stats={statCards}
                helpTooltip="Dùng tab để lọc theo trạng thái. Bộ lọc nâng cao hỗ trợ tìm theo khoản quá hạn, ngày giải ngân."
            > */}
            <PageHeader
                title="Quản lý khoản vay"
                description="Quản lý toàn bộ khoản vay theo từng giai đoạn: chờ duyệt, đã phê duyệt, đang hoạt động, quá hạn, đã đóng."
                breadcrumb={[{ label: 'Quản lý khoản vay' }]}
            />
            {/* Stat Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {statCards.map((s, i) => (
                    <Col flex="1 0 20%" style={{ alignItems: "center", justifyContent: "center" }} key={i}>
                        <Card
                            bordered={false}
                            style={{
                                background: s.gradient,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                height: '100%',
                                minHeight: 100,
                                alignItems: 'center',
                                justifyContent: 'center',
                                display: 'flex',
                            }}
                            styles={{ body: { padding: '24px 29px' } }}
                        >
                            <Space align="center" size={16} style={{ width: '100%' }}>
                                <div style={{
                                    width: 38, height: 38, borderRadius: 8,
                                    background: 'rgba(255,255,255,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>{s.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, display: 'block' }}>{s.title}</Text>
                                    <Text strong style={{ color: '#fff', fontSize: 26, fontWeight: 700, lineHeight: 1.2, display: 'block' }}>{s.value}</Text>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                ))}
            </Row>
            <Card bordered={false} style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
                <div style={{ padding: '16px 24px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space wrap>
                        {tabItems.map((t) => (
                            <Button
                                key={t.key}
                                type={activeTab === t.key ? 'primary' : 'default'}
                                size="middle"
                                onClick={() => handleTabChange(t.key)}
                                style={{ fontWeight: activeTab === t.key ? 600 : 400 }}
                            >
                                {t.label}
                                <Tag color={activeTab === t.key ? 'primary' : 'default'} style={{ marginLeft: 6 }}>
                                    {t.count}
                                </Tag>
                            </Button>
                        ))}
                    </Space>
                </div>
            </Card>


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
            {/* </LoanPageShell> */}

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
