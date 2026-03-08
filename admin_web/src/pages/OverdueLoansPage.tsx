import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Select, InputNumber, Button, Space, Typography, Alert, Tag, message, theme } from 'antd';
import { EyeOutlined, SyncOutlined, ExclamationCircleOutlined, UserOutlined } from '@ant-design/icons';
import { adminApi } from '../api/admin';
import { fmtVND } from '../utils/fineractStatus';

const { Text } = Typography;

type OverdueItem = {
    _id: string;
    fineractLoanId: number;
    userId: string;
    customerName: string;
    customerUsername: string;
    fineractClientId?: string;
    capital: number;
    totalOverdue: number;
    delinquentDays: number;
    delinquencyClassification: string | null;
    lastSyncedAt: string | null;
};

type DelinquencyRange = { id: number; classification: string; minimumAgeDays?: number };

export default function OverdueLoansPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [ranges, setRanges] = useState<DelinquencyRange[]>([]);
    const [items, setItems] = useState<OverdueItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingRanges, setLoadingRanges] = useState(true);
    const [classification, setClassification] = useState<string | undefined>(undefined);
    const [minOverdueAmount, setMinOverdueAmount] = useState<number | undefined>(undefined);
    const [maxOverdueAmount, setMaxOverdueAmount] = useState<number | undefined>(undefined);
    const [delinquentDaysMin, setDelinquentDaysMin] = useState<number | undefined>(undefined);
    const [delinquentDaysMax, setDelinquentDaysMax] = useState<number | undefined>(undefined);
    const [syncing, setSyncing] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const fetchRanges = useCallback(async () => {
        setLoadingRanges(true);
        try {
            const data = await adminApi.getDelinquencyRanges();
            setRanges(data ?? []);
        } catch {
            setRanges([]);
        } finally {
            setLoadingRanges(false);
        }
    }, []);

    const fetchOverdue = useCallback(async () => {
        setLoading(true);
        try {
            const params: {
                classification?: string;
                minOverdueAmount?: number;
                maxOverdueAmount?: number;
                delinquentDaysMin?: number;
                delinquentDaysMax?: number;
            } = {};
            if (classification) params.classification = classification;
            if (minOverdueAmount != null && minOverdueAmount > 0) params.minOverdueAmount = minOverdueAmount;
            if (maxOverdueAmount != null && maxOverdueAmount >= 0) params.maxOverdueAmount = maxOverdueAmount;
            if (delinquentDaysMin != null && delinquentDaysMin >= 0) params.delinquentDaysMin = delinquentDaysMin;
            if (delinquentDaysMax != null && delinquentDaysMax >= 0) params.delinquentDaysMax = delinquentDaysMax;
            const data = await adminApi.getOverdueLoans(params);
            setItems(data.items ?? []);
            setTotal(data.total ?? 0);
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message ?? 'Không tải được danh sách quá hạn');
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [classification, minOverdueAmount, maxOverdueAmount, delinquentDaysMin, delinquentDaysMax, messageApi]);

    useEffect(() => {
        fetchRanges();
    }, [fetchRanges]);

    useEffect(() => {
        fetchOverdue();
    }, [fetchOverdue]);

    const handleSyncFromFineract = useCallback(async () => {
        setSyncing(true);
        try {
            const result = await adminApi.syncDisbursedLoans(300);
            messageApi.success(`Đồng bộ xong: ${result.synced} khoản; ${result.errors} lỗi; ${result.skipped} bỏ qua (không có user).`);
            await fetchOverdue();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message ?? 'Đồng bộ thất bại');
        } finally {
            setSyncing(false);
        }
    }, [messageApi, fetchOverdue]);

    /** Mở chi tiết khoản vay giống bên Khách hàng: chuyển sang trang khách hàng và mở drawer khoản vay. */
    const handleViewDetails = (row: OverdueItem) => {
        navigate(`/customers/${row.userId}?viewLoan=${row.fineractLoanId}`);
    };

    const formatDate = (v: string | null) => {
        if (!v) return '–';
        try {
            return new Date(v).toLocaleString('vi-VN');
        } catch {
            return '–';
        }
    };

    return (
        <>
            {contextHolder}
            <Card
                bordered={false}
                style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                title={
                    <Space>
                        <ExclamationCircleOutlined style={{ color: token.colorError }} />
                        <span>Khoản vay quá hạn</span>
                        <Tag color="error">{total} khoản</Tag>
                    </Space>
                }
                extra={
                    <Space>
                        <Button icon={<SyncOutlined />} onClick={handleSyncFromFineract} loading={syncing}>
                            Làm mới thông tin
                        </Button>
                        <Button type="primary" icon={<SyncOutlined />} onClick={fetchOverdue} loading={loading}>
                            Tải lại
                        </Button>
                    </Space>
                }
            >
                <Alert
                    type="info"
                    showIcon
                    message={
                        <>
                            Dữ liệu lấy từ Mongo (đã sync từ Fineract). Nếu danh sách trống nhưng có khoản quá hạn khi xem chi tiết, hãy bấm <strong>Làm mới thông tin</strong> để đưa tất cả khoản đã giải ngân vào Mongo. Cron 2:00 AM cũng chạy bước này. Lọc theo nhóm quá hạn, khoản quá hạn (từ–đến ₫), số ngày quá hạn (từ–đến ngày).
                        </>
                    }
                    style={{ marginBottom: 16 }}
                />

                <div style={{ marginBottom: 16 }}>
                    <Space wrap align="start" size="middle">
                        <Space wrap>
                            <span style={{ fontWeight: 500 }}>Nhóm quá hạn:</span>
                            <Select
                                placeholder="Tất cả nhóm"
                                allowClear
                                style={{ width: 240 }}
                                loading={loadingRanges}
                                value={classification ?? ''}
                                onChange={(v) => setClassification(v === '' ? undefined : (v as string))}
                                options={[
                                    { value: '', label: 'Tất cả nhóm' },
                                    ...ranges.map((r) => ({ value: r.classification, label: `${r.classification}${r.minimumAgeDays != null ? ` (${r.minimumAgeDays} ngày)` : ''}` })),
                                ]}
                            />
                        </Space>
                        <Space wrap>
                            <span style={{ fontWeight: 500 }}>Khoản quá hạn (₫):</span>
                            <InputNumber
                                min={0}
                                placeholder="Từ"
                                style={{ width: 140 }}
                                formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                                parser={(v) => (v ? Number(String(v).replace(/,/g, '')) : 0)}
                                value={minOverdueAmount ?? undefined}
                                onChange={(v) => setMinOverdueAmount(v != null ? Number(v) : undefined)}
                                addonBefore="Từ"
                            />
                            <InputNumber
                                min={0}
                                placeholder="Đến"
                                style={{ width: 140 }}
                                formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                                parser={(v) => (v ? Number(String(v).replace(/,/g, '')) : 0)}
                                value={maxOverdueAmount ?? undefined}
                                onChange={(v) => setMaxOverdueAmount(v != null ? Number(v) : undefined)}
                                addonBefore="Đến"
                            />
                        </Space>
                        <Space wrap>
                            <span style={{ fontWeight: 500 }}>Số ngày quá hạn (kỳ):</span>
                            <InputNumber
                                min={0}
                                placeholder="Từ"
                                style={{ width: 100 }}
                                value={delinquentDaysMin ?? undefined}
                                onChange={(v) => setDelinquentDaysMin(v != null ? Number(v) : undefined)}
                                addonAfter="ngày"
                            />
                            <InputNumber
                                min={0}
                                placeholder="Đến"
                                style={{ width: 100 }}
                                value={delinquentDaysMax ?? undefined}
                                onChange={(v) => setDelinquentDaysMax(v != null ? Number(v) : undefined)}
                                addonAfter="ngày"
                            />
                        </Space>
                        <Button type="primary" onClick={fetchOverdue} loading={loading}>
                            Lọc
                        </Button>
                    </Space>
                </div>

                <Table<OverdueItem>
                    rowKey="_id"
                    loading={loading}
                    dataSource={items}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Tổng ${t} khoản` }}
                    size="small"
                    columns={[
                        { title: 'Khoản vay', dataIndex: 'fineractLoanId', width: 100, render: (id) => `#${id}` },
                        {
                            title: 'Khách hàng',
                            key: 'customer',
                            render: (_, r) => (
                                <Space>
                                    <UserOutlined />
                                    <a onClick={() => navigate(`/customers/${r.userId}`)}>{r.customerName || r.customerUsername || '–'}</a>
                                </Space>
                            ),
                        },
                        { title: 'Gốc vay', dataIndex: 'capital', align: 'right', width: 120, render: (v) => fmtVND(v) },
                        { title: 'Số tiền quá hạn', dataIndex: 'totalOverdue', align: 'right', width: 140, render: (v) => <Text type="danger" strong>{fmtVND(v)}</Text> },
                        { title: 'Số ngày quá hạn', dataIndex: 'delinquentDays', align: 'center', width: 110 },
                        {
                            title: 'Nhóm quá hạn',
                            dataIndex: 'delinquencyClassification',
                            width: 140,
                            render: (v) => v ? <Tag color="orange">{v}</Tag> : '–',
                        },
                        { title: 'Đồng bộ lúc', dataIndex: 'lastSyncedAt', width: 150, render: formatDate },
                        {
                            title: '',
                            key: 'action',
                            width: 100,
                            render: (_, r) => (
                                <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(r)}>
                                    Chi tiết
                                </Button>
                            ),
                        },
                    ]}
                />
            </Card>
        </>
    );
}
