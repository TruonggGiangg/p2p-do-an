import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Card, Button, Switch, Modal, Form, Input, Tag, Space, Table,
    Typography, message, Popconfirm, Tooltip, Spin, Badge, Empty,
    Divider, Row, Col, Collapse, theme,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined,
    LockOutlined, SaveOutlined, ReloadOutlined, ThunderboltOutlined,
    SearchOutlined, CheckCircleFilled, UndoOutlined, CaretRightOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { adminApi, RoleDto, PermissionDto } from '../api/admin';
import { useTheme } from '../App';
import dayjs from 'dayjs';

const { Text } = Typography;

/* ═══════════════════ LABELS & STYLE MAPS ═══════════════════ */

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

const ACTION_LABELS: Record<string, string> = {
    manage: 'Toàn quyền',
    create: 'Tạo mới',
    read: 'Xem',
    update: 'Cập nhật',
    delete: 'Xóa',
    approve: 'Phê duyệt',
    disburse: 'Giải ngân',
};

const ACTION_COLORS: Record<string, string> = {
    manage: '#7c3aed',
    create: '#059669',
    read: '#2563eb',
    update: '#d97706',
    delete: '#dc2626',
    approve: '#0891b2',
    disburse: '#ca8a04',
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
    manage: 'Bao gồm tất cả quyền cho tài nguyên này',
    create: 'Tạo mới tài nguyên',
    read: 'Xem danh sách và chi tiết',
    update: 'Cập nhật thông tin',
    delete: 'Xóa tài nguyên',
    approve: 'Phê duyệt yêu cầu',
    disburse: 'Giải ngân khoản vay',
};

/**
 * Các action thực sự được guard trong backend controller cho từng subject.
 * Chỉ những action này mới hiển thị trong phần phân quyền.
 * Tham khảo: admin.controller.ts @CheckPolicies decorators.
 */
const SUBJECT_AVAILABLE_ACTIONS: Record<string, string[]> = {
    LoanProduct: ['manage', 'read'],
    SavingsProduct: ['manage', 'read'],
    DocumentType: ['manage', 'create', 'read', 'update', 'delete'],
    SyncDrift: ['manage', 'read'],
    Customer: ['manage', 'read', 'update'],
    Loan: ['manage', 'read', 'update', 'approve', 'disburse'],
    LoanDocument: ['manage', 'read', 'update', 'approve'],
    Kyc: ['manage', 'create', 'read', 'update', 'approve'],
    Staff: ['manage', 'create', 'read', 'update', 'delete'],
    LoanApplication: ['manage', 'read', 'update'],
    Migration: ['manage'],
};

const PAGE_SIZE = 5;

/* ═══════════════════ COMPONENT ═══════════════════ */

