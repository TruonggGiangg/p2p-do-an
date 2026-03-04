import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
    Button, Space, Avatar, Typography, Tooltip, Badge, theme, Tabs, Tag,
    Card, Row, Col, Statistic, Select, DatePicker, Form, Input, Divider
} from 'antd';
import {
    EyeOutlined, UserOutlined, PhoneOutlined, CheckCircleOutlined,
    ClockCircleOutlined, FilterOutlined, ReloadOutlined, TeamOutlined,
    BankOutlined, FileSearchOutlined, DashboardOutlined, UsergroupAddOutlined,
    CheckCircleTwoTone, ClockCircleTwoTone
} from '@ant-design/icons';
import { adminApi, CustomerDto } from '../api/admin';
import { FineractStatusBadge } from '../utils/fineractStatus';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

type ViewMode = 'all' | 'pending' | 'active' | 'inactive';
type KycFilter = 'all' | 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
type FineractFilter = 'all' | 'active' | 'inactive' | 'pending';

interface FilterState {
    kycStatus: KycFilter;
    fineractStatus: FineractFilter;
    dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
    searchText: string;
}

export default function CustomersPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const actionRef = useRef<ActionType>();
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [pendingCount, setPendingCount] = useState(0);
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<FilterState>({
        kycStatus: 'all',
        fineractStatus: 'all',
        dateRange: null,
        searchText: '',
    });
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        pendingKyc: 0,
        verifiedKyc: 0,
    });

    // Load counts and stats
    const fetchGlobalStats = async () => {
        try {
            // Fetch a larger page size to calculate true stats, 
            // since the backend logic already fetches everything into memory anyway.
            const res = await adminApi.getCustomers(1, 1000);
            const pendingRes = await adminApi.getPendingApprovalCustomers(1, 1000);

            setPendingCount(pendingRes.total);
            setStats({
                total: res.total,
                active: res.users.filter(u => u.status === 'active').length,
                pendingKyc: res.users.filter(u => u.kycStatus === 'PENDING').length,
                verifiedKyc: res.users.filter(u => u.kycStatus === 'VERIFIED').length,
            });
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    useEffect(() => {
        fetchGlobalStats();
    }, []);

    const columns: ProColumns<CustomerDto>[] = [
        {
            title: 'Khách hàng',
            dataIndex: 'displayName',
            key: 'name',
            fixed: 'left',
            width: 220,
            render: (_, r) => (
                <Space>
                    <Avatar
                        icon={<UserOutlined />}
                        size="large"
                        style={{
                            background: r.kycStatus === 'VERIFIED' ? token.colorSuccess : token.colorPrimaryBg,
                            color: r.kycStatus === 'VERIFIED' ? '#fff' : token.colorPrimary,
                            border: r.kycStatus === 'VERIFIED' ? `2px solid ${token.colorSuccess}` : 'none'
                        }}
                    />
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 13 }}>{r.displayName || r.username}</Text>
                        <Space size={4}>
                            <PhoneOutlined style={{ fontSize: 11, color: token.colorTextSecondary }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Text>
                        </Space>
                        {r.externalId && (
                            <div>
                                <Text type="secondary" style={{ fontSize: 11 }}>ID: {r.externalId}</Text>
                            </div>
                        )}
                    </div>
                </Space>
            ),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            width: 200,
            ellipsis: true,
            render: v => v || <Text type="secondary">–</Text>,
        },
        {
            title: 'Văn phòng / Nhân viên',
            key: 'officeStaff',
            width: 180,
            render: (_, r) => (
                <Space direction="vertical" size={2}>
                    <Badge color="gold" text={r.officeName || 'Head Office'} />
                    {r.staffName && r.staffName !== 'Chưa phân công' && (
                        <Text type="secondary" style={{ fontSize: 11 }}><TeamOutlined /> {r.staffName}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Ngày kích hoạt',
            dataIndex: 'activationDate',
            key: 'activationDate',
            width: 130,
            align: 'center',
            sorter: (a, b) => {
                const da = a.activationDate ? new Date(a.activationDate).getTime() : 0;
                const db = b.activationDate ? new Date(b.activationDate).getTime() : 0;
                return da - db;
            },
            render: (_, record) => {
                const v = record.activationDate;
                if (!v) return <Tag color="default">Chưa kích hoạt</Tag>;
                const d = new Date(v);
                return !isNaN(d.getTime()) ? (
                    <Space direction="vertical" size={0} style={{ textAlign: 'center' }}>
                        <Text>{d.toLocaleDateString('vi-VN')}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(d).format('DD/MM/YYYY')}</Text>
                    </Space>
                ) : '–';
            },
        },
        {
            title: 'Trạng thái KYC',
            dataIndex: 'kycStatus',
            key: 'kycStatus',
            align: 'center',
            width: 140,
            filters: [
                { text: 'Chưa KYC', value: 'NONE' },
                { text: 'Có thông tin KYC, chờ duyệt', value: 'PENDING' },
                { text: 'Đã duyệt', value: 'VERIFIED' },
                { text: 'Từ chối', value: 'REJECTED' },
            ],
            onFilter: (value, record) => (record.kycStatus || 'NONE') === value,
            render: (_, r) => {
                const v = r.kycStatus || 'NONE';
                const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string; bg: string }> = {
                    'NONE': { color: 'default', icon: null, text: 'Chưa KYC', bg: token.colorFillTertiary },
                    'PENDING': { color: 'warning', icon: <ClockCircleOutlined />, text: 'Có thông tin KYC, chờ duyệt', bg: token.colorWarningBg },
                    'VERIFIED': { color: 'success', icon: <CheckCircleOutlined />, text: 'Đã duyệt', bg: token.colorSuccessBg },
                    'REJECTED': { color: 'error', icon: null, text: 'Từ chối', bg: token.colorErrorBg },
                };
                const s = statusMap[v] || statusMap['NONE'];
                return (
                    <Tag
                        color={s.color}
                        icon={s.icon}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 0,
                            fontWeight: 500,
                            background: s.bg,
                            border: 'none'
                        }}
                    >
                        {s.text}
                    </Tag>
                );
            },
        },
        {
            title: 'Trạng thái Fineract',
            dataIndex: 'fineractStatus',
            key: 'fineractStatus',
            align: 'center',
            width: 140,
            render: (_, r) => <FineractStatusBadge status={r.fineractStatus} />,
        },
        {
            title: 'Thao tác',
            key: 'actions',
            align: 'center',
            fixed: 'right',
            width: 140,
            onCell: () => ({ style: { paddingLeft: 12, paddingRight: 12, whiteSpace: 'nowrap' } }),
            render: (_, r) => (
                <Tooltip title="Xem chi tiết">
                    <Button
                        type="primary"
                        icon={<EyeOutlined />}
                        onClick={(e) => { e.stopPropagation(); navigate(`/customers/${r._id || r.fineractClientId}`); }}
                        style={{ borderRadius: 0, fontSize: 12 }}
                    >
                        Chi tiết
                    </Button>
                </Tooltip>
            ),
        },
    ];

    const handleTabChange = (key: string) => {
        setViewMode(key as ViewMode);
        // Reset filters when changing tabs
        setFilters({
            kycStatus: 'all',
            fineractStatus: 'all',
            dateRange: null,
            searchText: '',
        });
        actionRef.current?.reload();
    };

    const applyFilters = (users: CustomerDto[]): CustomerDto[] => {
        let filtered = [...users];

        // KYC Status filter
        if (filters.kycStatus !== 'all') {
            filtered = filtered.filter(u => (u.kycStatus || 'NONE') === filters.kycStatus);
        }

        // Fineract Status filter
        if (filters.fineractStatus !== 'all') {
            filtered = filtered.filter(u => {
                const status = u.fineractStatus?.code || u.fineractStatus;
                if (filters.fineractStatus === 'active') return String(status).includes('active');
                if (filters.fineractStatus === 'inactive') return String(status).includes('inactive');
                if (filters.fineractStatus === 'pending') return String(status).includes('pending');
                return true;
            });
        }

        // Date range filter
        if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
            const start = filters.dateRange[0].startOf('day').valueOf();
            const end = filters.dateRange[1].endOf('day').valueOf();
            filtered = filtered.filter(u => {
                const date = u.activationDate ? new Date(u.activationDate).getTime() : 0;
                return date >= start && date <= end;
            });
        }

        // Search text filter (across multiple fields)
        if (filters.searchText) {
            const search = filters.searchText.toLowerCase();
            filtered = filtered.filter(u =>
                (u.displayName?.toLowerCase().includes(search)) ||
                (u.username?.toLowerCase().includes(search)) ||
                (u.email?.toLowerCase().includes(search)) ||
                (u.externalId?.toLowerCase().includes(search))
            );
        }

        return filtered;
    };

    const fetchData = async (params: any) => {
        const keyword = params.keyword as string | undefined;

        // Fetch ALL records for the given keyword to support correct clientside filtering/pagination
        // Since backend fetches all from Fineract anyway, this is efficient for this scale.
        let res;
        if (viewMode === 'pending') {
            res = await adminApi.getPendingApprovalCustomers(1, 1000, keyword);
        } else {
            res = await adminApi.getCustomers(1, 1000, keyword);

            // Apply view mode filter
            if (viewMode === 'active') {
                res.users = res.users.filter(u => u.status === 'active');
            } else if (viewMode === 'inactive') {
                res.users = res.users.filter(u => u.status !== 'active');
            }
        }

        // Apply advanced filters to the FULL list, remove null/undefined
        const filteredUsers = applyFilters(res.users || []).filter(Boolean);

        // Paginate client-side (ProTable expects paginated data to avoid extra empty row)
        const page = params.current ?? 1;
        const size = params.pageSize ?? 20;
        const start = (page - 1) * size;
        const paged = filteredUsers.slice(start, start + size);

        return {
            data: paged,
            success: true,
            total: filteredUsers.length
        };
    };

    const getHeaderTitle = () => {
        switch (viewMode) {
            case 'pending': return 'Khách hàng có thông tin KYC và đang chờ phê duyệt';
            case 'active': return 'Khách hàng đang hoạt động';
            case 'inactive': return 'Khách hàng chưa kích hoạt';
            default: return 'Tất cả khách hàng';
        }
    };

    const tabItems = [
        {
            key: 'all',
            label: (
                <Space>
                    <TeamOutlined />
                    Tất cả
                    <Badge count={stats.total} style={{ backgroundColor: token.colorPrimary }} />
                </Space>
            ),
        },
        {
            key: 'pending',
            label: (
                <Space>
                    <ClockCircleOutlined />
                    Có thông tin KYC, chờ duyệt
                    <Badge count={pendingCount} style={{ backgroundColor: '#faad14' }} />
                </Space>
            ),
        },
        {
            key: 'active',
            label: (
                <Space>
                    <CheckCircleOutlined />
                    Đang hoạt động
                    <Badge count={stats.active} style={{ backgroundColor: token.colorSuccess }} />
                </Space>
            ),
        },
        {
            key: 'inactive',
            label: (
                <Space>
                    <BankOutlined />
                    Chưa kích hoạt
                    <Badge count={stats.total - stats.active} style={{ backgroundColor: token.colorTextTertiary }} />
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Stats Cards - Enhanced with professional styling */}
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card 
                        bordered={false} 
                        style={{ 
                            borderRadius: 0, 
                            background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
                            boxShadow: '0 4px 12px rgba(30, 64, 175, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>
                                    Tổng khách hàng
                                </Text>
                                <Title level={2} style={{ 
                                    margin: 0, 
                                    color: '#FFFFFF', 
                                    fontSize: 36, 
                                    fontWeight: 700,
                                    letterSpacing: '-0.02em',
                                }}>
                                    {stats.total}
                                </Title>
                            </div>
                            <div style={{ 
                                width: 56, 
                                height: 56, 
                                borderRadius: 0, 
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                            }}>
                                <TeamOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
                
                <Col xs={24} sm={12} lg={6}>
                    <Card 
                        bordered={false} 
                        style={{ 
                            borderRadius: 0, 
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>
                                    Đang hoạt động
                                </Text>
                                <Title level={2} style={{ 
                                    margin: 0, 
                                    color: '#FFFFFF', 
                                    fontSize: 36, 
                                    fontWeight: 700,
                                }}>
                                    {stats.active}
                                </Title>
                            </div>
                            <div style={{ 
                                width: 56, 
                                height: 56, 
                                borderRadius: 0, 
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                            }}>
                                <CheckCircleTwoTone twoToneColor="#FFFFFF" style={{ fontSize: 28 }} />
                            </div>
                        </div>
                    </Card>
                </Col>
                
                <Col xs={24} sm={12} lg={6}>
                    <Card 
                        bordered={false} 
                        style={{ 
                            borderRadius: 0, 
                            background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>
                                    Có thông tin KYC, chờ duyệt
                                </Text>
                                <Title level={2} style={{ 
                                    margin: 0, 
                                    color: '#FFFFFF', 
                                    fontSize: 36, 
                                    fontWeight: 700,
                                }}>
                                    {stats.pendingKyc}
                                </Title>
                            </div>
                            <div style={{ 
                                width: 56, 
                                height: 56, 
                                borderRadius: 0, 
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                            }}>
                                <ClockCircleTwoTone twoToneColor="#FFFFFF" style={{ fontSize: 28 }} />
                            </div>
                        </div>
                    </Card>
                </Col>
                
                <Col xs={24} sm={12} lg={6}>
                    <Card 
                        bordered={false} 
                        style={{ 
                            borderRadius: 0, 
                            background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>
                                    Đã xác minh KYC
                                </Text>
                                <Title level={2} style={{ 
                                    margin: 0, 
                                    color: '#FFFFFF', 
                                    fontSize: 36, 
                                    fontWeight: 700,
                                }}>
                                    {stats.verifiedKyc}
                                </Title>
                            </div>
                            <div style={{ 
                                width: 56, 
                                height: 56, 
                                borderRadius: 0, 
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                            }}>
                                <FileSearchOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Tabs - Enhanced */}
            <Card
                bordered={false}
                style={{
                    borderRadius: 0,
                    marginBottom: 24,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    overflow: 'visible',
                }}
                bodyStyle={{ padding: 0, overflow: 'visible' }}
            >
                <Tabs
                    activeKey={viewMode}
                    onChange={handleTabChange}
                    items={tabItems}
                    size="large"
                    tabBarStyle={{ 
                        marginBottom: 0,
                        padding: '16px 24px 12px 24px',
                        borderBottom: `2px solid ${token.colorBorderSecondary}`,
                        minHeight: 52,
                    }}
                    tabBarGutter={16}
                />
            </Card>

            {/* Advanced Filters */}
            <Card
                bordered={false}
                style={{
                    borderRadius: 0,
                    marginBottom: 16,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    display: showFilters ? 'block' : 'none'
                }}
                title={
                    <Space>
                        <FilterOutlined />
                        Bộ lọc nâng cao
                    </Space>
                }
                extra={
                    <Button
                        type="link"
                        onClick={() => {
                            setFilters({
                                kycStatus: 'all',
                                fineractStatus: 'all',
                                dateRange: null,
                                searchText: '',
                            });
                            actionRef.current?.reload();
                        }}
                    >
                        Xóa bộ lọc
                    </Button>
                }
            >
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Trạng thái KYC" style={{ marginBottom: 0 }}>
                            <Select
                                value={filters.kycStatus}
                                onChange={(v) => {
                                    setFilters({ ...filters, kycStatus: v });
                                    actionRef.current?.reload();
                                }}
                                style={{ width: '100%' }}
                                options={[
                                    { value: 'all', label: 'Tất cả' },
                                    { value: 'NONE', label: 'Chưa KYC' },
                                    { value: 'PENDING', label: 'Có thông tin KYC, chờ duyệt' },
                                    { value: 'VERIFIED', label: 'Đã duyệt' },
                                    { value: 'REJECTED', label: 'Từ chối' },
                                ]}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Trạng thái Fineract" style={{ marginBottom: 0 }}>
                            <Select
                                value={filters.fineractStatus}
                                onChange={(v) => {
                                    setFilters({ ...filters, fineractStatus: v });
                                    actionRef.current?.reload();
                                }}
                                style={{ width: '100%' }}
                                options={[
                                    { value: 'all', label: 'Tất cả' },
                                    { value: 'active', label: 'Hoạt động' },
                                    { value: 'inactive', label: 'Không hoạt động' },
                                    { value: 'pending', label: 'Chờ xử lý' },
                                ]}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Khoảng thời gian" style={{ marginBottom: 0 }}>
                            <RangePicker
                                value={filters.dateRange}
                                onChange={(dates) => {
                                    setFilters({ ...filters, dateRange: dates as any });
                                    actionRef.current?.reload();
                                }}
                                style={{ width: '100%' }}
                                format="DD/MM/YYYY"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item label="Tìm kiếm" style={{ marginBottom: 0 }}>
                            <Input.Search
                                placeholder="Tên, email, ID..."
                                value={filters.searchText}
                                onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
                                onSearch={() => actionRef.current?.reload()}
                                allowClear
                            />
                        </Form.Item>
                    </Col>
                </Row>
            </Card>

            {/* Table */}
            <ProTable<CustomerDto>
                {...PRO_TABLE_DEFAULTS}
                actionRef={actionRef}
                rowKey={(r) => r._id || r.fineractClientId || 'unknown'}
                columns={columns}
                request={fetchData}
                onRow={(r) => ({ onClick: () => navigate(`/customers/${r._id || r.fineractClientId}`), style: { cursor: 'pointer' } })}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} khách hàng` }}
                search={false}
                toolBarRender={() => [
                    <Button
                        key="filter"
                        icon={<FilterOutlined />}
                        onClick={() => setShowFilters(!showFilters)}
                        type={showFilters ? 'primary' : 'default'}
                    >
                        Bộ lọc
                    </Button>,
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined />}
                        onClick={() => {
                            fetchGlobalStats();
                            actionRef.current?.reload();
                        }}
                    >
                        Làm mới
                    </Button>,
                ]}
                headerTitle={
                    <Space>
                        <Title level={5} style={{ margin: 0 }}>{getHeaderTitle()}</Title>
                    </Space>
                }
                options={{ reload: false, density: true, fullScreen: true, setting: true }}
                columnsState={{ persistenceKey: `customers-table-${viewMode}`, persistenceType: 'localStorage' }}
                scroll={{ x: 1200 }}
            />
        </div>
    );
}
