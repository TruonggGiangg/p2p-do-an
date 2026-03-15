import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Form,
    Input,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import {
    PlusOutlined, ReloadOutlined, SaveOutlined, DeleteOutlined,
    SafetyCertificateOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
    StopOutlined
} from '@ant-design/icons';
import { adminApi } from '../api/admin';
import PageHeader from '../components/PageHeader';
import { PageWithStatsSkeleton } from '../components/PageSkeleton';

const { Text } = Typography;

type CollectionStage = 'NONE' | 'REMINDER' | 'WARNING' | 'COLLECTION' | 'LEGAL' | 'WRITE_OFF';

type DebtGroupOption = {
    debt_group: number;
    debt_group_name: string;
    min_days: number;
    max_days: number;
};

type Policy = {
    _id: string;
    policy_id: string;
    debt_group: number;
    debt_group_name: string;
    min_days: number;
    max_days: number;
    send_email: boolean;
    send_sms: boolean;
    send_notification: boolean;
    apply_penalty: boolean;
    block_new_loan: boolean;
    collection_stage: CollectionStage;
    legal_escalation: boolean;
    is_active: boolean;
    description?: string;
    createdAt: string;
    updatedAt: string;
};

const STAGE_OPTIONS: Array<{ label: string; value: CollectionStage }> = [
    { label: 'NONE - Bình thường', value: 'NONE' },
    { label: 'REMINDER - Nhắc nợ', value: 'REMINDER' },
    { label: 'WARNING - Cảnh báo', value: 'WARNING' },
    { label: 'COLLECTION - Bộ phận thu hồi', value: 'COLLECTION' },
    { label: 'LEGAL - Xử lý pháp lý', value: 'LEGAL' },
    { label: 'WRITE_OFF - Nợ mất vốn', value: 'WRITE_OFF' },
];

