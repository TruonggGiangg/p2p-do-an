import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Descriptions, Tag, Button, Space, Typography, Spin, App,
    Row, Col, Avatar, Divider, Form, Input, Modal, theme, Select,
} from 'antd';
import {
    ArrowLeftOutlined, UserOutlined, EditOutlined, LockOutlined,
    MailOutlined, PhoneOutlined, UndoOutlined,
    CalendarOutlined, DatabaseOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { adminApi, StaffDto } from '../api/admin';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function StaffDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { message: messageApi, modal } = App.useApp();
    const { token } = theme.useToken();
    const [staff, setStaff] = useState<StaffDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [editForm] = Form.useForm();

    const fetchStaff = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const data = await adminApi.getStaffById(id);
            setStaff(data);
        } catch (err: any) {
            messageApi.error(err?.response?.data?.message || 'Không tìm thấy nhân viên');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStaff();
    }, [id]);

    const openEdit = () => {
        if (!staff) return;
        editForm.setFieldsValue({
            firstName: staff.profile?.firstName || '',
            lastName: staff.profile?.lastName || '',
            email: staff.email || '',
            status: staff.status || 'active',
        });
        setEditModalOpen(true);
    };

    const handleUpdate = async () => {
        if (!staff) return;
        try {
            const values = await editForm.validateFields();
            setUpdating(true);
            await adminApi.updateStaff(staff._id, values);
            messageApi.success('Cập nhật thành công!');
            setEditModalOpen(false);
            fetchStaff();
        } catch (err: any) {
            if (err?.errorFields) return;
            messageApi.error(err?.response?.data?.message || 'Cập nhật thất bại');
        } finally {
            setUpdating(false);
        }
    };

    const handleDelete = () => {
        if (!staff) return;
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
                    fetchStaff();
                } catch (err: any) {
                    messageApi.error(err?.response?.data?.message || 'Khóa thất bại');
                }
            },
        });
    };

    const handleRestore = async () => {
        if (!staff) return;
        try {
            await adminApi.restoreStaff(staff._id);
            messageApi.success(`Đã khôi phục nhân viên ${staff.displayName || staff.username}`);
            fetchStaff();
        } catch (err: any) {
            messageApi.error(err?.response?.data?.message || 'Khôi phục thất bại');
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!staff) return;
        try {
            await adminApi.updateStaff(staff._id, { status: newStatus });
            const labels: Record<string, string> = { active: 'Hoạt động', inactive: 'Không hoạt động', suspended: 'Tạm khóa' };
            messageApi.success(`Đã chuyển trạng thái thành "${labels[newStatus] || newStatus}"`);
            fetchStaff();
        } catch (err: any) {
            messageApi.error(err?.response?.data?.message || 'Đổi trạng thái thất bại');
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!staff) {
        return (
            <Card>
                <Space direction="vertical" align="center" style={{ width: '100%', padding: 48 }}>
                    <Text type="secondary">Không tìm thấy nhân viên</Text>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/staff')}>
                        Quay lại danh sách
                    </Button>
                </Space>
            </Card>
        );
    }

    const statusMap: Record<string, { color: string; text: string }> = {
        'active': { color: 'success', text: 'Hoạt động' },
        'inactive': { color: 'default', text: 'Không hoạt động' },
        'suspended': { color: 'error', text: 'Tạm khóa' },
    };
    const statusInfo = statusMap[staff.status] || { color: 'default', text: staff.status };

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/staff')}
                        style={{ borderRadius: 0 }}
                    >
                        Danh sách nhân viên
                    </Button>
                    <Title level={4} style={{ margin: 0 }}>Chi tiết nhân viên</Title>
                </Space>
                <Space>
                    {staff.isDeleted ? (
                        <Button
                            type="primary"
                            ghost
                            icon={<UndoOutlined />}
                            onClick={handleRestore}
                            style={{ borderRadius: 0 }}
                        >
                            Khôi phục tài khoản
                        </Button>
                    ) : (
                        <>
                            <Button
                                icon={<EditOutlined />}
                                onClick={openEdit}
                                style={{ borderRadius: 0 }}
                            >
                                Sửa
                            </Button>
                            <Button
                                danger
                                icon={<LockOutlined />}
                                onClick={handleDelete}
                                style={{ borderRadius: 0 }}
                            >
                                Khóa tài khoản
                            </Button>
                        </>
                    )}
                </Space>
            </div>

            <Row gutter={[24, 24]}>
                {/* Profile Card */}
                <Col xs={24} lg={8}>
                    <Card
                        bordered={false}
                        style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <Avatar
                                size={80}
                                icon={<UserOutlined />}
                                style={{
                                    background: staff.isDeleted
                                        ? token.colorTextTertiary
                                        : staff.status === 'active'
                                            ? `linear-gradient(135deg, ${token.colorSuccess} 0%, #047857 100%)`
                                            : `linear-gradient(135deg, ${token.colorPrimary} 0%, #1E3A8A 100%)`,
                                    marginBottom: 16,
                                    opacity: staff.isDeleted ? 0.6 : 1,
                                }}
                            />
                            <Title level={4} style={{ margin: '0 0 4px 0' }}>
                                {staff.displayName || staff.username}
                            </Title>
                            <Text type="secondary">{staff.username}</Text>
                            <div style={{ marginTop: 12 }}>
                                {staff.isDeleted ? (
                                    <Tag color="error" style={{ padding: '4px 16px', fontWeight: 500, borderRadius: 0, border: 'none' }}>Đã khóa</Tag>
                                ) : (
                                    <Tag
                                        color={statusInfo.color}
                                        style={{ padding: '4px 16px', fontWeight: 500, borderRadius: 0, border: 'none' }}
                                    >
                                        {statusInfo.text}
                                    </Tag>
                                )}
                            </div>
                        </div>

                        <Divider />

                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <MailOutlined style={{ color: token.colorTextSecondary }} />
                                <Text>{staff.email || '–'}</Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PhoneOutlined style={{ color: token.colorTextSecondary }} />
                                <Text>{staff.phoneNumber || '–'}</Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CalendarOutlined style={{ color: token.colorTextSecondary }} />
                                <Text>
                                    Ngày tạo: {staff.createdAt ? dayjs(staff.createdAt).format('DD/MM/YYYY HH:mm') : '–'}
                                </Text>
                            </div>
                        </Space>
                    </Card>
                </Col>

                {/* Detail Info */}
                <Col xs={24} lg={16}>
                    <Card
                        bordered={false}
                        title={
                            <Space>
                                <DatabaseOutlined />
                                <span>Thông tin hệ thống</span>
                            </Space>
                        }
                        style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                        <Descriptions
                            bordered
                            column={{ xs: 1, sm: 2 }}
                            size="middle"
                            labelStyle={{ fontWeight: 500, width: 180 }}
                        >
                            <Descriptions.Item label="MongoDB ID">
                                <Text copyable={{ text: staff._id }} style={{ fontSize: 12 }}>
                                    {staff._id}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Keycloak ID">
                                <Text copyable={staff.keycloakId ? { text: staff.keycloakId } : false} style={{ fontSize: 12 }}>
                                    {staff.keycloakId || '–'}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Fineract Staff ID">
                                {staff.fineractStaffId
                                    ? <Tag color="blue">#{staff.fineractStaffId}</Tag>
                                    : <Text type="secondary">–</Text>
                                }
                            </Descriptions.Item>
                            <Descriptions.Item label="Trạng thái">
                                {staff.isDeleted ? (
                                    <Tag color="error" style={{ borderRadius: 0, border: 'none' }}>Đã khóa</Tag>
                                ) : (
                                    <Select
                                        value={staff.status}
                                        size="small"
                                        style={{ minWidth: 150 }}
                                        onChange={handleStatusChange}
                                        options={[
                                            { value: 'active', label: 'Hoạt động' },
                                            { value: 'inactive', label: 'Không hoạt động' },
                                            { value: 'suspended', label: 'Tạm khóa' },
                                        ]}
                                    />
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Họ">
                                {staff.profile?.firstName || '–'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Tên">
                                {staff.profile?.lastName || '–'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Email">
                                {staff.email || '–'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Số điện thoại">
                                {staff.phoneNumber || '–'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Ngày tạo" span={2}>
                                {staff.createdAt ? dayjs(staff.createdAt).format('DD/MM/YYYY HH:mm:ss') : '–'}
                            </Descriptions.Item>
                            {staff.updatedAt && (
                                <Descriptions.Item label="Cập nhật lần cuối" span={2}>
                                    {dayjs(staff.updatedAt).format('DD/MM/YYYY HH:mm:ss')}
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </Card>

                    {/* Metadata Card */}
                    {staff.metadata && Object.keys(staff.metadata).length > 0 && (
                        <Card
                            bordered={false}
                            title={
                                <Space>
                                    <SafetyCertificateOutlined />
                                    <span>Thông tin bổ sung</span>
                                </Space>
                            }
                            style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 24 }}
                        >
                            <Descriptions
                                bordered
                                column={{ xs: 1, sm: 2 }}
                                size="middle"
                                labelStyle={{ fontWeight: 500, width: 180 }}
                            >
                                {staff.metadata.userType && (
                                    <Descriptions.Item label="Loại tài khoản">
                                        <Tag color="blue" style={{ borderRadius: 0, border: 'none' }}>
                                            {staff.metadata.userType === 'staff' ? 'Nhân viên' : staff.metadata.userType === 'admin' ? 'Quản trị viên' : staff.metadata.userType}
                                        </Tag>
                                    </Descriptions.Item>
                                )}
                                {staff.metadata.fineractClientId && (
                                    <Descriptions.Item label="Fineract Client ID">
                                        <Text copyable={{ text: String(staff.metadata.fineractClientId) }} style={{ fontSize: 12 }}>
                                            #{staff.metadata.fineractClientId}
                                        </Text>
                                    </Descriptions.Item>
                                )}
                                {staff.metadata.txPublicKey && (
                                    <Descriptions.Item label="Public Key" span={2}>
                                        <Text copyable={{ text: staff.metadata.txPublicKey }} style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                            {staff.metadata.txPublicKey.length > 60
                                                ? `${staff.metadata.txPublicKey.slice(0, 30)}...${staff.metadata.txPublicKey.slice(-30)}`
                                                : staff.metadata.txPublicKey}
                                        </Text>
                                    </Descriptions.Item>
                                )}
                                {Object.entries(staff.metadata)
                                    .filter(([key]) => !['userType', 'fineractClientId', 'txPublicKey'].includes(key))
                                    .map(([key, value]) => (
                                        <Descriptions.Item key={key} label={key}>
                                            <Text style={{ fontSize: 12 }}>
                                                {typeof value === 'object'
                                                    ? Object.entries(value as Record<string, unknown>)
                                                        .map(([k, v]) => `${k}: ${v}`).join(', ')
                                                    : String(value ?? '–')}
                                            </Text>
                                        </Descriptions.Item>
                                    ))}
                            </Descriptions>
                        </Card>
                    )}
                </Col>
            </Row>

            {/* Edit Modal */}
            <Modal
                title={
                    <Space>
                        <EditOutlined />
                        <span>Cập nhật nhân viên</span>
                    </Space>
                }
                open={editModalOpen}
                onOk={handleUpdate}
                onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
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
                    {staff && (
                        <div style={{ background: token.colorBgLayout, padding: '12px 16px', borderRadius: 4, marginBottom: 16 }}>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                <PhoneOutlined /> Số điện thoại / Tên đăng nhập: <Text strong>{staff.phoneNumber || staff.username}</Text>
                            </Text>
                        </div>
                    )}
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
                    >
                        <Input prefix={<MailOutlined />} placeholder="email@example.com" />
                    </Form.Item>
                    <Form.Item name="status" label="Trạng thái">
                        <Select
                            options={[
                                { value: 'active', label: 'Hoạt động' },
                                { value: 'inactive', label: 'Không hoạt động' },
                                { value: 'suspended', label: 'Tạm khóa' },
                            ]}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
