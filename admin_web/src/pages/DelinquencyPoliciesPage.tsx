import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Form,
    Input,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
    message,
    theme,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SaveOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { adminApi } from '../api/admin';

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
    const { token } = theme.useToken();
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
    const [debtGroups, setDebtGroups] = useState<DebtGroupOption[]>([]);
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [form] = Form.useForm();

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
            // Create mode: hide debt groups that already have a policy.
            // Edit mode: keep current group visible for existing policy.
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
        }
    }, [messageApi]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    return (
        <>
            {contextHolder}
            <Card
                bordered={false}
                style={{ borderRadius: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                title={
                    <Space>
                        <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
                        <span>Cấu hình xử lý nợ xấu</span>
                        <Tag color="blue">{policies.length} policy</Tag>
                    </Space>
                }
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
        </>
    );
}
