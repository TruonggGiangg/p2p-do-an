/**
 * LoanPageShell - Layout thống nhất cho Quản lý khoản vay & Phê duyệt khoản vay
 * Khác nhau: giai đoạn lọc ban đầu + chức năng riêng từng page
 * UI/UX chuyên nghiệp phục vụ doanh nghiệp hiện đại
 */
import type { ReactNode } from 'react';
import { Breadcrumb, Typography, Row, Col, Card, Space, theme, Tooltip } from 'antd';
import { HomeOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

const { Text } = Typography;

export type StatCard = {
    key: string;
    title: string;
    value: number | string;
    formatter?: (v: number) => string;
    gradient: string;
    icon?: ReactNode;
};

export type LoanPageShellProps = {
    /** Tiêu đề trang */
    title: string;
    /** Mô tả ngắn (hiển thị dưới tiêu đề) */
    description?: string;
    /** Breadcrumb items: [{ label, path? }] */
    breadcrumb?: Array<{ label: string; path?: string }>;
    /** Các thẻ thống kê */
    stats: StatCard[];
    /** Nội dung chính (tabs + filter + table) */
    children: ReactNode;
    /** Tooltip cho mô tả */
    helpTooltip?: string;
};

export default function LoanPageShell({
    title,
    description,
    breadcrumb = [],
    stats,
    children,
    helpTooltip,
}: LoanPageShellProps) {
    const { token } = theme.useToken();
    const statSpan = stats.length >= 5 ? 4 : stats.length === 4 ? 6 : stats.length === 3 ? 8 : 12;

    return (
        <div style={{ padding: 0 }}>
            {/* Breadcrumb */}
            {breadcrumb.length > 0 && (
                <Breadcrumb
                    style={{ marginBottom: 16 }}
                    items={[
                        { title: <Link to="/"><HomeOutlined /> Trang chủ</Link> },
                        ...breadcrumb.map((b) => ({
                            title: b.path ? <Link to={b.path}>{b.label}</Link> : b.label,
                        })),
                    ]}
                />
            )}

            {/* Page Header */}
            <div style={{ marginBottom: 24 }}>
                <Space align="start" size={12}>
                    <Typography.Title level={3} style={{ margin: 0, fontWeight: 700 }}>
                        {title}
                    </Typography.Title>
                    {helpTooltip && (
                        <Tooltip title={helpTooltip}>
                            <InfoCircleOutlined style={{ color: token.colorTextSecondary, fontSize: 16, marginTop: 6 }} />
                        </Tooltip>
                    )}
                </Space>
                {description && (
                    <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 14 }}>
                        {description}
                    </Text>
                )}
            </div>

            {/* Stats Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {stats.map((s) => (
                    <Col xs={24} sm={12} md={8} lg={statSpan} key={s.key}>
                        <Card
                            bordered={false}
                            style={{
                                background: s.gradient,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                height: '100%',
                                minHeight: 100,
                            }}
                            bodyStyle={{ padding: '20px 24px' }}
                        >
                            <Space align="center" size={16} style={{ width: '100%' }}>
                                {s.icon && (
                                    <div style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 8,
                                        background: 'rgba(255,255,255,0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}>
                                        {s.icon}
                                    </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        style={{
                                            color: 'rgba(255,255,255,0.9)',
                                            fontSize: 13,
                                            display: 'block',
                                            minHeight: 36,
                                            lineHeight: 1.35,
                                        }}
                                    >
                                        {s.title}
                                    </Text>
                                    <Typography.Text
                                        strong
                                        style={{
                                            color: '#fff',
                                            fontSize: 26,
                                            fontWeight: 700,
                                            lineHeight: 1.15,
                                            minHeight: 32,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: 'block',
                                        }}
                                    >
                                        {typeof s.value === 'number' && s.formatter
                                            ? s.formatter(s.value)
                                            : s.value}
                                    </Typography.Text>
                                </div>
                            </Space>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Main content: tabs, filters, table */}
            {children}
        </div>
    );
}
