import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Descriptions, Tag, Button, Space, Typography, Spin, App,
    Row, Col, Avatar, Divider, Form, Input, Modal, theme, Select,
} from 'antd';
import {
    ArrowLeftOutlined, UserOutlined, EditOutlined, DeleteOutlined,
    MailOutlined, PhoneOutlined,
    CalendarOutlined, DatabaseOutlined,
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
            phoneNumber: staff.phoneNumber || '',
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
            title: 'Xác nhận xóa nhân viên',
            content: `Bạn có chắc muốn xóa nhân viên "${staff.displayName || staff.username}"?`,
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await adminApi.deleteStaff(staff._id);
                    messageApi.success('Đã xóa nhân viên');
                    navigate('/staff');
                } catch (err: any) {
                    messageApi.error(err?.response?.data?.message || 'Xóa thất bại');
                }
            },
        });
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
                    <Button
                        icon={<EditOutlined />}
                        onClick={openEdit}
                        style={{ borderRadius: 0 }}
                    >
                        Sửa
                    </Button>
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleDelete}
                        style={{ borderRadius: 0 }}
                    >
                        Xóa
                    </Button>
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
                                    background: staff.status === 'active'
                                        ? `linear-gradient(135deg, ${token.colorSuccess} 0%, #047857 100%)`
                                        : `linear-gradient(135deg, ${token.colorPrimary} 0%, #1E3A8A 100%)`,
                                    marginBottom: 16,
                                }}
                            />
                            <Title level={4} style={{ margin: '0 0 4px 0' }}>
                                {staff.displayName || staff.username}
                            </Title>
                            <Text type="secondary">{staff.username}</Text>
                            <div style={{ marginTop: 12 }}>
                                <Tag
                                    color={statusInfo.color}
                                    style={{ padding: '4px 16px', fontWeight: 500, borderRadius: 0, border: 'none' }}
                                >
                                    {statusInfo.text}
                                </Tag>
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
                                <Tag color={statusInfo.color} style={{ borderRadius: 0, border: 'none' }}>
                                    {statusInfo.text}
                                </Tag>
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
                            title="Metadata"
                            style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: 24 }}
                        >
                            <Descriptions
                                bordered
                                column={1}
                                size="small"
                                labelStyle={{ fontWeight: 500, width: 180 }}
                            >
                                {Object.entries(staff.metadata).map(([key, value]) => (
                                    <Descriptions.Item key={key} label={key}>
                                        <Text style={{ fontSize: 12 }}>
                                            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '–')}
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
