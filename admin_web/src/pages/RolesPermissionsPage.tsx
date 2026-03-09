import { useState, useEffect, useCallback } from 'react';
import {
    Card, Table, Button, Switch, Modal, Form, Input, Tag, Space,
    Typography, message, Popconfirm, Tooltip, Spin, Badge, Empty, Divider,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined,
    LockOutlined, SaveOutlined, ReloadOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { adminApi, RoleDto, PermissionDto } from '../api/admin';

const { Text } = Typography;

/** Vietnamese labels for subjects */
const SUBJECT_LABELS: Record<string, string> = {
    LoanProduct: 'Sản phẩm vay',
    SavingsProduct: 'Sản phẩm tiết kiệm',
    DocumentType: 'Loại tài liệu',
    Customer: 'Khách hàng',
    Kyc: 'KYC / eKYC',
    Loan: 'Khoản vay',
    LoanDocument: 'Tài liệu vay',
    LoanApplication: 'Yêu cầu hỗ trợ nợ',
    Staff: 'Nhân viên',
    SyncDrift: 'Đồng bộ / Cảnh báo',
    Migration: 'Di chuyển dữ liệu',
};

/** Vietnamese labels for actions */
const ACTION_LABELS: Record<string, string> = {
    manage: 'Toàn quyền',
    create: 'Tạo mới',
    read: 'Xem',
    update: 'Cập nhật',
    delete: 'Xóa',
    approve: 'Phê duyệt',
    disburse: 'Giải ngân',
};

export default function RolesPermissionsPage() {
    const [roles, setRoles] = useState<RoleDto[]>([]);
    const [metadata, setMetadata] = useState<{ actions: string[]; subjects: string[] }>({
        actions: [], subjects: [],
    });
    const [selectedRole, setSelectedRole] = useState<RoleDto | null>(null);
    const [permissions, setPermissions] = useState<PermissionDto[]>([]);
    const [pendingChanges, setPendingChanges] = useState<
        Map<string, { action: string; subject: string; allowed: boolean }>
    >(new Map());
    const [loading, setLoading] = useState(false);
    const [permLoading, setPermLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [roleModalOpen, setRoleModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<RoleDto | null>(null);
    const [form] = Form.useForm();

    // ════════════════════ DATA LOADING ════════════════════

    const loadRoles = useCallback(async () => {
        setLoading(true);
        try {
            const [rolesData, meta] = await Promise.all([
                adminApi.getRoles(),
                adminApi.getRbacMetadata(),
            ]);
            setRoles(rolesData);
            setMetadata(meta);
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Không thể tải danh sách role');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadPermissions = useCallback(async (roleId: string) => {
        setPermLoading(true);
        try {
            const perms = await adminApi.getRolePermissions(roleId);
            setPermissions(perms);
            setPendingChanges(new Map());
        } catch (err: any) {
            message.error('Không thể tải quyền của role');
        } finally {
            setPermLoading(false);
        }
    }, []);

    useEffect(() => { loadRoles(); }, [loadRoles]);

    useEffect(() => {
        if (selectedRole) loadPermissions(selectedRole._id);
    }, [selectedRole, loadPermissions]);

    // ════════════════════ PERMISSION HELPERS ════════════════

    /** Check if a specific action+subject is currently enabled */
    const isPermissionOn = (action: string, subject: string): boolean => {
        const key = `${action}::${subject}`;
        const pending = pendingChanges.get(key);
        if (pending !== undefined) return pending.allowed;
        const existing = permissions.find(p => p.action === action && p.subject === subject);
        return existing ? existing.allowed : false;
    };


    const handleToggle = (action: string, subject: string, checked: boolean) => {
        setPendingChanges(prev => {
            const next = new Map(prev);
            next.set(`${action}::${subject}`, { action, subject, allowed: checked });
            // Cascade: turning manage ON auto-enables all other actions
            if (action === 'manage' && checked) {
                metadata.actions
                    .filter(a => a !== 'manage')
                    .forEach(a => next.set(`${a}::${subject}`, { action: a, subject, allowed: true }));
            }
            return next;
        });
    };

    const hasPendingChanges = pendingChanges.size > 0;

    // ════════════════════ SAVE PERMISSIONS ═══════════════════

    const handleSavePermissions = async () => {
        if (!selectedRole) return;
        setSaving(true);
        try {
            // Build the full permission set from current state
            const allPerms: { action: string; subject: string; allowed: boolean }[] = [];

            // Start with existing permissions
            const currentMap = new Map<string, { action: string; subject: string; allowed: boolean }>();
            for (const p of permissions) {
                currentMap.set(`${p.action}::${p.subject}`, { action: p.action, subject: p.subject, allowed: p.allowed });
            }
            // Apply pending changes
            for (const [key, val] of pendingChanges) {
                currentMap.set(key, val);
            }

            for (const val of currentMap.values()) {
                allPerms.push(val);
            }

            await adminApi.setRolePermissions(selectedRole._id, allPerms);
            message.success('Cập nhật quyền thành công!');
            await loadPermissions(selectedRole._id);
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Lỗi khi cập nhật quyền');
        } finally {
            setSaving(false);
        }
    };

    // ════════════════════ ROLE CRUD ═══════════════════════════

    const handleCreateOrUpdateRole = async () => {
        try {
            const values = await form.validateFields();
            if (editingRole) {
                await adminApi.updateRole(editingRole._id, values);
                message.success('Cập nhật role thành công');
            } else {
                await adminApi.createRole(values);
                message.success('Tạo role thành công');
            }
            setRoleModalOpen(false);
            form.resetFields();
            setEditingRole(null);
            loadRoles();
        } catch (err: any) {
            if (err?.response?.data?.message) message.error(err.response.data.message);
        }
    };

    const handleDeleteRole = async (id: string) => {
        try {
            await adminApi.deleteRole(id);
            message.success('Đã xóa role');
            if (selectedRole?._id === id) {
                setSelectedRole(null);
                setPermissions([]);
            }
            loadRoles();
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Không thể xóa role');
        }
    };

    const openEditModal = (role: RoleDto) => {
        setEditingRole(role);
        form.setFieldsValue({ name: role.name, description: role.description });
        setRoleModalOpen(true);
    };

    // ════════════════════ RENDER ════════════════════════════

    // Permission matrix: rows = subjects, columns = actions
    const permActions = metadata.actions.filter(a => a !== 'manage');
    const permSubjects = metadata.subjects;

    const permColumns = [
        {
            title: <Text strong style={{ fontSize: 13 }}>Tài nguyên</Text>,
            dataIndex: 'subject',
            key: 'subject',
            fixed: 'left' as const,
            width: 190,
            render: (subject: string, record: { subject: string }) => {
                const fullyManaged = isPermissionOn('manage', record.subject);
                return (
                    <Space>
                        {fullyManaged && (
                            <ThunderboltOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                        )}
                        <Text style={{ fontSize: 13, fontWeight: fullyManaged ? 600 : 400 }}>
                            {SUBJECT_LABELS[subject] || subject}
                        </Text>
                    </Space>
                );
            },
        },
        // "Toàn quyền" (manage) column — visually highlighted
        {
            title: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <LockOutlined style={{ fontSize: 13 }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Toàn quyền</span>
                </div>
            ),
            key: 'manage',
            width: 110,
            align: 'center' as const,
            onHeaderCell: () => ({
                style: {
                    background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
                    color: '#fff',
                    borderBottom: '2px solid #0958d9',
                },
            }),
            render: (_: any, record: { subject: string }) => (
                <Switch
                    checked={isPermissionOn('manage', record.subject)}
                    onChange={(checked) => handleToggle('manage', record.subject, checked)}
                    style={isPermissionOn('manage', record.subject) ? { backgroundColor: '#1677ff' } : undefined}
                />
            ),
        },
        ...permActions.map(action => ({
            title: <span style={{ fontSize: 12 }}>{ACTION_LABELS[action] || action}</span>,
            key: action,
            width: 95,
            align: 'center' as const,
            render: (_: any, record: { subject: string }) => {
                const manageOn = isPermissionOn('manage', record.subject);
                return (
                    <Tooltip title={manageOn ? 'Đã được bao gồm trong Toàn quyền' : undefined}>
                        <Switch
                            size="small"
                            checked={manageOn || isPermissionOn(action, record.subject)}
                            disabled={manageOn}
                            onChange={(checked) => handleToggle(action, record.subject, checked)}
                            style={manageOn ? { opacity: 0.6 } : undefined}
                        />
                    </Tooltip>
                );
            },
        })),
    ];

    const permDataSource = permSubjects.map(s => ({ key: s, subject: s }));

    return (
        <>
            <style>{`
                .perm-row-managed td { background-color: #eff6ff !important; }
                .ant-table-tbody > tr.perm-row-managed:hover > td { background-color: #dbeafe !important; }
                .role-card-item {
                    padding: 12px 14px;
                    border-radius: 10px;
                    cursor: pointer;
                    margin-bottom: 8px;
                    border: 1.5px solid #e5e7eb;
                    background: #fafafa;
                    transition: all 0.18s ease;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .role-card-item:hover { border-color: #93c5fd; background: #f0f9ff; }
                .role-card-item.selected {
                    border-color: #1677ff;
                    background: #eff6ff;
                    box-shadow: 0 0 0 2px rgba(22,119,255,0.12);
                }
                .role-card-item .role-actions { opacity: 0; transition: opacity 0.15s; }
                .role-card-item:hover .role-actions, .role-card-item.selected .role-actions { opacity: 1; }
            `}</style>

            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

                {/* ══ LEFT: Role List ══ */}
                <div style={{ width: 280, flexShrink: 0 }}>
                    <Card
                        title={
                            <Space>
                                <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
                                <Text strong>Vai trò</Text>
                                <Badge count={roles.length} style={{ backgroundColor: '#1677ff' }} />
                            </Space>
                        }
                        extra={
                            <Button
                                type="primary"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => { setEditingRole(null); form.resetFields(); setRoleModalOpen(true); }}
                            >
                                Tạo mới
                            </Button>
                        }
                        size="small"
                        styles={{ body: { padding: '12px 12px 4px' } }}
                    >
                        <Spin spinning={loading}>
                            {roles.length === 0 && !loading && (
                                <Empty description="Chưa có vai trò nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            )}
                            {roles.map(role => (
                                <div
                                    key={role._id}
                                    className={`role-card-item${selectedRole?._id === role._id ? ' selected' : ''}`}
                                    onClick={() => setSelectedRole(role)}
                                >
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Text
                                                strong
                                                style={{
                                                    fontSize: 14,
                                                    color: selectedRole?._id === role._id ? '#1677ff' : '#111827',
                                                }}
                                            >
                                                {role.name}
                                            </Text>
                                            {!role.isActive && <Tag color="red" style={{ fontSize: 11, padding: '0 4px' }}>Tắt</Tag>}
                                        </div>
                                        {role.description && (
                                            <Text
                                                type="secondary"
                                                style={{ fontSize: 12, display: 'block', marginTop: 2 }}
                                                ellipsis
                                            >
                                                {role.description}
                                            </Text>
                                        )}
                                    </div>
                                    <Space className="role-actions" size={2} onClick={e => e.stopPropagation()}>
                                        <Tooltip title="Sửa">
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<EditOutlined />}
                                                onClick={() => openEditModal(role)}
                                            />
                                        </Tooltip>
                                        <Popconfirm
                                            title="Xóa role này?"
                                            description="Toàn bộ quyền của role sẽ bị xóa."
                                            onConfirm={() => handleDeleteRole(role._id)}
                                            okText="Xóa"
                                            cancelText="Hủy"
                                            okButtonProps={{ danger: true }}
                                        >
                                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    </Space>
                                </div>
                            ))}
                        </Spin>
                    </Card>
                </div>

                {/* ══ RIGHT: Permission Matrix ══ */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {!selectedRole ? (
                        <Card size="small" styles={{ body: { padding: 48 } }}>
                            <Empty
                                image={<SafetyCertificateOutlined style={{ fontSize: 48, color: '#d1d5db' }} />}
                                description={
                                    <Text type="secondary">Chọn một vai trò bên trái để quản lý quyền</Text>
                                }
                            />
                        </Card>
                    ) : (
                        <Card
                            title={
                                <Space wrap>
                                    <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
                                    <Text strong>Phân quyền cho:</Text>
                                    <Tag color="blue" style={{ fontWeight: 600, fontSize: 13 }}>
                                        {selectedRole.name}
                                    </Tag>
                                    {hasPendingChanges && (
                                        <Badge count={pendingChanges.size} size="small">
                                            <Tag color="orange" style={{ marginLeft: 4 }}>Chưa lưu</Tag>
                                        </Badge>
                                    )}
                                </Space>
                            }
                            size="small"
                            extra={
                                <Space>
                                    <Button
                                        icon={<ReloadOutlined />}
                                        size="small"
                                        onClick={() => loadPermissions(selectedRole._id)}
                                        disabled={saving}
                                    >
                                        Tải lại
                                    </Button>
                                    <Button
                                        type="primary"
                                        icon={<SaveOutlined />}
                                        size="small"
                                        loading={saving}
                                        disabled={!hasPendingChanges}
                                        onClick={handleSavePermissions}
                                    >
                                        Lưu {hasPendingChanges ? `(${pendingChanges.size})` : ''}
                                    </Button>
                                </Space>
                            }
                        >
                            <Spin spinning={permLoading}>
                                <Table
                                    dataSource={permDataSource}
                                    columns={permColumns}
                                    rowKey="subject"
                                    pagination={false}
                                    size="small"
                                    scroll={{ x: 900 }}
                                    bordered
                                    rowClassName={(record) =>
                                        isPermissionOn('manage', record.subject) ? 'perm-row-managed' : ''
                                    }
                                />
                            </Spin>

                            <Divider style={{ margin: '12px 0' }} />
                            <Space size={20} wrap>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    <Switch size="small" checked style={{ marginRight: 6 }} />
                                    Có quyền
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    <Switch size="small" checked={false} style={{ marginRight: 6 }} />
                                    Không có quyền
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <LockOutlined />
                                    <span><strong>Toàn quyền</strong> = bật tự động tất cả actions và khoá chỉnh sửa riêng lẻ</span>
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ThunderboltOutlined style={{ color: '#1677ff' }} />
                                    <span>Hàng màu xanh = đang có toàn quyền</span>
                                </Text>
                            </Space>
                        </Card>
                    )}
                </div>
            </div>

            {/* ── Create / Edit Role Modal ── */}
            <Modal
                title={
                    <Space>
                        <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
                        {editingRole ? 'Sửa vai trò' : 'Tạo vai trò mới'}
                    </Space>
                }
                open={roleModalOpen}
                onOk={handleCreateOrUpdateRole}
                onCancel={() => { setRoleModalOpen(false); setEditingRole(null); form.resetFields(); }}
                okText={editingRole ? 'Cập nhật' : 'Tạo'}
                cancelText="Hủy"
                width={440}
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        name="name"
                        label="Tên role"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên role' },
                            { pattern: /^[a-z0-9_-]+$/, message: 'Chỉ chấp nhận chữ thường, số, _ và -' },
                        ]}
                        extra="Ví dụ: auditor, manager, loan_officer"
                    >
                        <Input placeholder="vd: auditor, manager..." />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả">
                        <Input.TextArea placeholder="Mô tả ngắn về vai trò này" rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
