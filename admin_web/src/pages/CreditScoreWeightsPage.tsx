import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, InputNumber, Progress, Row, Slider, Space, Typography, message } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
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

export default function CreditScoreWeightsPage() {
    const [form] = Form.useForm<FormValues>();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const loadData = async () => {
        setLoading(true);
        try {
            const config = await adminApi.getCreditScoreWeightConfig();
            form.setFieldsValue({
                paymentHistory: Number(config.paymentHistory || 0),
                debtLevel: Number(config.debtLevel || 0),
                creditAge: Number(config.creditAge || 0),
                creditMix: Number(config.creditMix || 0),
                newCredit: Number(config.newCredit || 0),
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

    const getValues = (): FormValues => {
        const current = form.getFieldsValue(FACTOR_KEYS) as Partial<FormValues>;
        return {
            paymentHistory: Number(current.paymentHistory || 0),
            debtLevel: Number(current.debtLevel || 0),
            creditAge: Number(current.creditAge || 0),
            creditMix: Number(current.creditMix || 0),
            newCredit: Number(current.newCredit || 0),
        };
    };

    const getMaxAllowedFor = (key: FactorKey): number => {
        const values = getValues();
        const otherTotal = FACTOR_KEYS.filter((k) => k !== key).reduce((sum, k) => sum + Number(values[k] || 0), 0);
        return Math.max(0, 100 - otherTotal);
    };

    const handleWeightChange = (key: FactorKey, next: number | null) => {
        const raw = Number(next ?? 0);
        const clamped = Math.max(0, Math.min(raw, 100));
        const allowedMax = getMaxAllowedFor(key);
        const safeValue = Number(Math.min(clamped, allowedMax).toFixed(1));
        form.setFieldValue(key, safeValue);
    };

    const onSave = async () => {
        try {
            const values = await form.validateFields();

            const safeTotal =
                Number(values.paymentHistory || 0) +
                Number(values.debtLevel || 0) +
                Number(values.creditAge || 0) +
                Number(values.creditMix || 0) +
                Number(values.newCredit || 0);

            if (safeTotal > 100.0001) {
                messageApi.error('Tổng trọng số không được vượt quá 100%');
                return;
            }

            setSaving(true);
            const updated = await adminApi.updateCreditScoreWeightConfig(values);
            form.setFieldsValue({
                paymentHistory: updated.paymentHistory,
                debtLevel: updated.debtLevel,
                creditAge: updated.creditAge,
                creditMix: updated.creditMix,
                newCredit: updated.newCredit,
            });
            messageApi.success('Đã lưu cấu hình trọng số điểm tín dụng');
        } catch (error: any) {
            if (error?.errorFields) return;
            messageApi.error(error?.response?.data?.message ?? 'Không thể cập nhật cấu hình trọng số');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {contextHolder}
            <PageHeader
                title="Trọng số điểm tín dụng"
                description="Chỉnh 5 yếu tố chấm điểm. Mỗi lần nhập/kéo sẽ bị chặn để tổng không vượt quá 100%."
                breadcrumb={[{ label: 'Cấu hình trọng số' }]}
                extra={
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} style={{ fontSize: 'var(--font-size-base)' }}>
                            Tải lại
                        </Button>
                        <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={saving || loading} style={{ fontSize: 'var(--font-size-base)' }}>
                            Lưu cấu hình
                        </Button>
                    </Space>
                }
            />

            <Card loading={loading}>
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }} align="middle">
                    <Col xs={24} md={8} style={{ display: 'flex', justifyContent: 'center' }}>
                        <Progress
                            type="circle"
                            style={{ fontSize: 'var(--font-size-xl)' }}
                            percent={Math.min(100, Number(total.toFixed(1)))}
                            format={() => `${total.toFixed(1)}%`}
                            strokeColor={total > 100 ? '#ff4d4f' : total === 100 ? '#52c41a' : '#1677ff'}
                            size={140}
                        />
                    </Col>
                    <Col xs={24} md={16}>
                        <Alert
                            type={Math.abs(total - 100) < 0.01 ? 'success' : 'warning'}
                            showIcon
                            message={<span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Tổng trọng số hiện tại: {total.toFixed(2)}%</span>}
                            description={
                                total < 100
                                    ? <span style={{ fontSize: 'var(--font-size-base)' }}>Bạn còn {Math.max(0, 100 - total).toFixed(2)}% để phân bổ.</span>
                                    : <span style={{ fontSize: 'var(--font-size-base)' }}>Đã phân bổ đủ 100%. Bạn có thể lưu cấu hình.</span>
                            }
                        />
                    </Col>
                </Row>

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 20 }}
                    message={<span style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>Quy tắc nhập</span>}
                    description={<span style={{ fontSize: 'var(--font-size-base)' }}>Mỗi ô sẽ tự giới hạn theo phần trăm còn lại, nên tổng sẽ không thể vượt quá 100%.</span>}
                />

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ paymentHistory: 35, debtLevel: 30, creditAge: 15, creditMix: 10, newCredit: 10 }}
                >
                    <Row gutter={[16, 16]}>
                        {FACTOR_ITEMS.map((item) => (
                            <Col span={24} key={item.key}>
                                <Card size="small">
                                    <Typography.Text strong style={{ fontSize: 'var(--font-size-md)' }}>{item.label}</Typography.Text>
                                    <Row gutter={12} align="middle" style={{ marginTop: 10 }}>
                                        <Col flex="auto">
                                            <Form.Item shouldUpdate noStyle>
                                                {() => {
                                                    const current = Number(form.getFieldValue(item.key) || 0);
                                                    const maxAllowed = getMaxAllowedFor(item.key);
                                                    return (
                                                        <Slider
                                                            min={0}
                                                            max={Math.max(current, maxAllowed)}
                                                            step={0.1}
                                                            value={current}
                                                            tooltip={{ formatter: (value) => `${value}%` }}
                                                            onChange={(value) => handleWeightChange(item.key, Number(value || 0))}
                                                        />
                                                    );
                                                }}
                                            </Form.Item>
                                        </Col>
                                        <Col>
                                            <Form.Item
                                                name={item.key}
                                                style={{ marginBottom: 0 }}
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
                                                    style={{ width: 120, fontSize: 'var(--font-size-base)' }}
                                                    addonAfter="%"
                                                    onChange={(value) => handleWeightChange(item.key, value)}
                                                />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Form>
            </Card>
        </div>
    );
}
