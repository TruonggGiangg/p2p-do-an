import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, Space, Avatar, Typography, Tooltip, Badge, theme } from 'antd';
import { EyeOutlined, UserOutlined, PhoneOutlined } from '@ant-design/icons';
import { adminApi, CustomerDto } from '../api/admin';
import { FineractStatusBadge } from '../utils/fineractStatus';

const { Text } = Typography;

export default function CustomersPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const actionRef = useRef<ActionType>();

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
            valueType: 'date',
            search: false,
            render: v => v ? new Date(v as string).toLocaleDateString('vi-VN') : '–',
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

    return (
        <ProTable<CustomerDto>
            actionRef={actionRef}
            rowKey={(r) => r._id || r.fineractClientId || 'unknown'}
            columns={columns}
            request={async (params) => {
                const page = params.current ?? 1;
                const limit = params.pageSize ?? 20;
                const keyword = params.keyword as string | undefined;
                const res = await adminApi.getCustomers(page, limit, keyword);
                return { data: res.users, success: true, total: res.total };
            }}
            onRow={(r) => ({ onClick: () => navigate(`/customers/${r._id || r.fineractClientId}`), style: { cursor: 'pointer' } })}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} khách hàng (Head Office)` }}
            search={{ labelWidth: 'auto', defaultCollapsed: false }}
            toolBarRender={() => []}
            headerTitle="Khách hàng – Head Office"
            options={{ reload: true, density: true, fullScreen: true, setting: true }}
            columnsState={{ persistenceKey: 'customers-table', persistenceType: 'localStorage' }}
        />
    );
}
