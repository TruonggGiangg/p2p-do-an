import { useState, useEffect } from 'react';
import {
    Card, Form, Input, Button, Space, Typography, Avatar, Row, Col, Divider,
    theme, App, Spin, Tag,
} from 'antd';
import {
    UserOutlined, MailOutlined, PhoneOutlined, LockOutlined,
    SafetyCertificateOutlined, SaveOutlined, KeyOutlined,
} from '@ant-design/icons';
import { adminApi } from '../api/admin';

const { Title, Text } = Typography;

interface ProfileData {
    _id: string;
    username: string;
    email: string;
    phoneNumber: string;
    profile: { firstName?: string; lastName?: string };
    roles: string[];
}

export default function StaffProfilePage() {
    const { token } = theme.useToken();
    const { message: messageApi } = App.useApp();
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const data = await adminApi.getMyProfile();
            setProfile(data);
            profileForm.setFieldsValue({
                firstName: data.profile?.firstName || '',
                lastName: data.profile?.lastName || '',
                email: data.email || '',
                phoneNumber: data.phoneNumber || '',
            });
        } catch (err: any) {
            messageApi.error('Không thể tải thông tin hồ sơ');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const handleUpdateProfile = async () => {
        try {
            const values = await profileForm.validateFields();
            setSavingProfile(true);
            await adminApi.updateMyProfile(values);
            messageApi.success('Cập nhật hồ sơ thành công!');

            // Update localStorage to reflect changes
            try {
                const stored = JSON.parse(localStorage.getItem('admin_user') || '{}');
                if (values.email) stored.email = values.email;
                if (values.phoneNumber) stored.phoneNumber = values.phoneNumber;
                if (!stored.profile) stored.profile = {};
                if (values.firstName) stored.profile.firstName = values.firstName;
                if (values.lastName) stored.profile.lastName = values.lastName;
                localStorage.setItem('admin_user', JSON.stringify(stored));
            } catch { /* ignore */ }

            fetchProfile();
        } catch (err: any) {
            if (err?.errorFields) return;
            messageApi.error(err?.response?.data?.message || 'Cập nhật thất bại');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async () => {
        try {
            const values = await passwordForm.validateFields();
            if (values.newPassword !== values.confirmPassword) {
                messageApi.error('Mật khẩu mới và xác nhận không khớp');
                return;
            }
            setChangingPassword(true);
            await adminApi.changeMyPassword({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            });
            messageApi.success('Đổi mật khẩu thành công!');
            passwordForm.resetFields();
        } catch (err: any) {
            if (err?.errorFields) return;
            messageApi.error(err?.response?.data?.message || 'Đổi mật khẩu thất bại');
        } finally {
            setChangingPassword(false);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                    <Text type="secondary">Đang tải thông tin hồ sơ...</Text>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* Profile Header */}
            <Card
                bordered={false}
                style={{
                    marginBottom: 24,
                    background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
                    boxShadow: '0 4px 12px rgba(30, 64, 175, 0.25)',
                }}
                bodyStyle={{ padding: '32px' }}
            >
                <Space size={20} align="center">
                    <Avatar
                        size={72}
                        icon={<UserOutlined />}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: '3px solid rgba(255,255,255,0.4)',
                            fontSize: 32,
                        }}
                    />
                    <div>
                        <Title level={3} style={{ margin: 0, color: '#FFFFFF', fontWeight: 700 }}>
                            {[profile?.profile?.firstName, profile?.profile?.lastName].filter(Boolean).join(' ') || profile?.username}
                        </Title>
                        <Space size={8} style={{ marginTop: 4 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
                                @{profile?.username}
                            </Text>
                            <Tag
                                color="rgba(255,255,255,0.2)"
                                style={{ borderRadius: 0, border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
                            >
                                Nhân viên
                            </Tag>
                        </Space>
                    </div>
                </Space>
            </Card>

            <Row gutter={24}>
                {/* Profile Update */}
                <Col xs={24} lg={14}>
                    <Card
                        bordered={false}
                        title={
                            <Space>
                                <UserOutlined style={{ color: token.colorPrimary }} />
                                <span style={{ fontWeight: 600 }}>Thông tin cá nhân</span>
                            </Space>
                        }
                        style={{ marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                    >
                        <Form form={profileForm} layout="vertical">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="firstName" label="Họ và tên đệm">
                                        <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="lastName" label="Tên">
                                        <Input placeholder="A" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item
                                name="email"
                                label="Email"
                                rules={[{ type: 'email', message: 'Email không hợp lệ' }]}
                            >
                                <Input prefix={<MailOutlined />} placeholder="email@example.com" />
                            </Form.Item>
                            <Form.Item
                                name="phoneNumber"
                                label="Số điện thoại"
                                rules={[{ min: 10, message: 'Tối thiểu 10 ký tự' }]}
                            >
                                <Input prefix={<PhoneOutlined />} placeholder="0901234567" />
                            </Form.Item>

                            <div style={{ background: token.colorBgLayout, padding: '10px 14px', marginBottom: 16 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                                    Tên đăng nhập (<strong>{profile?.username}</strong>) không thể thay đổi.
                                </Text>
                            </div>

                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={savingProfile}
                                onClick={handleUpdateProfile}
                                style={{ fontWeight: 500 }}
                            >
                                Lưu thay đổi
                            </Button>
                        </Form>
                    </Card>
                </Col>

                {/* Password Change */}
                <Col xs={24} lg={10}>
                    <Card
                        bordered={false}
                        title={
                            <Space>
                                <KeyOutlined style={{ color: token.colorWarning }} />
                                <span style={{ fontWeight: 600 }}>Đổi mật khẩu</span>
                            </Space>
                        }
                        style={{ marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                    >
                        <Form form={passwordForm} layout="vertical">
                            <Form.Item
                                name="currentPassword"
                                label="Mật khẩu hiện tại"
                                rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
                            >
                                <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu hiện tại" />
                            </Form.Item>

                            <Divider style={{ margin: '12px 0' }} />

                            <Form.Item
                                name="newPassword"
                                label="Mật khẩu mới"
                                rules={[
                                    { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                                    { min: 6, message: 'Tối thiểu 6 ký tự' },
                                ]}
                            >
                                <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu mới" />
                            </Form.Item>
                            <Form.Item
                                name="confirmPassword"
                                label="Xác nhận mật khẩu"
                                dependencies={['newPassword']}
                                rules={[
                                    { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newPassword') === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password prefix={<LockOutlined />} placeholder="Nhập lại mật khẩu mới" />
                            </Form.Item>

                            <Button
                                type="primary"
                                danger
                                icon={<KeyOutlined />}
                                loading={changingPassword}
                                onClick={handleChangePassword}
                                style={{ fontWeight: 500, width: '100%' }}
                            >
                                Đổi mật khẩu
                            </Button>
                        </Form>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
