import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Input, InputNumber, Progress, Row, Space, Switch, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import { adminApi } from '../api/admin';

const FACTOR_ITEMS = [
    { key: 'paymentHistory', label: 'Lịch sử thanh toán' },
    { key: 'debtLevel', label: 'Mức độ nợ hiện tại' },
    { key: 'creditAge', label: 'Độ tuổi tín dụng' },
    { key: 'creditMix', label: 'Đa dạng sản phẩm vay' },
    { key: 'newCredit', label: 'Tần suất mở khoản vay mới' },
] as const;

type FactorKey = (typeof FACTOR_ITEMS)[number]['key'];
const FACTOR_KEYS: FactorKey[] = FACTOR_ITEMS.map((item) => item.key);

type FormValues = Record<FactorKey, number>;
type CreateFormValues = FormValues & {
    name: string;
    description?: string;
    applyNow: boolean;
};

type WeightConfigItem = {
    _id: string;
    name: string;
    description?: string;
    isDefault: boolean;
    isActive: boolean;
    appliedAt?: string;
    paymentHistory: number;
    debtLevel: number;
    creditAge: number;
    creditMix: number;
    newCredit: number;
    total: number;
};

export default function CreditScoreWeightsPage() {
    const [form] = Form.useForm<CreateFormValues>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [configs, setConfigs] = useState<WeightConfigItem[]>([]);
    const [messageApi, contextHolder] = message.useMessage();

    const loadData = async () => {
        setLoading(true);
        try {
            const list = await adminApi.listCreditScoreWeightConfigs();
            setConfigs((list as WeightConfigItem[]) || []);

            const fallback = list.find((item) => item.isDefault) || list[0];
            form.setFieldsValue({
                name: '',
                description: '',
                applyNow: false,
                paymentHistory: Number(fallback?.paymentHistory ?? 35),
                debtLevel: Number(fallback?.debtLevel ?? 30),
                creditAge: Number(fallback?.creditAge ?? 15),
                creditMix: Number(fallback?.creditMix ?? 10),
                newCredit: Number(fallback?.newCredit ?? 10),
            });
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không tải được cấu hình trọng số');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const watched = Form.useWatch([], form) || {};
    const total = useMemo(() => {
        return FACTOR_ITEMS.reduce((sum, item) => sum + Number((watched as any)[item.key] || 0), 0);
    }, [watched]);

    const resetCreateForm = () => {
        form.setFieldsValue({
            name: '',
            description: '',
            applyNow: false,
            paymentHistory: 35,
            debtLevel: 30,
            creditAge: 15,
            creditMix: 10,
            newCredit: 10,
        });
    };

    const onCreate = async () => {
        try {
            const values = await form.validateFields();

            const safeTotal = FACTOR_KEYS.reduce((sum, key) => sum + Number((values as any)[key] || 0), 0);
            if (Math.abs(safeTotal - 100) > 0.01) {
                messageApi.error('Tổng trọng số phải đúng 100%');
                return;
            }

            setSaving(true);

            const created = await adminApi.createCreditScoreWeightConfig({
                name: values.name,
                description: values.description,
                paymentHistory: Number(values.paymentHistory || 0),
                debtLevel: Number(values.debtLevel || 0),
                creditAge: Number(values.creditAge || 0),
                creditMix: Number(values.creditMix || 0),
                newCredit: Number(values.newCredit || 0),
            });

            if (values.applyNow && created?._id) {
                await adminApi.applyCreditScoreWeightConfig(created._id);
            }

            messageApi.success(values.applyNow ? 'Đã tạo và áp dụng cấu hình' : 'Đã tạo cấu hình trọng số');
            resetCreateForm();
            await loadData();
        } catch (error: any) {
            if (error?.errorFields) return;
            messageApi.error(error?.response?.data?.message ?? 'Không thể tạo cấu hình trọng số');
        } finally {
            setSaving(false);
        }
    };

    const handleApply = async (id: string) => {
        try {
            setApplyingId(id);
            await adminApi.applyCreditScoreWeightConfig(id);
            messageApi.success('Đã áp dụng cấu hình điểm tín dụng');
            await loadData();
        } catch (error: any) {
            messageApi.error(error?.response?.data?.message ?? 'Không thể áp dụng cấu hình');
        } finally {
            setApplyingId(null);
        }
    };

    return (
        <div>
            {contextHolder}
            <PageHeader
                title="Trọng số điểm tín dụng"
                description="Tạo nhiều bộ cấu hình trọng số và áp dụng bộ mặc định để dùng cho chấm điểm tín dụng."
                breadcrumb={[{ label: 'Cấu hình trọng số' }]}
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} style={{ fontSize: 'var(--font-size-base)' }}>
                            Tải lại
                        </Button>
                    </Space>
                }
            />

            <Card loading={loading} style={{ marginBottom: 16 }}>
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }} align="middle">
                    <Col xs={24} md={8} style={{ display: 'flex', justifyContent: 'center' }}>
                        <Progress
                            type="circle"
                            style={{ fontSize: 'var(--font-size-xl)' }}
                            percent={Math.min(100, Number(total.toFixed(1)))}
                            format={() => `${total.toFixed(1)}%`}
                            strokeColor={Math.abs(total - 100) < 0.01 ? '#52c41a' : '#1677ff'}
                            size={140}
                        />
                    </Col>
                    <Col xs={24} md={16}>
                        <Alert
                            type={Math.abs(total - 100) < 0.01 ? 'success' : 'error'}
                            showIcon
                            message={<span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Tổng trọng số hiện tại: {total.toFixed(2)}%</span>}
                            description={
                                Math.abs(total - 100) < 0.01
                                    ? <span style={{ fontSize: 'var(--font-size-base)' }}>Đúng 100%. Có thể tạo cấu hình.</span>
                                    : <span style={{ fontSize: 'var(--font-size-base)' }}>Tổng phải bằng 100% để tạo cấu hình.</span>
                            }
                        />
                    </Col>
                </Row>

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 20 }}
                    message={<span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Tạo cấu hình mới</span>}
                    description={<span style={{ fontSize: 'var(--font-size-base)' }}>Nhập trực tiếp từng tỷ lệ % trên input. Tổng bắt buộc đúng 100%.</span>}
                />

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        name: '',
                        description: '',
                        applyNow: false,
                        paymentHistory: 35,
                        debtLevel: 30,
                        creditAge: 15,
                        creditMix: 10,
                        newCredit: 10,
                    }}
                >
                    <Row gutter={[12, 12]}>
                        <Col xs={24} md={10}>
                            <Form.Item
                                name="name"
                                label="Tên cấu hình"
                                rules={[
                                    { required: true, message: 'Vui lòng nhập tên cấu hình' },
                                    { max: 120, message: 'Tên tối đa 120 ký tự' },
                                ]}
                            >
                                <Input placeholder="Ví dụ: Cấu hình mùa cao điểm" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={10}>
                            <Form.Item name="description" label="Mô tả">
                                <Input placeholder="Mô tả ngắn cho cấu hình" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                            <Form.Item name="applyNow" label="Áp dụng" valuePropName="checked">
                                <Switch checkedChildren="Ngay" unCheckedChildren="Không" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={[16, 16]}>
                        {FACTOR_ITEMS.map((item) => (
                            <Col xs={24} md={12} lg={8} key={item.key}>
                                <Card size="small">
                                    <Typography.Text strong style={{ fontSize: 'var(--font-size-md)' }}>{item.label}</Typography.Text>
                                    <Form.Item
                                        name={item.key}
                                        style={{ marginTop: 10, marginBottom: 0 }}
                                        rules={[
                                            { required: true, message: 'Vui lòng nhập trọng số' },
                                            { type: 'number', min: 0, max: 100, message: 'Giá trị hợp lệ từ 0 đến 100' },
                                        ]}
                                    >
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            step={0.1}
                                            controls
                                            style={{ width: '100%', fontSize: 'var(--font-size-base)' }}
                                            addonAfter="%"
                                        />
                                    </Form.Item>
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    <Space style={{ marginTop: 16 }}>
                        <Button type="primary" icon={<SaveOutlined />} onClick={onCreate} loading={saving || loading}>
                            Tạo cấu hình
                        </Button>
                        <Button onClick={resetCreateForm}>Nhập lại</Button>
                    </Space>
                </Form>
            </Card>

            <Card loading={loading} title="Danh sách cấu hình trọng số">
                <Row gutter={[16, 16]}>
                    {configs.map((config) => (
                        <Col span={24} key={config._id}>
                            <Card
                                size="small"
                                title={
                                    <Space size={8} wrap>
                                        <Typography.Text strong>{config.name}</Typography.Text>
                                        {config.isDefault ? (
                                            <Tag color="success" icon={<CheckCircleOutlined />}>
                                                Đang áp dụng
                                            </Tag>
                                        ) : null}
                                        <Badge status={config.isActive ? 'processing' : 'default'} text={config.isActive ? 'Đang hoạt động' : 'Vô hiệu'} />
                                    </Space>
                                }
                                extra={<Typography.Text strong>{Number(config.total || 0).toFixed(1)}%</Typography.Text>}
                                styles={{ body: { paddingTop: 14, paddingBottom: 14 } }}
                            >
                                <Row gutter={[12, 12]} align="middle">
                                    <Col xs={24} xl={18}>
                                        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                                            {config.description || 'Không có mô tả'}
                                        </Typography.Paragraph>
                                        <Space size={[8, 8]} wrap>
                                            {FACTOR_ITEMS.map((factor) => (
                                                <Tag key={factor.key} color="blue" style={{ marginInlineEnd: 0 }}>
                                                    <span style={{ fontWeight: 500 }}>{factor.label}:</span>{' '}
                                                    <span style={{ fontWeight: 700 }}>{Number((config as any)[factor.key] || 0).toFixed(1)}%</span>
                                                </Tag>
                                            ))}
                                        </Space>
                                    </Col>
                                    <Col xs={24} xl={6} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <Button
                                            type={config.isDefault ? 'default' : 'primary'}
                                            disabled={config.isDefault || !config.isActive}
                                            loading={applyingId === config._id}
                                            onClick={() => handleApply(config._id)}
                                        >
                                            {config.isDefault ? 'Đang áp dụng' : 'Áp dụng'}
                                        </Button>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </Card>
        </div>
    );
}
