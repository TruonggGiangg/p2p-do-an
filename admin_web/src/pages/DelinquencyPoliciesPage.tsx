import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
} from 'antd';
import {
    PlusOutlined, ReloadOutlined, SaveOutlined, DeleteOutlined,
    SafetyCertificateOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
    StopOutlined
} from '@ant-design/icons';
import { adminApi, type LoanProductDto } from '../api/admin';
import PageHeader from '../components/PageHeader';
import { PageWithStatsSkeleton } from '../components/PageSkeleton';
import { FineractStatusBadge } from '../utils/fineractStatus';
import { StatDisplayCards } from '../components/StatFilterCards';

const { Text } = Typography;

type CollectionStage = 'NONE' | 'REMINDER' | 'WARNING' | 'COLLECTION' | 'LEGAL' | 'WRITE_OFF';

type DebtGroupOption = {
    debt_group: number;
    debt_group_name: string;
    min_days: number;
    max_days: number | null;
};

type Policy = {
    _id: string;
    policy_id: string;
    loan_product_id?: number | null;
    loan_product_name?: string | null;
    debt_group: number;
    debt_group_name: string;
    min_days: number;
    max_days: number | null;
    send_email: boolean;
    send_sms: boolean;
    send_notification: boolean;
    apply_penalty: boolean;
    block_new_loan: boolean;
    collection_stage: CollectionStage;
    legal_escalation: boolean;
    is_active: boolean;
    retention_months?: number | null;
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
    const formatDebtGroupDayRange = (minDays?: number | null, maxDays?: number | null) => {
        const min = Number(minDays ?? 0);
        const max = maxDays != null ? Number(maxDays) : null;
        if (max == null || max >= 99999) return `>= ${min} ngày`;
        return `${min} - ${max} ngày`;
    };

    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
    const [debtGroups, setDebtGroups] = useState<DebtGroupOption[]>([]);
    const [loanProducts, setLoanProducts] = useState<LoanProductDto[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [form] = Form.useForm();

    const [initialLoading, setInitialLoading] = useState(true);

    const debtGroupMap = useMemo(() => {
        const map = new Map<number, DebtGroupOption>();
        debtGroups.forEach((group) => map.set(group.debt_group, group));
        return map;
    }, [debtGroups]);

    const productMap = useMemo(() => {
        const map = new Map<number, LoanProductDto>();
        loanProducts.forEach((product) => map.set(product.id, product));
        return map;
    }, [loanProducts]);

    const usedDebtGroups = useMemo(() => {
        return new Set(policies.map((policy) => policy.debt_group));
    }, [policies]);

    const selectableDebtGroups = useMemo(() => {
        return debtGroups.filter((group) => {
            if (!usedDebtGroups.has(group.debt_group)) return true;
            return editingPolicy?.debt_group === group.debt_group;
        });
    }, [debtGroups, usedDebtGroups, editingPolicy]);

    const fetchData = useCallback(async (targetProductId?: number | null) => {
        setLoading(true);
        try {
            const [groups, products] = await Promise.all([
                adminApi.getDelinquencyPolicyDebtGroups(),
                adminApi.getLoanProducts(),
            ]);

            const effectiveProductId = targetProductId ?? selectedProductId ?? products?.[0]?.id ?? null;
            if (effectiveProductId !== selectedProductId) {
                setSelectedProductId(effectiveProductId);
            }

            const list = effectiveProductId != null
                ? await adminApi.getDelinquencyPolicies({ loan_product_id: effectiveProductId })
                : [];

            setDebtGroups(groups || []);
            setLoanProducts(products || []);
            setPolicies(list || []);
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không tải được cấu hình xử lý nợ xấu');
        } finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, [messageApi, selectedProductId]);

    useEffect(() => {
        fetchData(selectedProductId);
    }, [fetchData]);

    // Computed stats
    const activeCount = policies.filter(p => p.is_active).length;
    const legalCount = policies.filter(p => p.legal_escalation).length;
    const blockCount = policies.filter(p => p.block_new_loan).length;

    const statCards = [
        { title: 'Tổng policy', value: policies.length, color: '#1E40AF', gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)', icon: <SafetyCertificateOutlined /> },
        { title: 'Đang hoạt động', value: activeCount, color: '#059669', gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', icon: <CheckCircleOutlined /> },
        { title: 'Hành động pháp lý', value: legalCount, color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)', icon: <ExclamationCircleOutlined /> },
        { title: 'Chặn vay mới', value: blockCount, color: '#D97706', gradient: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', icon: <StopOutlined /> },
    ];

    const openCreateModal = () => {
        if (selectedProductId == null) {
            messageApi.warning('Vui lòng chọn sản phẩm vay trước khi tạo policy');
            return;
        }

        const product = productMap.get(selectedProductId);
        setEditingPolicy(null);
        form.resetFields();
        form.setFieldsValue({
            loan_product_id: selectedProductId,
            loan_product_name: product?.name,
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

    const onProductChange = (productId: number) => {
        const product = productMap.get(productId);
        form.setFieldsValue({
            loan_product_id: productId,
            loan_product_name: product?.name,
        });
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
            const selectedProduct = selectedProductId != null ? productMap.get(selectedProductId) : undefined;
            const productId = editingPolicy?.loan_product_id ?? selectedProductId;

            if (productId == null) {
                messageApi.error('Vui lòng chọn sản phẩm vay trước khi lưu policy');
                return;
            }

            const payload = {
                ...values,
                loan_product_id: productId,
                loan_product_name: editingPolicy?.loan_product_name ?? selectedProduct?.name,
            };

            setSaving(true);
            if (editingPolicy) {
                await adminApi.updateDelinquencyPolicy(editingPolicy._id, payload);
                messageApi.success('Cập nhật policy thành công');
            } else {
                await adminApi.createDelinquencyPolicy(payload);
                messageApi.success('Tạo policy thành công');
            }
            setIsModalOpen(false);
            await fetchData(productId);
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
            await fetchData(selectedProductId);
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không cập nhật được policy');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminApi.removeDelinquencyPolicy(id);
            messageApi.success('Xóa policy thành công');
            await fetchData(selectedProductId);
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không xóa được policy');
        }
    };

    if (initialLoading) {
        return (
            <div>
                <PageHeader
                    title="Cấu hình xử lý nợ xấu"
                    description="Quản lý chính sách xử lý nợ quá hạn: email, SMS, notification, chặn vay mới, lãi phạt, pháp lý."
                    breadcrumb={[{ label: 'Cấu hình xử lý nợ xấu' }]}
                />
                <PageWithStatsSkeleton statCount={4} tableRows={5} tableColumns={8} />
            </div>
        );
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
                        <Button icon={<ReloadOutlined />} onClick={() => fetchData(selectedProductId)} loading={loading}>
                            Làm mới
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} disabled={selectedProductId == null}>
                            Tạo policy
                        </Button>
                    </Space>
                }
            />

            <StatDisplayCards items={statCards} />

            {/* Table Card */}
            <Card
                bordered={false}
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
                <Space size={12} style={{ marginBottom: 16 }}>
                    <Text strong>Sản phẩm vay:</Text>
                    <Select
                        style={{ width: 340 }}
                        placeholder="Chọn sản phẩm vay"
                        value={selectedProductId ?? undefined}
                        options={loanProducts.map((product) => ({
                            value: product.id,
                            label: `#${product.id} - ${product.name}`,
                        }))}
                        onChange={(value) => {
                            setSelectedProductId(value);
                            fetchData(value);
                        }}
                        allowClear={false}
                    />
                </Space>

                <Table<Policy>
                    rowKey="_id"
                    loading={loading}
                    dataSource={policies}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    scroll={{ x: 1600 }}
                    columns={[
                        {
                            title: 'Sản phẩm vay',
                            key: 'loan_product',
                            width: 260,
                            render: (_, row) => (
                                <Space direction="vertical" size={0}>
                                    <Text strong>{row.loan_product_name || `Loan Product #${row.loan_product_id ?? '-'}`}</Text>
                                    <Text type="secondary">#{row.loan_product_id ?? '-'}</Text>
                                </Space>
                            ),
                        },
                        {
                            title: 'Nhóm nợ',
                            key: 'group',
                            width: 250,
                            render: (_, row) => (
                                <Space direction="vertical" size={0}>
                                    <Text strong>#{row.debt_group} - {row.debt_group_name}</Text>
                                    <Text type="secondary">{formatDebtGroupDayRange(row.min_days, row.max_days)}</Text>
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
                            width: 160,
                            render: (value: boolean, row) => (
                                <div style={{ cursor: "pointer" }} onClick={() => updateSingleField(row._id, { is_active: !value }, 'Đã cập nhật trạng thái policy')}>
                                    <FineractStatusBadge status={value ? "active" : "inactive"} />
                                </div>

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
                            title: 'Lưu vết (tháng)',
                            dataIndex: 'retention_months',
                            width: 150,
                            render: (value: number | null | undefined) => (
                                <Text>{value != null ? `${value} tháng` : 'Vĩnh viễn'}</Text>
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
                        <Form.Item label="Sản phẩm vay" name="loan_product_id" rules={[{ required: true, message: 'Chọn sản phẩm vay' }]} style={{ width: 320 }}>
                            <Select
                                placeholder="Chọn sản phẩm vay"
                                options={loanProducts.map((product) => ({
                                    value: product.id,
                                    label: `#${product.id} - ${product.name}`,
                                }))}
                                onChange={onProductChange}
                                disabled
                            />
                        </Form.Item>
                        <Form.Item name="loan_product_name" hidden>
                            <Input />
                        </Form.Item>
                    </Space>

                    <Space align="start" style={{ width: '100%' }} size={16}>
                        <Form.Item label="Nhóm nợ từ Fineract" name="debt_group" rules={[{ required: true, message: 'Chọn debt_group' }]} style={{ width: 260 }}>
                            <Select
                                placeholder="Chọn debt_group"
                                options={selectableDebtGroups.map((group) => ({
                                    value: group.debt_group,
                                    label: `#${group.debt_group} - ${group.debt_group_name} (${formatDebtGroupDayRange(group.min_days, group.max_days)})`,
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

                    <Form.Item
                        label="Lưu vết quá hạn (tháng)"
                        name="retention_months"
                        tooltip="Số tháng lưu vết nợ quá hạn trong database. Sau khi hết hạn, bản ghi loan_delinquency sẽ chuyển isDeleted: true. Để trống = lưu vĩnh viễn (dùng train AI)."
                    >
                        <Input type="number" min={0} placeholder="VD: 12, 24, 60... (để trống = vĩnh viễn)" />
                    </Form.Item>

                    <Form.Item label="Mô tả policy" name="description">
                        <Input.TextArea rows={3} placeholder="Mô tả chính sách xử lý theo quy định nội bộ và pháp luật" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