export default function RolesPermissionsPage() {
    const { token } = theme.useToken();
    const { isDarkMode } = useTheme();

    /* ── State ── */
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
    const [searchText, setSearchText] = useState('');
    const [roleTablePage, setRoleTablePage] = useState(1);
    const [form] = Form.useForm();

    /* ═══════════════════ DATA LOADING ═══════════════════ */

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
            message.error(err?.response?.data?.message || 'Không thể tải danh sách vai trò');
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
            message.error('Không thể tải quyền của vai trò');
        } finally {
            setPermLoading(false);
        }
    }, []);

    useEffect(() => { loadRoles(); }, [loadRoles]);

    useEffect(() => {
        if (selectedRole) loadPermissions(selectedRole._id);
    }, [selectedRole, loadPermissions]);

    /* ═══════════════════ PERMISSION HELPERS ═══════════════════ */

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
            if (action === 'manage' && checked) {
                metadata.actions
                    .filter(a => a !== 'manage')
                    .forEach(a => next.set(`${a}::${subject}`, { action: a, subject, allowed: true }));
            }
            return next;
        });
    };

    const hasPendingChanges = pendingChanges.size > 0;

    /* ═══════════════════ SAVE PERMISSIONS ═══════════════════ */

    const handleSavePermissions = async () => {
        if (!selectedRole) return;
        setSaving(true);
        try {
            const currentMap = new Map<string, { action: string; subject: string; allowed: boolean }>();
            for (const p of permissions) {
                currentMap.set(`${p.action}::${p.subject}`, { action: p.action, subject: p.subject, allowed: p.allowed });
            }
            for (const [key, val] of pendingChanges) {
                currentMap.set(key, val);
            }
            await adminApi.setRolePermissions(selectedRole._id, Array.from(currentMap.values()));
            message.success('Cập nhật quyền thành công!');
            await loadPermissions(selectedRole._id);
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Lỗi khi cập nhật quyền');
        } finally {
            setSaving(false);
        }
    };

    /* ═══════════════════ ROLE CRUD ═══════════════════ */

    const handleCreateOrUpdateRole = async () => {
        try {
            const values = await form.validateFields();
            if (editingRole) {
                await adminApi.updateRole(editingRole._id, values);
                message.success('Cập nhật vai trò thành công');
            } else {
                await adminApi.createRole(values);
                message.success('Tạo vai trò thành công');
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
            message.success('Đã xóa vai trò');
            if (selectedRole?._id === id) {
                setSelectedRole(null);
                setPermissions([]);
            }
            loadRoles();
        } catch (err: any) {
            message.error(err?.response?.data?.message || 'Không thể xóa vai trò');
        }
    };

    const openEditModal = (role: RoleDto) => {
        setEditingRole(role);
        form.setFieldsValue({ name: role.name, description: role.description });
        setRoleModalOpen(true);
    };

    /* ═══════════════════ FILTERED DATA ═══════════════════ */

    const filteredRoles = useMemo(() => {
        if (!searchText.trim()) return roles;
        const lower = searchText.toLowerCase();
        return roles.filter(r =>
            r.name.toLowerCase().includes(lower) ||
            (r.description && r.description.toLowerCase().includes(lower))
        );
    }, [roles, searchText]);

    /* ═══════════════════ ROLE TABLE COLUMNS ═══════════════════ */

    const roleColumns: ColumnsType<RoleDto> = [
        {
            title: 'STT',
            key: 'index',
            width: 60,
            align: 'center',
            render: (_, __, idx) => (
                <Text style={{ fontWeight: 500, color: token.colorTextSecondary }}>
                    {(roleTablePage - 1) * PAGE_SIZE + idx + 1}
                </Text>
            ),
        },
        {
            title: 'Tên vai trò',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record: RoleDto) => (
                <Tag
                    color={selectedRole?._id === record._id ? 'blue' : 'default'}
                    style={{ fontWeight: 600, fontSize: 13, padding: '2px 12px', cursor: 'pointer' }}
                >
                    {name}
                </Tag>
            ),
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (desc: string) => (
                <Text type="secondary" style={{ fontSize: 13 }}>{desc || '—'}</Text>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 120,
            align: 'center',
            render: (isActive: boolean) => (
                <Tag
                    icon={isActive ? <CheckCircleFilled /> : undefined}
                    color={isActive ? 'success' : 'error'}
                    style={{ fontWeight: 500 }}
                >
                    {isActive ? 'Hoạt động' : 'Tắt'}
                </Tag>
            ),
        },
        {
            title: 'Ngày tạo',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 150,
            render: (date: string) => (
                <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '—'}
                </Text>
            ),
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 220,
            align: 'center',
            render: (_: any, record: RoleDto) => (
                <Space size={4}>
                    <Tooltip title="Phân quyền">
                        <Button
                            type={selectedRole?._id === record._id ? 'primary' : 'default'}
                            size="small"
                            icon={<SafetyCertificateOutlined />}
                            onClick={(e) => { e.stopPropagation(); setSelectedRole(record); }}
                        >
                            Phân quyền
                        </Button>
                    </Tooltip>
                    <Tooltip title="Sửa">
                        <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={(e) => { e.stopPropagation(); openEditModal(record); }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Xóa vai trò này?"
                        description="Toàn bộ quyền của vai trò sẽ bị xóa."
                        onConfirm={() => handleDeleteRole(record._id)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                    >
                        <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    /* ═══════════════════ PERMISSION CARD HELPERS ═══════════════════ */

    const getCardBg = (action: string, isOn: boolean) => {
        if (!isOn) return token.colorBgContainer;
        const c = ACTION_COLORS[action] || '#2563eb';
        return isDarkMode ? `${c}12` : `${c}0a`;
    };

    const getCardBorder = (action: string, isOn: boolean) => {
        if (!isOn) return isDarkMode ? '#334155' : '#e5e7eb';
        const c = ACTION_COLORS[action] || '#2563eb';
        return isDarkMode ? `${c}50` : `${c}45`;
    };

    /* ═══════════════════ RENDER ═══════════════════ */

    const collapseItems = useMemo(() => metadata.subjects.map(subject => {
        const subjectLabel = SUBJECT_LABELS[subject] || subject;
        const manageOn = isPermissionOn('manage', subject);

        // Chỉ lấy các action thực sự tồn tại trong backend cho subject này
        const availableActions = SUBJECT_AVAILABLE_ACTIONS[subject] ?? ['manage', 'read'];
        // Đảm bảo manage luôn đứng đầu nếu có
        const orderedActions = [
            ...availableActions.filter(a => a === 'manage'),
            ...availableActions.filter(a => a !== 'manage'),
        ];

        const activeCount = orderedActions.filter(a => isPermissionOn(a, subject)).length;

        return {
            key: subject,
            label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 8 }}>
                    <Space size={8}>
                        {manageOn && <ThunderboltOutlined style={{ color: token.colorPrimary }} />}
                        <Text strong style={{ fontSize: 14, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                            {subjectLabel}
                        </Text>
                    </Space>
                    <Space size={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {activeCount}/{orderedActions.length} quyền
                        </Text>
                        {manageOn && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>Toàn quyền</Tag>}
                    </Space>
                </div>
            ),
            children: (
                <Row gutter={[12, 12]}>
                    {orderedActions.map(action => {
                        const color = ACTION_COLORS[action] || '#2563eb';
                        const isOn = action === 'manage'
                            ? manageOn
                            : (manageOn || isPermissionOn(action, subject));
                        const isLocked = action !== 'manage' && manageOn;

                        return (
                            <Col xs={24} sm={12} key={action}>
                                <div
                                    className="perm-card-item"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '14px 16px',
                                        borderRadius: 10,
                                        border: `1.5px solid ${getCardBorder(action, isOn)}`,
                                        background: getCardBg(action, isOn),
                                        transition: 'all 0.2s ease',
                                        opacity: isLocked ? 0.7 : 1,
                                        cursor: isLocked ? 'not-allowed' : 'pointer',
                                    }}
                                    onClick={() => {
                                        if (!isLocked) handleToggle(action, subject, !isPermissionOn(action, subject));
                                    }}
                                >
                                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                                    <div onClick={e => e.stopPropagation()} role="presentation">
                                        <Switch
                                            checked={isOn}
                                            disabled={isLocked}
                                            onChange={checked => handleToggle(action, subject, checked)}
                                            style={isOn ? { backgroundColor: color } : undefined}
                                        />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text strong style={{ fontSize: 14 }}>
                                            {ACTION_LABELS[action] || action}
                                        </Text>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                            <Tag
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    padding: '0 6px',
                                                    lineHeight: '18px',
                                                    border: 'none',
                                                    color: color,
                                                    background: isDarkMode ? `${color}25` : `${color}15`,
                                                    margin: 0,
                                                }}
                                            >
                                                {action.toUpperCase()}
                                            </Tag>
                                            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                                {ACTION_DESCRIPTIONS[action] || ''}
                                            </Text>
                                        </div>
                                    </div>
                                    {isLocked && (
                                        <Tooltip title="Được bao gồm trong Toàn quyền">
                                            <LockOutlined style={{ color: isDarkMode ? '#7dd3fc' : '#93c5fd', fontSize: 14 }} />
                                        </Tooltip>
                                    )}
                                </div>
                            </Col>
                        );
                    })}
                </Row>
            ),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [metadata.subjects, permissions, pendingChanges, selectedRole, isDarkMode, token]);

    return (
        <>
            <style>{`
                /* ── Role table ── */
                .rp-role-row-selected td {
                    background: ${isDarkMode ? 'rgba(59,130,246,0.08)' : '#eff6ff'} !important;
                }
                .ant-table-tbody > tr.rp-role-row-selected:hover > td {
                    background: ${isDarkMode ? 'rgba(59,130,246,0.14)' : '#dbeafe'} !important;
                }

                /* ── Permission cards hover ── */
                .perm-card-item:hover {
                    box-shadow: 0 2px 8px ${isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'};
                    transform: translateY(-1px);
                }

                /* ── Collapse styling ── */
                .rp-perm-collapse .ant-collapse-item {
                    border: 1.5px solid ${isDarkMode ? '#334155' : '#e2e8f0'} !important;
                    border-radius: 10px !important;
                    margin-bottom: 12px !important;
                    overflow: hidden;
                    background: ${token.colorBgContainer};
                }
                .rp-perm-collapse .ant-collapse-item:last-child {
                    margin-bottom: 12px !important;
                }
                .rp-perm-collapse .ant-collapse-header {
                    padding: 14px 16px !important;
                    align-items: center !important;
                    border-bottom: 1px solid transparent !important;
                    background: ${isDarkMode ? '#1e293b' : '#f8fafc'} !important;
                    transition: background 0.2s;
                }
                .rp-perm-collapse .ant-collapse-item-active .ant-collapse-header {
                    border-bottom: 1px solid ${isDarkMode ? '#334155' : '#e2e8f0'} !important;
                }
                .rp-perm-collapse .ant-collapse-content-box {
                    padding: 12px 16px 16px !important;
                }
                .rp-perm-collapse .ant-collapse-expand-icon {
                    padding-inline-end: 8px !important;
                }
                .rp-perm-collapse {
                    background: transparent !important;
                    border: none !important;
                }
            `}</style>

            {/* ═══════════════ ROLE TABLE ═══════════════ */}
            <Card
                title={
                    <Space>
                        <SafetyCertificateOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                        <Text strong style={{ fontSize: 16 }}>Danh sách vai trò</Text>
                        <Badge count={roles.length} style={{ backgroundColor: token.colorPrimary }} />
                    </Space>
                }
                extra={
                    <Space>
                        <Input
                            placeholder="Tìm kiếm vai trò..."
                            prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
                            value={searchText}
                            onChange={e => { setSearchText(e.target.value); setRoleTablePage(1); }}
                            allowClear
                            style={{ width: 220 }}
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => { setEditingRole(null); form.resetFields(); setRoleModalOpen(true); }}
                        >
                            Tạo vai trò
                        </Button>
                    </Space>
                }
                styles={{ body: { padding: 0 } }}
                style={{ marginBottom: 24 }}
            >
                <Table
                    dataSource={filteredRoles}
                    columns={roleColumns}
                    rowKey="_id"
                    loading={loading}
                    size="middle"
                    pagination={{
                        current: roleTablePage,
                        pageSize: PAGE_SIZE,
                        total: filteredRoles.length,
                        onChange: page => setRoleTablePage(page),
                        showSizeChanger: false,
                        showTotal: (total, range) => `${range[0]}–${range[1]} / ${total} vai trò`,
                        style: { padding: '12px 16px', margin: 0 },
                    }}
                    onRow={record => ({
                        onClick: () => setSelectedRole(record),
                        style: { cursor: 'pointer' },
                    })}
                    rowClassName={record =>
                        selectedRole?._id === record._id ? 'rp-role-row-selected' : ''
                    }
                />
            </Card>

            {/* ═══════════════ PERMISSION SECTION ═══════════════ */}
            {!selectedRole ? (
                <Card styles={{ body: { padding: 48 } }}>
                    <Empty
                        image={<SafetyCertificateOutlined style={{ fontSize: 48, color: token.colorTextDisabled }} />}
                        description={
                            <Text type="secondary">
                                Chọn một vai trò ở bảng trên hoặc nhấn &quot;Phân quyền&quot; để quản lý quyền
                            </Text>
                        }
                    />
                </Card>
            ) : (
                <Card
                    title={
                        <Space wrap>
                            <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
                            <Text strong style={{ fontSize: 16 }}>Danh sách các quyền:</Text>
                            <Tag color="blue" style={{ fontWeight: 600, fontSize: 14, padding: '2px 14px' }}>
                                {selectedRole.name}
                            </Tag>
                            {hasPendingChanges && (
                                <Badge count={pendingChanges.size} size="small" offset={[4, 0]}>
                                    <Tag color="orange">Chưa lưu</Tag>
                                </Badge>
                            )}
                        </Space>
                    }
                    extra={
                        <Space>
                            {hasPendingChanges && (
                                <Button
                                    icon={<UndoOutlined />}
                                    size="small"
                                    onClick={() => setPendingChanges(new Map())}
                                >
                                    Hoàn tác
                                </Button>
                            )}
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
                                loading={saving}
                                disabled={!hasPendingChanges}
                                onClick={handleSavePermissions}
                            >
                                Lưu thay đổi {hasPendingChanges ? `(${pendingChanges.size})` : ''}
                            </Button>
                        </Space>
                    }
                >
                    <Spin spinning={permLoading}>
                        <Collapse
                            className="rp-perm-collapse"
                            defaultActiveKey={metadata.subjects}
                            items={collapseItems}
                            expandIconPosition="start"
                            expandIcon={({ isActive }) => (
                                <CaretRightOutlined
                                    rotate={isActive ? 90 : 0}
                                    style={{ fontSize: 12, color: token.colorTextSecondary, transition: 'transform 0.2s' }}
                                />
                            )}
                        />
                    </Spin>

                    <Divider style={{ margin: '16px 0 12px' }} />
                    <Space size={16} wrap>
                        <Space size={6}>
                            <Switch size="small" checked />
                            <Text type="secondary" style={{ fontSize: 12 }}>Có quyền</Text>
                        </Space>
                        <Space size={6}>
                            <Switch size="small" checked={false} />
                            <Text type="secondary" style={{ fontSize: 12 }}>Không có quyền</Text>
                        </Space>
                        <Space size={6}>
                            <ThunderboltOutlined style={{ color: token.colorPrimary }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <strong>Toàn quyền</strong> = tự động bật tất cả
                            </Text>
                        </Space>
                        <Space size={6}>
                            <LockOutlined style={{ color: isDarkMode ? '#7dd3fc' : '#93c5fd' }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Khoá do Toàn quyền
                            </Text>
                        </Space>
                    </Space>
                </Card>
            )}

            {/* ── Create / Edit Role Modal ── */}
            <Modal
                title={
                    <Space>
                        <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
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
                        label="Tên vai trò"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên vai trò' },
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