export default function DelinquencyPoliciesPage() {
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
    const [debtGroups, setDebtGroups] = useState<DebtGroupOption[]>([]);
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [form] = Form.useForm();

    const [initialLoading, setInitialLoading] = useState(true);

    const debtGroupMap = useMemo(() => {
        const map = new Map<number, DebtGroupOption>();
        debtGroups.forEach((group) => map.set(group.debt_group, group));
        return map;
    }, [debtGroups]);

    const usedDebtGroups = useMemo(() => {
        return new Set(policies.map((policy) => policy.debt_group));
    }, [policies]);

    const selectableDebtGroups = useMemo(() => {
        return debtGroups.filter((group) => {
            if (!usedDebtGroups.has(group.debt_group)) return true;
            return editingPolicy?.debt_group === group.debt_group;
        });
    }, [debtGroups, usedDebtGroups, editingPolicy]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [groups, list] = await Promise.all([
                adminApi.getDelinquencyPolicyDebtGroups(),
                adminApi.getDelinquencyPolicies(),
            ]);
            setDebtGroups(groups || []);
            setPolicies(list || []);
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không tải được cấu hình xử lý nợ xấu');
        } finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, [messageApi]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Computed stats
    const activeCount = policies.filter(p => p.is_active).length;
    const legalCount = policies.filter(p => p.legal_escalation).length;
    const blockCount = policies.filter(p => p.block_new_loan).length;

    const statCards = [
        { title: 'Tổng policy', value: policies.length, gradient: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)', icon: <SafetyCertificateOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { title: 'Đang hoạt động', value: activeCount, gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)', icon: <CheckCircleOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { title: 'Hành động pháp lý', value: legalCount, gradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)', icon: <ExclamationCircleOutlined style={{ fontSize: 24, color: '#fff' }} /> },
        { title: 'Chặn vay mới', value: blockCount, gradient: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)', icon: <StopOutlined style={{ fontSize: 24, color: '#fff' }} /> },
    ];

    const openCreateModal = () => {
        setEditingPolicy(null);
        form.resetFields();
        form.setFieldsValue({
            send_email: true,
            send_sms: true,
            send_notification: true,
            apply_penalty: false,
            block_new_loan: false,
            legal_escalation: false,
            collection_stage: 'REMINDER',
            is_active: true,
        });
        setIsModalOpen(true);
    };

    const openEditModal = (policy: Policy) => {
        setEditingPolicy(policy);
        form.setFieldsValue({ ...policy });
        setIsModalOpen(true);
    };

    const onDebtGroupChange = (debtGroup: number) => {
        const group = debtGroupMap.get(debtGroup);
        if (!group) return;
        form.setFieldsValue({
            debt_group_name: group.debt_group_name,
        });
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            if (editingPolicy) {
                await adminApi.updateDelinquencyPolicy(editingPolicy._id, values);
                messageApi.success('Cập nhật policy thành công');
            } else {
                await adminApi.createDelinquencyPolicy(values);
                messageApi.success('Tạo policy thành công');
            }
            setIsModalOpen(false);
            await fetchData();
        } catch (error: any) {
            if (error?.errorFields) return;
            messageApi.error(error?.response?.data?.message ?? 'Không thể lưu policy');
        } finally {
            setSaving(false);
        }
    };

    const updateSingleField = async (id: string, payload: Record<string, any>, successMessage: string) => {
        try {
            await adminApi.updateDelinquencyPolicy(id, payload);
            messageApi.success(successMessage);
            await fetchData();
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không cập nhật được policy');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminApi.removeDelinquencyPolicy(id);
            messageApi.success('Xóa policy thành công');
            await fetchData();
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không xóa được policy');
        }
    };

    if (initialLoading) {
        return <PageWithStatsSkeleton statCount={4} tableRows={5} tableColumns={8} />;
    }

    return (
        <div>
            {contextHolder}
            <PageHeader
                title="Cấu hình xử lý nợ xấu"
                description="Quản lý chính sách xử lý nợ quá hạn: email, SMS, notification, chặn vay mới, lãi phạt, pháp lý."
                breadcrumb={[{ label: 'Cấu hình xử lý nợ xấu' }]}
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                            Làm mới
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                            Tạo policy
                        </Button>
                    </Space>
                }
            />

            {/* Stat Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {statCards.map((s, i) => (
                    <Col xs={24} sm={12} md={8} lg={6} key={i}>
                        <Card
                            bordered={false}
                            style={{
                                background: s.gradient,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                height: '100%',
                                minHeight: 100,
                            }}
                            styles={{ body: { padding: '20px 24px' } }}
                        >
                            <Space align="center" size={16} style={{ width: '100%' }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 8,
                                    background: 'rgba(255,255,255,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>{s.icon}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, display: 'block' }}>{s.title}</Text>
                                    <Text strong style={{ color: '#fff', fontSize: 26, fontWeight: 700, lineHeight: 1.2, display: 'block' }}>{s.value}</Text>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Table Card */}
            <Card
                bordered={false}
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={
                        <>
                            debt_group lấy trực tiếp từ cấu hình quá hạn trên Fineract. Hệ thống lưu ID nhóm nợ và cho phép bật/tắt từng biện pháp xử lý
                            (email, SMS, notification, chặn vay mới, lãi phạt, pháp lý) theo chính sách tuân thủ.
                        </>
                    }
                />

                <Table<Policy>
                    rowKey="_id"
                    loading={loading}
                    dataSource={policies}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    scroll={{ x: 1600 }}
                    columns={[
                        {
                            title: 'Nhóm nợ',
                            key: 'group',
                            width: 250,
                            render: (_, row) => (
                                <Space direction="vertical" size={0}>
                                    <Text strong>#{row.debt_group} - {row.debt_group_name}</Text>
                                    <Text type="secondary">{row.min_days} - {row.max_days} ngày</Text>
                                </Space>
                            ),
                        },
                        {
                            title: 'Stage',
                            dataIndex: 'collection_stage',
                            width: 180,
                            render: (stage: CollectionStage) => <Tag color={stage === 'LEGAL' || stage === 'WRITE_OFF' ? 'red' : 'processing'}>{stage}</Tag>,
                        },
                        {
                            title: 'Policy Active',
                            dataIndex: 'is_active',
                            width: 130,
                            render: (value: boolean, row) => (
                                <Switch checked={value} onChange={(checked) => updateSingleField(row._id, { is_active: checked }, 'Đã cập nhật trạng thái policy')} />
                            ),
                        },
                        {
                            title: 'Email',
                            dataIndex: 'send_email',
                            width: 100,
                            render: (value: boolean, row) => (
                                <Switch checked={value} onChange={(checked) => updateSingleField(row._id, { send_email: checked }, 'Đã cập nhật Email')} />
                            ),
                        },
                        {
                            title: 'SMS',
                            dataIndex: 'send_sms',
                            width: 100,
                            render: (value: boolean, row) => (
                                <Switch checked={value} onChange={(checked) => updateSingleField(row._id, { send_sms: checked }, 'Đã cập nhật SMS')} />
                            ),
                        },
                        {
                            title: 'Push',
                            dataIndex: 'send_notification',
                            width: 110,
                            render: (value: boolean, row) => (
                                <Switch checked={value} onChange={(checked) => updateSingleField(row._id, { send_notification: checked }, 'Đã cập nhật Push')} />
                            ),
                        },
                        {
                            title: 'Lãi phạt',
                            key: 'penalty',
                            width: 120,
                            render: (_, row) => (
                                <Switch checked={row.apply_penalty} onChange={(checked) => updateSingleField(row._id, { apply_penalty: checked }, 'Đã cập nhật lãi phạt')} />
                            ),
                        },
                        {
                            title: 'Chặn vay mới',
                            dataIndex: 'block_new_loan',
                            width: 130,
                            render: (value: boolean, row) => (
                                <Switch checked={value} onChange={(checked) => updateSingleField(row._id, { block_new_loan: checked }, 'Đã cập nhật chặn vay mới')} />
                            ),
                        },
                        {
                            title: 'Pháp lý',
                            dataIndex: 'legal_escalation',
                            width: 120,
                            render: (value: boolean, row) => (
                                <Switch checked={value} onChange={(checked) => updateSingleField(row._id, { legal_escalation: checked }, 'Đã cập nhật escalation pháp lý')} />
                            ),
                        },
                        {
                            title: 'Hành động',
                            key: 'actions',
                            width: 170,
                            fixed: 'right',
                            render: (_, row) => (
                                <Space>
                                    <Button size="small" icon={<SaveOutlined />} onClick={() => openEditModal(row)}>
                                        Sửa
                                    </Button>
                                    <Popconfirm
                                        title="Xóa policy?"
                                        description="Hành động này không thể hoàn tác"
                                        okText="Xóa"
                                        cancelText="Hủy"
                                        onConfirm={() => handleDelete(row._id)}
                                    >
                                        <Button danger size="small" icon={<DeleteOutlined />}>
                                            Xóa
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>

            <Modal
                title={editingPolicy ? 'Cập nhật policy nợ xấu' : 'Tạo policy nợ xấu'}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleSave}
                okText={editingPolicy ? 'Cập nhật' : 'Tạo mới'}
                confirmLoading={saving}
                width={860}
            >
                <Form form={form} layout="vertical">
                    <Space align="start" style={{ width: '100%' }} size={16}>
                        <Form.Item label="Nhóm nợ từ Fineract" name="debt_group" rules={[{ required: true, message: 'Chọn debt_group' }]} style={{ width: 260 }}>
                            <Select
                                placeholder="Chọn debt_group"
                                options={selectableDebtGroups.map((group) => ({
                                    value: group.debt_group,
                                    label: `#${group.debt_group} - ${group.debt_group_name} (${group.min_days}-${group.max_days} ngày)`,
                                }))}
                                onChange={onDebtGroupChange}
                                disabled={!!editingPolicy}
                                notFoundContent="Không còn nhóm nợ trống để tạo policy mới"
                            />
                        </Form.Item>
                        <Form.Item label="Tên nhóm" name="debt_group_name" rules={[{ required: true, message: 'Nhập tên nhóm nợ' }]} style={{ flex: 1 }}>
                            <Input placeholder="VD: Nhóm 2 - Nợ cần chú ý" />
                        </Form.Item>
                    </Space>

                    <Space align="start" style={{ width: '100%' }} size={16}>
                        <Form.Item label="Collection stage" name="collection_stage" rules={[{ required: true, message: 'Chọn stage' }]} style={{ flex: 1 }}>
                            <Select options={STAGE_OPTIONS} />
                        </Form.Item>
                    </Space>

                    <Space wrap size={24} style={{ marginBottom: 12 }}>
                        <Form.Item label="Gửi email" name="send_email" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item label="Gửi SMS" name="send_sms" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item label="Push notification" name="send_notification" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item label="Áp dụng lãi phạt" name="apply_penalty" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item label="Chặn vay mới" name="block_new_loan" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item label="Escalation pháp lý" name="legal_escalation" valuePropName="checked"><Switch /></Form.Item>
                        <Form.Item label="Policy active" name="is_active" valuePropName="checked"><Switch /></Form.Item>
                    </Space>

                    <Form.Item label="Mô tả policy" name="description">
                        <Input.TextArea rows={3} placeholder="Mô tả chính sách xử lý theo quy định nội bộ và pháp luật" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
