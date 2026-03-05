import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
    Button, Space, Avatar, Typography, Tooltip, Badge, theme, Tabs, Tag,
    Card, Row, Col, Modal, Form, Input, App,
} from 'antd';
import {
    EyeOutlined, UserOutlined, PhoneOutlined,
    ReloadOutlined, TeamOutlined,
    PlusOutlined, EditOutlined, DeleteOutlined,
    IdcardOutlined, MailOutlined, SafetyCertificateOutlined,
    CheckCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import { adminApi, StaffDto } from '../api/admin';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

type ViewMode = 'all' | 'active' | 'inactive';

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
    });

    const fetchGlobalStats = async () => {
        try {
            const res = await adminApi.getStaffList(1, 1000);
            const active = res.staff.filter(s => s.status === 'active').length;
            setStats({
                total: res.total,
                active,
                inactive: res.total - active,
            });
        } catch (error) {
            console.error('Failed to fetch staff stats:', error);
        }
    };

    useEffect(() => {
        fetchGlobalStats();
    }, []);

    // ── Create Staff ─────────────────────────────────────────────────────────

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
            if (err?.errorFields) return; // form validation error
            messageApi.error(err?.response?.data?.message || err?.message || 'Tạo nhân viên thất bại');
        } finally {
            setCreating(false);
        }
    };

    // ── Update Staff ─────────────────────────────────────────────────────────

    const openEdit = (staff: StaffDto) => {
        setEditingStaff(staff);
        editForm.setFieldsValue({
            firstName: staff.profile?.firstName || '',
            lastName: staff.profile?.lastName || '',
            email: staff.email || '',
            phoneNumber: staff.phoneNumber || '',
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

    // ── Delete Staff ─────────────────────────────────────────────────────────

    const handleDelete = (staff: StaffDto) => {
        modal.confirm({
            title: 'Xác nhận xóa nhân viên',
            content: `Bạn có chắc muốn xóa nhân viên "${staff.displayName || staff.username}"? Hành động này không thể hoàn tác.`,
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await adminApi.deleteStaff(staff._id);
                    messageApi.success('Đã xóa nhân viên');
                    fetchGlobalStats();
                    actionRef.current?.reload();
                } catch (err: any) {
                    messageApi.error(err?.response?.data?.message || 'Xóa thất bại');
                }
            },
        });
    };

    // ── Columns ──────────────────────────────────────────────────────────────

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
                            background: r.status === 'active' ? token.colorSuccess : token.colorPrimaryBg,
                            color: r.status === 'active' ? '#fff' : token.colorPrimary,
                            border: r.status === 'active' ? `2px solid ${token.colorSuccess}` : 'none',
                        }}
                    />
                    <div>
                        <Text strong style={{ display: 'block', fontSize: 13 }}>
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
            render: v => v || <Text type="secondary">–</Text>,
        },
        {
            title: 'Số điện thoại',
            dataIndex: 'phoneNumber',
            key: 'phoneNumber',
            width: 160,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            render: v => v || <Text type="secondary">–</Text>,
        },
        {
            title: 'Fineract Staff ID',
            dataIndex: 'fineractStaffId',
            key: 'fineractStaffId',
            width: 150,
            align: 'center',
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            render: v => v ? <Tag color="blue">#{v}</Tag> : <Text type="secondary">–</Text>,
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
                if (!v) return <Text type="secondary">–</Text>;
                const d = new Date(v);
                return !isNaN(d.getTime()) ? (
                    <Text>{dayjs(d).format('DD/MM/YYYY')}</Text>
                ) : '–';
            },
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            align: 'center',
            width: 150,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16 } }),
            filters: [
                { text: 'Hoạt động', value: 'active' },
                { text: 'Không hoạt động', value: 'inactive' },
                { text: 'Tạm khóa', value: 'suspended' },
            ],
            onFilter: (value, record) => record.status === value,
            render: (_, r) => {
                const statusMap: Record<string, { color: string; text: string }> = {
                    'active': { color: 'success', text: 'Hoạt động' },
                    'inactive': { color: 'default', text: 'Không hoạt động' },
                    'suspended': { color: 'error', text: 'Tạm khóa' },
                };
                const s = statusMap[r.status] || { color: 'default', text: r.status };
                return (
                    <Tag
                        color={s.color}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 0,
                            fontWeight: 500,
                            border: 'none',
                        }}
                    >
                        {s.text}
                    </Tag>
                );
            },
        },
        {
            title: 'Thao tác',
            key: 'actions',
            align: 'center',
            fixed: 'right',
            width: 240,
            onCell: () => ({ style: { paddingLeft: 16, paddingRight: 16, whiteSpace: 'nowrap' } }),
            render: (_, r) => (
                <Space size={8}>
                    <Tooltip title="Xem chi tiết">
                        <Button
                            type="primary"
                            icon={<EyeOutlined />}
                            onClick={(e) => { e.stopPropagation(); navigate(`/staff/${r._id}`); }}
                            style={{ borderRadius: 0, fontSize: 12 }}
                        >
                            Chi tiết
                        </Button>
                    </Tooltip>
                    <Tooltip title="Sửa">
                        <Button
                            icon={<EditOutlined />}
                            onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                            style={{ borderRadius: 0, fontSize: 12 }}
                        />
                    </Tooltip>
                    <Tooltip title="Xóa">
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
                            style={{ borderRadius: 0, fontSize: 12 }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    // ── Tabs ─────────────────────────────────────────────────────────────────

    const handleTabChange = (key: string) => {
        setViewMode(key as ViewMode);
        actionRef.current?.reload();
    };

    const fetchData = async (params: any) => {
        const keyword = params.keyword as string | undefined;
        const res = await adminApi.getStaffList(1, 1000, keyword);

        let filtered = res.staff;
        if (viewMode === 'active') {
            filtered = filtered.filter(s => s.status === 'active');
        } else if (viewMode === 'inactive') {
            filtered = filtered.filter(s => s.status !== 'active');
        }

        const page = params.current ?? 1;
        const size = params.pageSize ?? 20;
        const start = (page - 1) * size;
        const paged = filtered.slice(start, start + size);

        return {
            data: paged,
            success: true,
            total: filtered.length,
        };
    };

    const getHeaderTitle = () => {
        switch (viewMode) {
            case 'active': return 'Nhân viên đang hoạt động';
            case 'inactive': return 'Nhân viên không hoạt động';
            default: return 'Tất cả nhân viên';
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
                    <StopOutlined />
                    Không hoạt động
                    <Badge count={stats.inactive} style={{ backgroundColor: token.colorTextTertiary }} />
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Stats Cards */}
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={12} lg={8}>
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
                                    Tổng nhân viên
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

                <Col xs={24} sm={12} lg={8}>
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
                                <CheckCircleOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={8}>
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
                                    Không hoạt động
                                </Text>
                                <Title level={2} style={{
                                    margin: 0,
                                    color: '#FFFFFF',
                                    fontSize: 36,
                                    fontWeight: 700,
                                }}>
                                    {stats.inactive}
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
                                <StopOutlined style={{ fontSize: 28, color: '#FFFFFF' }} />
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Tabs */}
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

            {/* Table */}
            <ProTable<StaffDto>
                {...PRO_TABLE_DEFAULTS}
                actionRef={actionRef}
                rowKey={(r) => r._id || 'unknown'}
                columns={columns}
                request={fetchData}
                onRow={(r) => ({
                    onClick: () => navigate(`/staff/${r._id}`),
                    style: { cursor: 'pointer' },
                })}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} nhân viên` }}
                search={false}
                toolBarRender={() => [
                    <Button
                        key="create"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setCreateModalOpen(true)}
                        style={{ fontWeight: 500 }}
                    >
                        Thêm nhân viên
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
                columnsState={{ persistenceKey: `staff-table-${viewMode}`, persistenceType: 'localStorage' }}
                scroll={{ x: 1200 }}
            />

            {/* Create Staff Modal */}
            <Modal
                title={
                    <Space>
                        <PlusOutlined />
                        <span>Thêm nhân viên mới</span>
                    </Space>
                }
                open={createModalOpen}
                onOk={handleCreate}
                onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
                confirmLoading={creating}
                okText="Tạo nhân viên"
                cancelText="Hủy"
                width={560}
                destroyOnClose
            >
                <Form
                    form={createForm}
                    layout="vertical"
                    style={{ marginTop: 16 }}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="firstName"
                                label="Họ và tên đệm"
                                rules={[{ required: true, message: 'Vui lòng nhập họ' }]}
                            >
                                <Input prefix={<UserOutlined />} placeholder="Nguyễn" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="lastName"
                                label="Tên"
                                rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
                            >
                                <Input placeholder="Văn A" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item
                        name="phoneNumber"
                        label="Số điện thoại (dùng làm tên đăng nhập)"
                        rules={[
                            { required: true, message: 'Vui lòng nhập số điện thoại' },
                            { min: 10, message: 'Tối thiểu 10 chữ số' },
                        ]}
                        extra="Số điện thoại sẽ được dùng làm tên đăng nhập cho nhân viên"
                    >
                        <Input prefix={<PhoneOutlined />} placeholder="0901234567" />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
                    >
                        <Input prefix={<MailOutlined />} placeholder="email@example.com" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Mật khẩu"
                        rules={[
                            { required: true, message: 'Vui lòng nhập mật khẩu' },
                            { min: 6, message: 'Tối thiểu 6 ký tự' },
                        ]}
                    >
                        <Input.Password prefix={<SafetyCertificateOutlined />} placeholder="Mật khẩu" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Edit Staff Modal */}
            <Modal
                title={
                    <Space>
                        <EditOutlined />
                        <span>Cập nhật nhân viên</span>
                    </Space>
                }
                open={editModalOpen}
                onOk={handleUpdate}
                onCancel={() => { setEditModalOpen(false); setEditingStaff(null); editForm.resetFields(); }}
                confirmLoading={updating}
                okText="Cập nhật"
                cancelText="Hủy"
                width={560}
                destroyOnClose
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    style={{ marginTop: 16 }}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="firstName" label="Họ">
                                <Input prefix={<UserOutlined />} placeholder="Họ" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="lastName" label="Tên">
                                <Input placeholder="Tên" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="email"
                                label="Email"
                                rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
                            >
                                <Input prefix={<MailOutlined />} placeholder="email@example.com" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="phoneNumber" label="Số điện thoại">
                                <Input prefix={<PhoneOutlined />} placeholder="0901234567" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
