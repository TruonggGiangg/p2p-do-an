import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
    Button, Space, Avatar, Typography, Tooltip, Badge, theme, Tabs, Tag,
    Card, Row, Col, Modal, Form, Input, App, Select, Popconfirm, Drawer, Table,
} from 'antd';
import {
    EyeOutlined, UserOutlined, PhoneOutlined,
    ReloadOutlined, TeamOutlined,
    PlusOutlined, EditOutlined,
    IdcardOutlined, MailOutlined, SafetyCertificateOutlined,
    CheckCircleOutlined, StopOutlined, UndoOutlined, LockOutlined,
    HistoryOutlined,
} from '@ant-design/icons';
import { adminApi, StaffDto, ActivityLogDto } from '../api/admin';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

type ViewMode = 'all' | 'active' | 'inactive' | 'deleted';

export default function StaffPage() {
    const { token } = theme.useToken();
    const { message: messageApi, modal } = App.useApp();
    const navigate = useNavigate();
    const actionRef = useRef<ActionType>();
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<StaffDto | null>(null);
    const [creating, setCreating] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        inactive: 0,
        deleted: 0,
    });

    // -- Activity Log Drawer state
    const [logDrawerOpen, setLogDrawerOpen] = useState(false);
    const [logDrawerStaff, setLogDrawerStaff] = useState<StaffDto | null>(null);
    const [logs, setLogs] = useState<ActivityLogDto[]>([]);
    const [logTotal, setLogTotal] = useState(0);
    const [logPage, setLogPage] = useState(1);
    const [logLoading, setLogLoading] = useState(false);
    const LOG_PAGE_SIZE = 15;

    const fetchLogs = async (page = 1, staff?: StaffDto | null) => {
        const target = staff !== undefined ? staff : logDrawerStaff;
        setLogLoading(true);
        try {
            const res = target
                ? await adminApi.getActivityLogsByUser(target._id, page, LOG_PAGE_SIZE)
                : await adminApi.getActivityLogs(page, LOG_PAGE_SIZE);
            setLogs(res.logs);
            setLogTotal(res.total);
            setLogPage(page);
        } catch (err) {
            console.error('Failed to fetch activity logs:', err);
        } finally {
            setLogLoading(false);
        }
    };

    const openLogDrawer = (staff: StaffDto | null = null) => {
        setLogDrawerStaff(staff);
        setLogDrawerOpen(true);
        fetchLogs(1, staff);
    };

    const fetchGlobalStats = async () => {
        try {
            const res = await adminApi.getStaffList(1, 1000);
            const active = res.staff.filter(s => s.status === 'active').length;
            setStats({
                total: res.total,
                active,
                inactive: res.total - active,
                deleted: res.deletedCount ?? 0,
            });
        } catch (error) {
            console.error('Failed to fetch staff stats:', error);
        }
    };

    useEffect(() => {
        fetchGlobalStats();
    }, []);

    // -- Create Staff

    const handleCreate = async () => {
        try {
            const values = await createForm.validateFields();
            setCreating(true);
            await adminApi.createStaff({ ...values, userType: 'staff' });
            messageApi.success('Tạo nhân viên thành công!');
            setCreateModalOpen(false);
            createForm.resetFields();
            fetchGlobalStats();
            actionRef.current?.reload();
        } catch (err: any) {
            if (err?.errorFields) return;
            messageApi.error(err?.response?.data?.message || err?.message || 'Tạo nhân viên thất bại');
        } finally {
            setCreating(false);
        }
    };

    // -- Update Staff

    const openEdit = (staff: StaffDto) => {
        setEditingStaff(staff);
        editForm.setFieldsValue({
            firstName: staff.profile?.firstName || '',
            lastName: staff.profile?.lastName || '',
            email: staff.email || '',
            phoneNumber: staff.phoneNumber || '',
            status: staff.status || 'active',
        });
        setEditModalOpen(true);
    };

    const handleUpdate = async () => {
        if (!editingStaff) return;
        try {
            const values = await editForm.validateFields();
            setUpdating(true);
            await adminApi.updateStaff(editingStaff._id, values);
            messageApi.success('Cập nhật nhân viên thành công!');
            setEditModalOpen(false);
            setEditingStaff(null);
            editForm.resetFields();
            fetchGlobalStats();
            actionRef.current?.reload();
        } catch (err: any) {
            if (err?.errorFields) return;
            messageApi.error(err?.response?.data?.message || err?.message || 'Cập nhật thất bại');
        } finally {
            setUpdating(false);
        }
    };

    // -- Delete (Block) Staff

    const handleDelete = (staff: StaffDto) => {
        modal.confirm({
            title: 'Xác nhận khóa tài khoản',
            content: `Bạn có chắc muốn khóa tài khoản "${staff.displayName || staff.username}"? Tài khoản sẽ bị vô hiệu hóa và có thể khôi phục sau.`,
            okText: 'Khóa tài khoản',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await adminApi.deleteStaff(staff._id);
                    messageApi.success('Đã khóa tài khoản nhân viên');
                    fetchGlobalStats();
                    actionRef.current?.reload();
                } catch (err: any) {
                    messageApi.error(err?.response?.data?.message || 'Khóa thất bại');
                }
            },
        });
    };

    // -- Restore Staff

    const handleRestore = async (staff: StaffDto) => {
        try {
            await adminApi.restoreStaff(staff._id);
            messageApi.success(`Đã khôi phục nhân viên ${staff.displayName || staff.username}`);
            fetchGlobalStats();
            actionRef.current?.reload();
        } catch (err: any) {
            messageApi.error(err?.response?.data?.message || 'Khôi phục thất bại');
        }
    };

    // -- Quick Status Change

    const handleStatusChange = async (staff: StaffDto, newStatus: string) => {
        try {
            await adminApi.updateStaff(staff._id, { status: newStatus });
            const labels: Record<string, string> = { active: 'Hoạt động', inactive: 'Không hoạt động', suspended: 'Tạm khóa' };
            messageApi.success(`Đã chuyển trạng thái thành "${labels[newStatus] || newStatus}"`);
            fetchGlobalStats();
            actionRef.current?.reload();
        } catch (err: any) {
            messageApi.error(err?.response?.data?.message || 'Đổi trạng thái thất bại');
        }
    };

    // -- Columns

    const columns: ProColumns<StaffDto>[] = [
        {
            title: 'Nhân viên',
            dataIndex: 'displayName',
            key: 'name',
            fixed: 'left',
            width: 260,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            render: (_, r) => (
                <Space>
                    <Avatar
                        icon={<UserOutlined />}
                        size="large"
                        style={{
                            background: r.isDeleted
                                ? token.colorTextTertiary
                                : r.status === 'active' ? token.colorSuccess : token.colorPrimaryBg,
                            color: r.isDeleted
                                ? '#fff'
                                : r.status === 'active' ? '#fff' : token.colorPrimary,
                            border: r.status === 'active' && !r.isDeleted ? `2px solid ${token.colorSuccess}` : 'none',
                            opacity: r.isDeleted ? 0.6 : 1,
                        }}
                    />
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 13, opacity: r.isDeleted ? 0.6 : 1 }}>
                            {r.displayName || r.username}
                        </Text>
                        <Space size={4}>
                            <IdcardOutlined style={{ fontSize: 11, color: token.colorTextSecondary }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Text>
                        </Space>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            width: 220,
            ellipsis: true,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            render: v => v || <Text type="secondary">-</Text>,
        },
        {
            title: 'Số điện thoại',
            dataIndex: 'phoneNumber',
            key: 'phoneNumber',
            width: 160,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            render: v => v || <Text type="secondary">-</Text>,
        },
        {
            title: 'Ngày tạo',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 140,
            align: 'center',
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            sorter: (a, b) => {
                const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return da - db;
            },
            render: (_, record) => {
                const v = record.createdAt;
                if (!v) return <Text type="secondary">-</Text>;
                const d = new Date(v);
                return !isNaN(d.getTime()) ? (
                    <Text>{dayjs(d).format('DD/MM/YYYY')}</Text>
                ) : '-';
            },
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            align: 'center',
            width: 180,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            filters: viewMode !== 'deleted' ? [
                { text: 'Hoạt động', value: 'active' },
                { text: 'Không hoạt động', value: 'inactive' },
                { text: 'Tạm khóa', value: 'suspended' },
            ] : undefined,
            onFilter: (value, record) => record.status === value,
            render: (_, r) => {
                if (r.isDeleted) {
                    return <Tag color="error" style={{ padding: '4px 12px', fontWeight: 500, border: 'none' }}>Đã khóa</Tag>;
                }
                const statusMap: Record<string, { color: string; text: string }> = {
                    'active': { color: 'success', text: 'Hoạt động' },
                    'inactive': { color: 'default', text: 'Không hoạt động' },
                    'suspended': { color: 'error', text: 'Tạm khóa' },
                };
                const s = statusMap[r.status] || { color: 'default', text: r.status };
                if (viewMode === 'deleted') {
                    return <Tag color={s.color} style={{ padding: '4px 12px', fontWeight: 500, border: 'none' }}>{s.text}</Tag>;
                }
                return (
                    <Select
                        value={r.status}
                        size="small"
                        style={{ minWidth: 140 }}
                        onChange={(val) => handleStatusChange(r, val)}
                        onClick={(e) => e.stopPropagation()}
                        options={[
                            { value: 'active', label: 'Hoạt động' },
                            { value: 'inactive', label: 'Không hoạt động' },
                            { value: 'suspended', label: 'Tạm khóa' },
                        ]}
                    />
                );
            },
        },
        {
            title: 'Thao tác',
            key: 'actions',
            align: 'center',
            fixed: 'right',
            width: 330,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16, whiteSpace: 'nowrap' } }),
            render: (_, r) => {
                if (r.isDeleted) {
                    return (
                        <Space size={8}>
                            <Tooltip title="Xem chi tiết">
                                <Button type="primary" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/staff/${r._id}`); }} style={{ borderRadius: 0, fontSize: 12 }}>Chi tiết</Button>
                            </Tooltip>
                            <Tooltip title="Lịch sử hoạt động">
                                <Button icon={<HistoryOutlined />} onClick={(e) => { e.stopPropagation(); openLogDrawer(r); }} style={{ borderRadius: 0, fontSize: 12 }} />
                            </Tooltip>
                            <Popconfirm title="Khôi phục nhân viên?" description="Tài khoản sẽ được kích hoạt lại" okText="Khôi phục" cancelText="Hủy" onConfirm={() => handleRestore(r)} onPopupClick={(e) => e.stopPropagation()}>
                                <Button type="primary" ghost icon={<UndoOutlined />} onClick={(e) => e.stopPropagation()} style={{ borderRadius: 0, fontSize: 12 }}>Khôi phục</Button>
                            </Popconfirm>
                        </Space>
                    );
                }
                return (
                    <Space size={8}>
                        <Tooltip title="Xem chi tiết">
                            <Button type="primary" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/staff/${r._id}`); }} style={{ borderRadius: 0, fontSize: 12 }}>Chi tiết</Button>
                        </Tooltip>
                        <Tooltip title="Sửa">
                            <Button icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(r); }} style={{ borderRadius: 0, fontSize: 12 }} />
                        </Tooltip>
                        <Tooltip title="Lịch sử hoạt động">
                            <Button icon={<HistoryOutlined />} onClick={(e) => { e.stopPropagation(); openLogDrawer(r); }} style={{ borderRadius: 0, fontSize: 12 }} />
                        </Tooltip>
                        <Tooltip title="Khóa tài khoản">
                            <Button danger icon={<LockOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(r); }} style={{ borderRadius: 0, fontSize: 12 }} />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    // -- Tabs

    const handleTabChange = (key: string) => {
        setViewMode(key as ViewMode);
        actionRef.current?.reload();
    };

    const fetchData = async (params: any) => {
        const keyword = params.keyword as string | undefined;
        if (viewMode === 'deleted') {
            const res = await adminApi.getDeletedStaffList(1, 1000);
            const page = params.current ?? 1;
            const size = params.pageSize ?? 20;
            const start = (page - 1) * size;
            const paged = res.staff.slice(start, start + size);
            return { data: paged, success: true, total: res.total };
        }
        const res = await adminApi.getStaffList(1, 1000, keyword);
        let filtered = res.staff;
        if (viewMode === 'active') filtered = filtered.filter(s => s.status === 'active');
        else if (viewMode === 'inactive') filtered = filtered.filter(s => s.status !== 'active');
        const page = params.current ?? 1;
        const size = params.pageSize ?? 20;
        const start = (page - 1) * size;
        const paged = filtered.slice(start, start + size);
        return { data: paged, success: true, total: filtered.length };
    };

    const getHeaderTitle = () => {
        switch (viewMode) {
            case 'active': return 'Nhân viên đang hoạt động';
            case 'inactive': return 'Nhân viên không hoạt động';
            case 'deleted': return 'Nhân viên đã khóa';
            default: return 'Tất cả nhân viên';
        }
    };

    const tabItems = [
        { key: 'all', label: (<Space><TeamOutlined />Tất cả<Badge count={stats.total} style={{ backgroundColor: token.colorPrimary }} /></Space>) },
        { key: 'active', label: (<Space><CheckCircleOutlined />Đang hoạt động<Badge count={stats.active} style={{ backgroundColor: token.colorSuccess }} /></Space>) },
        { key: 'inactive', label: (<Space><StopOutlined />Không hoạt động<Badge count={stats.inactive} style={{ backgroundColor: token.colorTextTertiary }} /></Space>) },
        { key: 'deleted', label: (<Space><LockOutlined />Đã khóa<Badge count={stats.deleted} style={{ backgroundColor: token.colorError }} /></Space>) },
    ];

    return (
        <div>
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} style={{ borderRadius: 0, background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)', boxShadow: '0 4px 12px rgba(30, 64, 175, 0.25)', height: '100%' }} bodyStyle={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>Tổng nhân viên</Text>
                                <Title level={2} style={{ margin: 0, color: '#FFFFFF', fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>{stats.total}</Title>
                            </div>
                            <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <TeamOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} style={{ borderRadius: 0, background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)', height: '100%' }} bodyStyle={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>Đang hoạt động</Text>
                                <Title level={2} style={{ margin: 0, color: '#FFFFFF', fontSize: 36, fontWeight: 700 }}>{stats.active}</Title>
                            </div>
                            <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircleOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} style={{ borderRadius: 0, background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)', height: '100%' }} bodyStyle={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>Không hoạt động</Text>
                                <Title level={2} style={{ margin: 0, color: '#FFFFFF', fontSize: 36, fontWeight: 700 }}>{stats.inactive}</Title>
                            </div>
                            <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <StopOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} style={{ borderRadius: 0, background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)', height: '100%' }} bodyStyle={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 8 }}>Đã khóa</Text>
                                <Title level={2} style={{ margin: 0, color: '#FFFFFF', fontSize: 36, fontWeight: 700 }}>{stats.deleted}</Title>
                            </div>
                            <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <LockOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card bordered={false} style={{ borderRadius: 0, marginBottom: 24, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)', overflow: 'visible' }} bodyStyle={{ padding: 0, overflow: 'visible' }}>
                <Tabs activeKey={viewMode} onChange={handleTabChange} items={tabItems} size="large" tabBarStyle={{ marginBottom: 0, padding: '16px 24px 12px 24px', borderBottom: `2px solid ${token.colorBorderSecondary}`, minHeight: 52 }} tabBarGutter={16} />
            </Card>

            <ProTable<StaffDto>
                {...PRO_TABLE_DEFAULTS}
                actionRef={actionRef}
                rowKey={(r) => r._id || 'unknown'}
                columns={columns}

                request={fetchData}
                onRow={(r) => ({ onClick: () => navigate(`/staff/${r._id}`), style: { cursor: 'pointer' } })}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} nhân viên` }}
                search={false}
                toolBarRender={() => [
                    viewMode !== 'deleted' && (
                        <Button key="create" type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)} style={{ fontWeight: 500 }}>Thêm nhân viên</Button>
                    ),
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={() => { fetchGlobalStats(); actionRef.current?.reload(); }}>Làm mới</Button>,
                ].filter(Boolean)}
                headerTitle={<Space><Title level={5} style={{ margin: 0 }}>{getHeaderTitle()}</Title></Space>}
                options={{ reload: false, density: true, fullScreen: true, setting: true }}
                columnsState={{ persistenceKey: `staff-table-${viewMode}`, persistenceType: 'localStorage' }}
                scroll={{ x: 1200 }}
            />

            <Modal title={<Space><PlusOutlined /><span>Thêm nhân viên mới</span></Space>} open={createModalOpen} onOk={handleCreate} onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }} confirmLoading={creating} okText="Tạo nhân viên" cancelText="Hủy" width={560} destroyOnClose>
                <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="firstName" label="Họ và tên đệm" rules={[{ required: true, message: 'Vui lòng nhập họ' }]}>
                                <Input prefix={<UserOutlined />} placeholder="Nguyễn" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="lastName" label="Ten" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
                                <Input placeholder="Van A" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="phoneNumber" label="Số điện thoại (dùng làm tên đăng nhập)" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }, { min: 10, message: 'Tối thiểu 10 chữ số' }]} extra="Số điện thoại sẽ được dùng làm tên đăng nhập cho nhân viên">
                        <Input prefix={<PhoneOutlined />} placeholder="0901234567" />
                    </Form.Item>
                    <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                        <Input prefix={<MailOutlined />} placeholder="email@example.com" />
                    </Form.Item>
                    <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}>
                        <Input.Password prefix={<SafetyCertificateOutlined />} placeholder="Mật khẩu" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal title={<Space><EditOutlined /><span>Cập nhật nhân viên</span></Space>} open={editModalOpen} onOk={handleUpdate} onCancel={() => { setEditModalOpen(false); setEditingStaff(null); editForm.resetFields(); }} confirmLoading={updating} okText="Cập nhật" cancelText="Hủy" width={560} destroyOnClose>
                <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
                    {editingStaff && (
                        <div style={{ background: token.colorBgLayout, padding: '12px 16px', borderRadius: 4, marginBottom: 16 }}>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                <PhoneOutlined /> Số điện thoại / Tên đăng nhập: <Text strong>{editingStaff.phoneNumber || editingStaff.username}</Text>
                            </Text>
                        </div>
                    )}
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="firstName" label="Họ và tên đệm">
                                <Input prefix={<UserOutlined />} placeholder="Họ" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="lastName" label="Ten">
                                <Input placeholder="Ten" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                        <Input prefix={<MailOutlined />} placeholder="email@example.com" />
                    </Form.Item>
                    <Form.Item
                        name="phoneNumber"
                        label="Số điện thoại thực tế"
                        extra="Có thể khác với tên đăng nhập — không ảnh hưởng username"
                        rules={[{ min: 10, message: 'Tối thiểu 10 ký tự' }]}
                    >
                        <Input prefix={<PhoneOutlined />} placeholder="0901234567" />
                    </Form.Item>
                    <Form.Item name="status" label="Trạng thái">
                        <Select options={[{ value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Không hoạt động' }, { value: 'suspended', label: 'Tạm khóa' }]} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Activity Log Drawer */}
            <Drawer
                title={
                    <Space>
                        <HistoryOutlined style={{ fontSize: 18 }} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>Lịch sử hoạt động</div>
                            {logDrawerStaff && (
                                <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>
                                    {logDrawerStaff.displayName || logDrawerStaff.username}
                                </div>
                            )}
                        </div>
                    </Space>
                }
                placement="right"
                width={Math.min(1100, window.innerWidth * 0.95)}
                open={logDrawerOpen}
                styles={{ body: { padding: '16px', overflowX: 'auto' } }}
                destroyOnHidden
                onClose={() => { setLogDrawerOpen(false); setLogDrawerStaff(null); }}
            >
                <Table<ActivityLogDto>
                    dataSource={logs}
                    rowKey="_id"
                    loading={logLoading}
                    size="small"
                    pagination={{
                        current: logPage,
                        total: logTotal,
                        pageSize: LOG_PAGE_SIZE,
                        size: 'small',
                        showTotal: (t) => `${t} hoạt động`,
                        onChange: (p) => fetchLogs(p),
                    }}
                    scroll={{ x: 850 }}
                    columns={[
                        {
                            title: 'Thời gian',
                            dataIndex: 'createdAt',
                            key: 'createdAt',
                            width: 150,
                            render: (v: string) => (
                                <Text style={{ fontSize: 12 }}>
                                    {dayjs(v).format('DD/MM/YYYY HH:mm:ss')}
                                </Text>
                            ),
                        },
                        {
                            title: 'Hành động',
                            dataIndex: 'action',
                            key: 'action',
                            width: 200,
                            render: (v: string, r: ActivityLogDto) => (
                                <Space direction="vertical" size={0}>
                                    <Text strong style={{ fontSize: 13 }}>{v}</Text>
                                    {r.targetInfo?.borrowerName && (
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            Người vay: {r.targetInfo.borrowerName} ({r.targetInfo.borrowerUsername})
                                        </Text>
                                    )}
                                    {r.targetInfo?.fineractLoanId && !r.targetInfo?.borrowerName && (
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            Khoản vay #{r.targetInfo.fineractLoanId}
                                        </Text>
                                    )}
                                    {r.targetInfo?.staffName && (
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            Nhân viên: {r.targetInfo.staffName}
                                        </Text>
                                    )}
                                </Space>
                            ),
                        },
                        {
                            title: 'Method',
                            dataIndex: 'method',
                            key: 'method',
                            width: 80,
                            align: 'center',
                            render: (v: string) => {
                                const colorMap: Record<string, string> = {
                                    POST: '#059669', PUT: '#D97706', PATCH: '#D97706', DELETE: '#DC2626',
                                };
                                return <Tag color={colorMap[v] || token.colorPrimary} style={{ borderRadius: 0, fontWeight: 600, fontSize: 11, margin: 0 }}>{v}</Tag>;
                            },
                        },
                        {
                            title: 'Người thực hiện',
                            dataIndex: 'username',
                            key: 'username',
                            width: 160,
                            render: (v: string, r: ActivityLogDto) => (
                                <Space size={4}>
                                    <Text style={{ fontSize: 12 }}>{v}</Text>
                                    <Tag
                                        color={r.userRole === 'admin' ? 'blue' : 'green'}
                                        style={{ borderRadius: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}
                                    >
                                        {r.userRole === 'admin' ? 'Admin' : 'NV'}
                                    </Tag>
                                </Space>
                            ),
                        },
                        {
                            title: 'Đường dẫn',
                            dataIndex: 'path',
                            key: 'path',
                            width: 240,
                            ellipsis: true,
                            render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text>,
                        },
                        {
                            title: 'Thời gian XL',
                            dataIndex: 'duration',
                            key: 'duration',
                            width: 90,
                            align: 'center',
                            render: (v: number) => v != null ? <Text type="secondary" style={{ fontSize: 11 }}>{v}ms</Text> : '-',
                        },
                    ]}
                    expandable={{
                        expandedRowRender: (record: ActivityLogDto) => (
                            <div style={{ padding: '8px 0' }}>
                                {record.requestBody && Object.keys(record.requestBody).length > 0 && (
                                    <div style={{
                                        padding: '8px 12px',
                                        background: token.colorBgLayout,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                        marginBottom: 8,
                                    }}>
                                        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Request Body:</Text>
                                        <pre style={{
                                            margin: 0, fontSize: 11, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                            color: token.colorText, fontFamily: "'Consolas', monospace", maxHeight: 200, overflow: 'auto',
                                        }}>
                                            {JSON.stringify(record.requestBody, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {record.responseMessage && (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        Response: {record.responseMessage}
                                    </Text>
                                )}
                            </div>
                        ),
                        rowExpandable: (record: ActivityLogDto) =>
                            !!(record.requestBody && Object.keys(record.requestBody).length > 0) || !!record.responseMessage,
                    }}
                />
            </Drawer>
        </div>
    );
}
