import { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Button, Card, Col, Form, InputNumber, Row, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, HistoryOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import { adminApi } from '../api/admin';

type LoanRiskFormValues = {
    autoApprovalScore: number;
    lowRiskMaxScore: number;
    mediumRiskMaxScore: number;
    highRiskMaxScore: number;
    lowRiskMaxAmount: number;
    mediumRiskMaxAmount: number;
    highRiskMaxAmount: number;
};

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
});

export default function LoanEvaluationConfigPage() {
    const [form] = Form.useForm<LoanRiskFormValues>();
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | undefined>();
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const values = Form.useWatch([], form) as Partial<LoanRiskFormValues> | undefined;

    const defaultValues: LoanRiskFormValues = {
        autoApprovalScore: 82,
        lowRiskMaxScore: 100,
        mediumRiskMaxScore: 79,
        highRiskMaxScore: 59,
        lowRiskMaxAmount: 50000000,
        mediumRiskMaxAmount: 20000000,
        highRiskMaxAmount: 8000000,
    };

    // Fetch current config from server
    const fetchConfig = useCallback(async () => {
        try {
            setLoading(true);
            const data = await adminApi.getLoanEvaluationConfig();
            if (data) {
                form.setFieldsValue({
                    autoApprovalScore: data.autoApprovalScore,
                    lowRiskMaxScore: data.lowRiskMaxScore,
                    mediumRiskMaxScore: data.mediumRiskMaxScore,
                    highRiskMaxScore: data.highRiskMaxScore,
                    lowRiskMaxAmount: data.lowRiskMaxAmount,
                    mediumRiskMaxAmount: data.mediumRiskMaxAmount,
                    highRiskMaxAmount: data.highRiskMaxAmount,
                });
                setLastUpdated(data.updatedAt);
            }
        } catch {
            // Server chưa có config → dùng default
        } finally {
            setLoading(false);
        }
    }, [form]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const riskPreview = useMemo(() => {
        const v = { ...defaultValues, ...(values || {}) };
        return [
            {
                label: 'Rủi ro thấp',
                color: 'green',
                scoreText: `${v.mediumRiskMaxScore + 1} - ${v.lowRiskMaxScore} điểm`,
                amountText: `<= ${currencyFormatter.format(v.lowRiskMaxAmount)}`,
            },
            {
                label: 'Rủi ro trung bình',
                color: 'gold',
                scoreText: `${v.highRiskMaxScore + 1} - ${v.mediumRiskMaxScore} điểm`,
                amountText: `<= ${currencyFormatter.format(v.mediumRiskMaxAmount)}`,
            },
            {
                label: 'Rủi ro cao',
                color: 'red',
                scoreText: `0 - ${v.highRiskMaxScore} điểm`,
                amountText: `<= ${currencyFormatter.format(v.highRiskMaxAmount)}`,
            },
        ];
    }, [values]);

    const handleSave = async () => {
        try {
            const fieldValues = await form.validateFields();
            if (!(fieldValues.lowRiskMaxScore > fieldValues.mediumRiskMaxScore && fieldValues.mediumRiskMaxScore > fieldValues.highRiskMaxScore)) {
                messageApi.error('Ngưỡng điểm phải theo thứ tự: Thấp > Trung bình > Cao');
                return;
            }

            if (!(fieldValues.lowRiskMaxAmount >= fieldValues.mediumRiskMaxAmount && fieldValues.mediumRiskMaxAmount >= fieldValues.highRiskMaxAmount)) {
                messageApi.error('Ngưỡng khoản vay phải theo thứ tự: Thấp >= Trung bình >= Cao');
                return;
            }

            setSaving(true);
            const data = await adminApi.upsertLoanEvaluationConfig(fieldValues);
            setLastUpdated(data.updatedAt);
            messageApi.success('Đã lưu cấu hình đánh giá khoản vay thành công');
        } catch (err: any) {
            messageApi.error(err?.response?.data?.message || 'Lưu cấu hình thất bại');
        } finally {
            setSaving(false);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const data = await adminApi.getLoanEvaluationConfigHistory(1, 20);
            setHistory(data.items);
        } catch {
            messageApi.error('Không thể tải lịch sử thay đổi');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleToggleHistory = () => {
        const next = !showHistory;
        setShowHistory(next);
        if (next && history.length === 0) fetchHistory();
    };

    const historyColumns = [
        {
            title: 'Thời gian',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (v: string) => v ? new Date(v).toLocaleString('vi-VN') : '-',
        },
        { title: 'Điểm tự động duyệt', dataIndex: 'autoApprovalScore', key: 'autoApprovalScore' },
        {
            title: 'Rủi ro thấp',
            key: 'low',
            render: (_: any, r: any) => `${r.lowRiskMaxScore} điểm / ${currencyFormatter.format(r.lowRiskMaxAmount)}`,
        },
        {
            title: 'Rủi ro TB',
            key: 'medium',
            render: (_: any, r: any) => `${r.mediumRiskMaxScore} điểm / ${currencyFormatter.format(r.mediumRiskMaxAmount)}`,
        },
        {
            title: 'Rủi ro cao',
            key: 'high',
            render: (_: any, r: any) => `${r.highRiskMaxScore} điểm / ${currencyFormatter.format(r.highRiskMaxAmount)}`,
        },
    ];

    return (
        <div>
            {contextHolder}
            <PageHeader
                title="Cấu hình đánh giá khoản vay"
                description="Thiết lập ngưỡng điểm và ngưỡng khoản vay cho các mức rủi ro, đồng thời quy định điểm tự động duyệt."
                breadcrumb={[{ label: 'Cấu hình đánh giá khoản vay' }]}
                helpTooltip="Cấu hình này được lưu vào database và áp dụng cho toàn hệ thống."
            />

            {lastUpdated && (
                <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`Cập nhật lần cuối: ${new Date(lastUpdated).toLocaleString('vi-VN')}`}
                />
            )}

            <Spin spinning={loading}>
                <Form<LoanRiskFormValues>
                    form={form}
                    layout="vertical"
                    initialValues={defaultValues}
                >
                    <Row gutter={[16, 16]}>
                        <Col xs={24} xl={10}>
                            <Card
                                title={<Space><SafetyCertificateOutlined /> Quy tắc tự động duyệt</Space>}
                                style={{ height: '100%' }}
                            >
                                <Form.Item
                                    label="Ngưỡng điểm tự động duyệt khoản vay"
                                    name="autoApprovalScore"
                                    rules={[{ required: true, message: 'Nhập ngưỡng tự động duyệt' }, { type: 'number', min: 0, max: 100, message: 'Giá trị từ 0-100' }]}
                                >
                                    <InputNumber min={0} max={100} addonAfter="điểm" style={{ width: '100%' }} />
                                </Form.Item>

                                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                    Gợi ý: chỉ tự động duyệt khi điểm cao hơn ngưỡng và không vi phạm blacklist nội bộ.
                                </Typography.Paragraph>
                            </Card>
                        </Col>

                        <Col xs={24} xl={14}>
                            <Card
                                title="Ngưỡng đánh giá rủi ro"
                                style={{ height: '100%' }}
                                extra={<Tag color="blue">Mô hình chấm điểm 0-100</Tag>}
                            >
                                <Row gutter={[12, 12]}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Rủi ro thấp: điểm tối đa"
                                            name="lowRiskMaxScore"
                                            rules={[{ required: true, message: 'Nhập ngưỡng điểm' }, { type: 'number', min: 0, max: 100 }]}
                                        >
                                            <InputNumber min={0} max={100} addonAfter="điểm" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Rủi ro thấp: khoản vay tối đa"
                                            name="lowRiskMaxAmount"
                                            rules={[{ required: true, message: 'Nhập ngưỡng khoản vay' }, { type: 'number', min: 0 }]}
                                        >
                                            <InputNumber min={0} step={1000000} addonAfter="VND" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Rủi ro trung bình: điểm tối đa"
                                            name="mediumRiskMaxScore"
                                            rules={[{ required: true, message: 'Nhập ngưỡng điểm' }, { type: 'number', min: 0, max: 100 }]}
                                        >
                                            <InputNumber min={0} max={100} addonAfter="điểm" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Rủi ro trung bình: khoản vay tối đa"
                                            name="mediumRiskMaxAmount"
                                            rules={[{ required: true, message: 'Nhập ngưỡng khoản vay' }, { type: 'number', min: 0 }]}
                                        >
                                            <InputNumber min={0} step={1000000} addonAfter="VND" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Rủi ro cao: điểm tối đa"
                                            name="highRiskMaxScore"
                                            rules={[{ required: true, message: 'Nhập ngưỡng điểm' }, { type: 'number', min: 0, max: 100 }]}
                                        >
                                            <InputNumber min={0} max={100} addonAfter="điểm" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Rủi ro cao: khoản vay tối đa"
                                            name="highRiskMaxAmount"
                                            rules={[{ required: true, message: 'Nhập ngưỡng khoản vay' }, { type: 'number', min: 0 }]}
                                        >
                                            <InputNumber min={0} step={1000000} addonAfter="VND" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>
                    </Row>

                    <Card title="Xem trước phân loại" style={{ marginTop: 16 }}>
                        <Row gutter={[12, 12]}>
                            {riskPreview.map((risk) => (
                                <Col xs={24} md={8} key={risk.label}>
                                    <Card size="small" style={{ borderRadius: 12 }}>
                                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                            <Tag color={risk.color} style={{ width: 'fit-content' }}>{risk.label}</Tag>
                                            <Typography.Text strong>{risk.scoreText}</Typography.Text>
                                            <Typography.Text type="secondary">Khoản vay đề xuất: {risk.amountText}</Typography.Text>
                                        </Space>
                                    </Card>
                                </Col>
                            ))}
                        </Row>

                        <Space style={{ marginTop: 16 }}>
                            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleSave} loading={saving}>
                                Lưu cấu hình
                            </Button>
                            <Button onClick={() => form.resetFields()}>Khôi phục mặc định</Button>
                            <Button icon={<HistoryOutlined />} onClick={handleToggleHistory}>
                                {showHistory ? 'Ẩn lịch sử' : 'Lịch sử thay đổi'}
                            </Button>
                        </Space>
                    </Card>

                    {showHistory && (
                        <Card title="Lịch sử thay đổi cấu hình" style={{ marginTop: 16 }}>
                            <Table
                                dataSource={history}
                                columns={historyColumns}
                                rowKey="_id"
                                loading={historyLoading}
                                pagination={false}
                                size="small"
                            />
                        </Card>
                    )}
                </Form>
            </Spin>
        </div>
    );
}
