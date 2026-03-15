import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Tag, Button, Space, Typography, Spin, App,
    Row, Col, Avatar, Divider, Form, Input, Modal, theme, Select,
} from 'antd';
import {
    ArrowLeftOutlined, UserOutlined, EditOutlined, LockOutlined,
    MailOutlined, PhoneOutlined, UndoOutlined,
    CalendarOutlined, DatabaseOutlined, SafetyCertificateOutlined,
    IdcardOutlined, KeyOutlined, CloudServerOutlined,
    ClockCircleOutlined, SyncOutlined,
} from '@ant-design/icons';
import { adminApi, type StaffDto } from '../api/admin';
import { DetailSkeleton } from '../components/PageSkeleton';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

/* ── Helper Components ── */

function ProfileField({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{label}</Text>
            <div style={{ fontSize: 14 }}>{typeof value === 'string' ? <Text strong>{value}</Text> : value}</div>
        </div>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: '#8c8c8c', marginTop: 2, fontSize: 15 }}>{icon}</span>
            <div style={{ minWidth: 0 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1 }}>{label}</Text>
                <Text style={{ fontSize: 13, wordBreak: 'break-word' }}>{value}</Text>
            </div>
        </div>
    );
}

function IdField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa', padding: '10px 14px', borderRadius: 4 }}>
            <span style={{ color: '#8c8c8c', fontSize: 16 }}>{icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', lineHeight: 1, marginBottom: 2 }}>{label}</Text>
                {value ? (
                    <Text copyable={{ text: value }} style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {value}
                    </Text>
                ) : (
                    <Text type="secondary">–</Text>
                )}
            </div>
        </div>
    );
}

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

    if (loading) return <DetailSkeleton />;

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
                        style={{ borderRadius: 10 }}
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
                            style={{ borderRadius: 10 }}
                        >
                            Khôi phục tài khoản
                        </Button>
                    ) : (
                        <>
                            <Button
                                icon={<EditOutlined />}
                                onClick={openEdit}
                                style={{ borderRadius: 10 }}
                            >
                                Sửa
                            </Button>
                            <Button
                                danger
                                icon={<LockOutlined />}
                                onClick={handleDelete}
                                style={{ borderRadius: 10 }}
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
                        style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <Avatar
                                size={96}
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
                            <Text type="secondary" style={{ fontSize: 13 }}>{staff.username}</Text>
                            <div style={{ marginTop: 12 }}>
                                {staff.isDeleted ? (
                                    <Tag color="error" style={{ padding: '4px 16px', fontWeight: 500, borderRadius: 10, border: 'none' }}>Đã khóa</Tag>
                                ) : (
                                    <Select
                                        value={staff.status}
                                        size="small"
                                        variant="borderless"
                                        onChange={handleStatusChange}
                                        style={{ minWidth: 140 }}
                                        options={[
                                            { value: 'active', label: <Tag color="success" style={{ margin: 0, borderRadius: 10, border: 'none', padding: '2px 14px', fontWeight: 500 }}>Hoạt động</Tag> },
                                            { value: 'inactive', label: <Tag color="default" style={{ margin: 0, borderRadius: 10, border: 'none', padding: '2px 14px', fontWeight: 500 }}>Không hoạt động</Tag> },
                                            { value: 'suspended', label: <Tag color="error" style={{ margin: 0, borderRadius: 10, border: 'none', padding: '2px 14px', fontWeight: 500 }}>Tạm khóa</Tag> },
                                        ]}
                                    />
                                )}
                            </div>
                        </div>

                        <Divider style={{ margin: '16px 0' }} />

                        {/* Contact Info */}
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <InfoRow icon={<MailOutlined />} label="Email" value={staff.email || '–'} />
                            <InfoRow icon={<PhoneOutlined />} label="Số điện thoại" value={staff.phoneNumber || '–'} />
                            <InfoRow icon={<CalendarOutlined />} label="Ngày tạo" value={staff.createdAt ? dayjs(staff.createdAt).format('DD/MM/YYYY HH:mm') : '–'} />
                            {staff.updatedAt && (
                                <InfoRow icon={<ClockCircleOutlined />} label="Cập nhật" value={dayjs(staff.updatedAt).format('DD/MM/YYYY HH:mm')} />
                            )}
                        </Space>

                        {staff.metadata?.userType && (
                            <>
                                <Divider style={{ margin: '16px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text type="secondary" style={{ fontSize: 13 }}>Loại tài khoản</Text>
                                    <Tag color="blue" style={{ borderRadius: 10, border: 'none', fontWeight: 500 }}>
                                        {staff.metadata.userType === 'staff' ? 'Nhân viên' : staff.metadata.userType === 'admin' ? 'Quản trị viên' : staff.metadata.userType}
                                    </Tag>
                                </div>
                            </>
                        )}
                    </Card>
                </Col>

                {/* Right Side - Info Cards */}
                <Col xs={24} lg={16}>
                    {/* Personal Info Card */}
                    <Card
                        bordered={false}
                        title={<Space><UserOutlined /><span>Thông tin cá nhân</span></Space>}
                        style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 24 }}
                        bodyStyle={{ padding: '20px 24px' }}
                    >
                        <Row gutter={[48, 20]}>
                            <Col xs={24} sm={12}>
                                <ProfileField label="Họ và tên đệm" value={staff.profile?.firstName || '–'} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <ProfileField label="Tên" value={staff.profile?.lastName || '–'} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <ProfileField label="Email" value={staff.email || '–'} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <ProfileField label="Số điện thoại" value={staff.phoneNumber || '–'} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <ProfileField label="Tên đăng nhập" value={staff.username} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <ProfileField
                                    label="Trạng thái"
                                    value={
                                        staff.isDeleted
                                            ? <Tag color="error" style={{ borderRadius: 10, border: 'none' }}>Đã khóa</Tag>
                                            : <Tag color={statusInfo.color} style={{ borderRadius: 10, border: 'none' }}>{statusInfo.text}</Tag>
                                    }
                                />
                            </Col>
                        </Row>
                    </Card>

                    {/* System IDs Card */}
                    <Card
                        bordered={false}
                        title={<Space><DatabaseOutlined /><span>Thông tin hệ thống</span></Space>}
                        style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 24 }}
                        bodyStyle={{ padding: '20px 24px' }}
                    >
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <IdField
                                icon={<IdcardOutlined />}
                                label="MongoDB ID"
                                value={staff._id}
                            />
                            <IdField
                                icon={<KeyOutlined />}
                                label="Keycloak ID"
                                value={staff.keycloakId || null}
                            />
                            <Row gutter={[48, 16]}>
                                <Col xs={24} sm={12}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                            <CloudServerOutlined style={{ marginRight: 6 }} />Fineract Staff ID
                                        </Text>
                                        {staff.fineractStaffId
                                            ? <Tag color="blue" style={{ borderRadius: 10 }}>#{staff.fineractStaffId}</Tag>
                                            : <Text type="secondary">–</Text>
                                        }
                                    </div>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                            <CloudServerOutlined style={{ marginRight: 6 }} />Fineract Client ID
                                        </Text>
                                        {staff.fineractClientId || staff.metadata?.fineractClientId
                                            ? <Tag color="geekblue" style={{ borderRadius: 10 }}>#{staff.fineractClientId || staff.metadata?.fineractClientId}</Tag>
                                            : <Text type="secondary">–</Text>
                                        }
                                    </div>
                                </Col>
                            </Row>
                            <Row gutter={[48, 16]}>
                                <Col xs={24} sm={12}>
                                    <ProfileField
                                        label="Ngày tạo"
                                        value={staff.createdAt ? dayjs(staff.createdAt).format('DD/MM/YYYY HH:mm:ss') : '–'}
                                    />
                                </Col>
                                <Col xs={24} sm={12}>
                                    <ProfileField
                                        label="Cập nhật lần cuối"
                                        value={staff.updatedAt ? dayjs(staff.updatedAt).format('DD/MM/YYYY HH:mm:ss') : '–'}
                                    />
                                </Col>
                            </Row>
                        </Space>
                    </Card>

                    {/* Metadata Card */}
                    {staff.metadata && (() => {
                        const extraKeys = Object.keys(staff.metadata).filter(k => !['userType', 'fineractClientId'].includes(k));
                        if (extraKeys.length === 0) return null;
                        const metaLabels: Record<string, string> = {
                            syncStatus: 'Trạng thái đồng bộ',
                            registeredAt: 'Ngày đăng ký',
                            txPublicKey: 'Public Key (Blockchain)',
                        };
                        return (
                            <Card
                                bordered={false}
                                title={<Space><SafetyCertificateOutlined /><span>Thông tin bổ sung</span></Space>}
                                style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                                bodyStyle={{ padding: '20px 24px' }}
                            >
                                <Row gutter={[48, 20]}>
                                    {extraKeys.map(key => {
                                        const val = staff.metadata![key];
                                        const label = metaLabels[key] || key;
                                        let display: React.ReactNode;

                                        if (key === 'syncStatus') {
                                            const syncColors: Record<string, string> = {
                                                synced: 'success',
                                                pending: 'processing',
                                                'registered-pending-approval': 'warning',
                                                failed: 'error',
                                            };
                                            display = (
                                                <Tag
                                                    color={syncColors[String(val)] || 'default'}
                                                    icon={<SyncOutlined />}
                                                    style={{ borderRadius: 10, border: 'none' }}
                                                >
                                                    {String(val)}
                                                </Tag>
                                            );
                                        } else if (key === 'registeredAt' || key.toLowerCase().includes('date') || key.toLowerCase().includes('at')) {
                                            const d = dayjs(String(val));
                                            display = d.isValid() ? d.format('DD/MM/YYYY HH:mm:ss') : String(val ?? '–');
                                        } else if (key === 'txPublicKey') {
                                            const pkStr = String(val);
                                            display = (
                                                <Text
                                                    copyable={{ text: pkStr }}
                                                    style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}
                                                >
                                                    {pkStr.length > 40 ? `${pkStr.slice(0, 20)}...${pkStr.slice(-20)}` : pkStr}
                                                </Text>
                                            );
                                        } else if (typeof val === 'object' && val !== null) {
                                            display = Object.entries(val as Record<string, unknown>)
                                                .map(([k, v]) => `${k}: ${v}`).join(', ');
                                        } else {
                                            display = String(val ?? '–');
                                        }

                                        return (
                                            <Col key={key} xs={24} sm={key === 'txPublicKey' ? 24 : 12}>
                                                <ProfileField label={label} value={display} />
                                            </Col>
                                        );
                                    })}
                                </Row>
                            </Card>
                        );
                    })()}
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
