import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Space, Avatar, Typography, Tooltip, Badge, theme, Tabs, Tag } from 'antd';
import { EyeOutlined, UserOutlined, PhoneOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { adminApi, CustomerDto } from '../api/admin';
import { FineractStatusBadge } from '../utils/fineractStatus';

const { Text } = Typography;

type ViewMode = 'all' | 'pending' | 'active';

export default function CustomersPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const actionRef = useRef<ActionType>();
    const [viewMode, setViewMode] = useState<ViewMode>('all');

    const columns: ProColumns<CustomerDto>[] = [
        {
            title: 'Tìm kiếm',
            dataIndex: 'keyword',
            key: 'keyword',
            hideInTable: true,
            search: { transform: (v) => v?.trim() || undefined },
            fieldProps: { placeholder: 'Tên, username, email...' },
        },
        {
            title: 'Khách hàng',
            dataIndex: 'displayName',
            key: 'name',
            search: false,
            render: (_, r) => (
                <Space>
                    <Avatar
                        icon={<UserOutlined />}
                        size="small"
                        style={{
                            background: token.colorPrimaryBg,
                            color: token.colorPrimary
                        }}
                    />
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 13 }}>{r.displayName || r.username}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            <PhoneOutlined style={{ marginRight: 4 }} />{r.username}
                        </Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            search: false,
            ellipsis: true,
            render: v => v || <Text type="secondary">–</Text>,
        },
        {
            title: 'Văn phòng',
            dataIndex: 'officeName',
            key: 'officeName',
            render: v => <Badge color="gold" text={v || 'Head Office'} />,
            search: false,
        },
        {
            title: 'Ngày kích hoạt',
            dataIndex: 'activationDate',
            key: 'activationDate',
            search: false,
            render: (v: string | null) => {
                if (!v) return '–';
                const d = new Date(v);
                return !isNaN(d.getTime()) ? d.toLocaleDateString('vi-VN') : '–';
            },
        },
        {
            title: 'Trạng thái KYC',
            dataIndex: 'kycStatus',
            key: 'kycStatus',
            align: 'center',
            search: false,
            render: (_, r) => {
                const v = r.kycStatus || 'NONE';
                const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
                    'NONE': { color: 'default', icon: null, text: 'Chưa KYC' },
                    'PENDING': { color: 'warning', icon: <ClockCircleOutlined />, text: 'Chờ duyệt' },
                    'VERIFIED': { color: 'success', icon: <CheckCircleOutlined />, text: 'Đã duyệt' },
                    'REJECTED': { color: 'error', icon: null, text: 'Từ chối' },
                };
                const s = statusMap[v] || statusMap['NONE'];
                return <Tag color={s.color} icon={s.icon}>{s.text}</Tag>;
            },
        },
        {
            title: 'Trạng thái Fineract',
            dataIndex: 'fineractStatus',
            key: 'fineractStatus',
            align: 'center',
            search: false,
            render: (_, r) => <FineractStatusBadge status={r.fineractStatus} />,
        },
        {
            title: '',
            key: 'actions',
            align: 'right',
            search: false,
            render: (_, r) => (
                <Tooltip title="Xem chi tiết & khoản vay">
                    <Button
                        type="primary"
                        size="small"
                        ghost
                        icon={<EyeOutlined />}
                        onClick={(e) => { e.stopPropagation(); navigate(`/customers/${r._id || r.fineractClientId}`); }}
                    >
                        Chi tiết
                    </Button>
                </Tooltip>
            ),
        },
    ];

    // Filter columns based on view mode
    const getFilteredColumns = (): ProColumns<CustomerDto>[] => {
        if (viewMode === 'pending') {
            // For pending view, show KYC completed date and highlight hasKycData
            return columns.map(col => {
                if (col.key === 'activationDate') {
                    return {
                        ...col,
                        title: 'Ngày đăng ký',
                        dataIndex: 'createdAt',
                    };
                }
                return col;
            });
        }
        return columns;
    };

    const handleTabChange = (key: string) => {
        setViewMode(key as ViewMode);
        actionRef.current?.reload();
    };

    const fetchData = async (params: any) => {
        const page = params.current ?? 1;
        const limit = params.pageSize ?? 20;
        const keyword = params.keyword as string | undefined;

        let res;
        if (viewMode === 'pending') {
            res = await adminApi.getPendingApprovalCustomers(page, limit, keyword);
        } else {
            res = await adminApi.getCustomers(page, limit, keyword);
            // Filter active/inactive for 'all' and 'active' views
            if (viewMode === 'active') {
                res.users = res.users.filter(u => u.status === 'active');
                res.total = res.users.length;
            }
        }

        return { data: res.users, success: true, total: res.total };
    };

    const getHeaderTitle = () => {
        switch (viewMode) {
            case 'pending':
                return 'Khách hàng chờ phê duyệt';
            case 'active':
                return 'Khách hàng đã kích hoạt';
            default:
                return 'Tất cả khách hàng';
        }
    };

    return (
        <>
            <Tabs
                activeKey={viewMode}
                onChange={handleTabChange}
                style={{ marginBottom: 16, padding: '0 24px', background: '#fff' }}
                items={[
                    {
                        key: 'all',
                        label: 'Tất cả',
                    },
                    {
                        key: 'pending',
                        label: (
                            <span>
                                Chờ phê duyệt
                                <Badge count="inactive" style={{ marginLeft: 8, backgroundColor: '#faad14' }} />
                            </span>
                        ),
                    },
                    {
                        key: 'active',
                        label: 'Đã kích hoạt',
                    },
                ]}
            />
            <ProTable<CustomerDto>
                actionRef={actionRef}
                rowKey={(r) => r._id || r.fineractClientId || 'unknown'}
                columns={getFilteredColumns()}
                request={fetchData}
                onRow={(r) => ({ onClick: () => navigate(`/customers/${r._id || r.fineractClientId}`), style: { cursor: 'pointer' } })}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} khách hàng` }}
                search={{ labelWidth: 'auto', defaultCollapsed: false }}
                toolBarRender={() => []}
                headerTitle={getHeaderTitle()}
                options={{ reload: true, density: true, fullScreen: true, setting: true }}
                columnsState={{ persistenceKey: `customers-table-${viewMode}`, persistenceType: 'localStorage' }}
            />
        </>
    );
}
