/**
 * Form bộ lọc khoản vay - dùng chung cho LoanTable (variant management)
 */
import { Form, Row, Col, Input, Select, InputNumber, Button, Space, DatePicker } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

export type LoanFilterFormProps = {
    form: ReturnType<typeof Form.useForm>[0];
    actionRef?: React.RefObject<{ reloadAndRest?: () => void } | undefined>;
    products: Array<{ id: number; name: string; shortName: string }>;
    ranges: Array<{ id: number; classification: string; minimumAgeDays?: number }>;
    activeTab: string;
};

export default function LoanFilterForm({ form, actionRef, products, ranges, activeTab }: LoanFilterFormProps) {
    const dateLabel = activeTab === 'pending' || activeTab === 'approved'
        ? 'Ngày nộp hồ sơ'
        : 'Ngày giải ngân';

    const handleFinish = () => {
        actionRef?.current?.reloadAndRest?.();
    };

    const handleReset = () => {
        form.resetFields();
        actionRef?.current?.reloadAndRest?.();
    };

    return (
        <div className="premium-filter-card" style={{ padding: 24 }}>
            <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: 'var(--text-color)' }}>
                Bộ lọc nâng cao
            </div>
            <Form form={form} layout="vertical" onFinish={handleFinish}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item name="keyword" label="Tìm kiếm" style={{ marginBottom: 0 }}>
                            <Input placeholder="Tên KH, username, #khoản vay" allowClear prefix={<SearchOutlined />} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item name="productId" label="Sản phẩm vay" style={{ marginBottom: 0 }}>
                            <Select placeholder="Tất cả sản phẩm" allowClear options={products.map((p) => ({ value: p.id, label: p.shortName || p.name }))} />
                        </Form.Item>
                    </Col>
                    {activeTab === 'overdue' && (
                        <Col xs={24} sm={12} md={6}>
                            <Form.Item name="classification" label="Nhóm quá hạn" style={{ marginBottom: 0 }}>
                                <Select placeholder="Tất cả nhóm" allowClear options={ranges.map((r) => ({ value: r.classification, label: r.classification }))} />
                            </Form.Item>
                        </Col>
                    )}
                    {(activeTab === 'overdue' || activeTab === 'all') && (
                        <>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="delinquentDaysMin" label="Số ngày quá hạn (từ)" style={{ marginBottom: 0 }}>
                                    <InputNumber min={0} placeholder="Từ" style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="delinquentDaysMax" label="Số ngày quá hạn (đến)" style={{ marginBottom: 0 }}>
                                    <InputNumber min={0} placeholder="Đến" style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="minOverdueAmount" label="Khoản quá hạn từ (₫)" style={{ marginBottom: 0 }}>
                                    <InputNumber min={0} placeholder="Từ" style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Form.Item name="maxOverdueAmount" label="Khoản quá hạn đến (₫)" style={{ marginBottom: 0 }}>
                                    <InputNumber min={0} placeholder="Đến" style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                                </Form.Item>
                            </Col>
                        </>
                    )}
                    <Col xs={24} sm={12} md={6}>
                        <Form.Item name="disbursementDate" label={dateLabel} style={{ marginBottom: 0 }}>
                            <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                    </Col>
                    
                    <Col xs={24} sm={12} md={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Form.Item style={{ marginBottom: 0 }}>
                            <Space>
                                <Button type="primary" htmlType="submit" icon={<SearchOutlined />} className="premium-btn-primary">
                                    Áp dụng
                                </Button>
                                <Button onClick={handleReset}>Xóa bộ lọc</Button>
                            </Space>
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </div>
    );
}
