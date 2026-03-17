/**
 * PageHeader - Breadcrumb + Title + Description chung cho tất cả pages
 * Đồng bộ phong cách với LoanPageShell
 */
import { Breadcrumb, Typography, Space, Tooltip, theme } from 'antd';
import { HomeOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const { Text } = Typography;

export interface PageHeaderProps {
    /** Tiêu đề trang */
    title: string;
    /** Mô tả ngắn */
    description?: string;
    /** Breadcrumb items: [{ label, path? }] */
    breadcrumb?: Array<{ label: string; path?: string }>;
    /** Tooltip info */
    helpTooltip?: string;
    /** Extra content bên phải (buttons, etc.) */
    extra?: ReactNode;
}

export default function PageHeader({
    title,
    description,
    breadcrumb = [],
    helpTooltip,
    extra,
}: PageHeaderProps) {
    const { token } = theme.useToken();

    return (
        <div style={{ marginBottom: 24 }}>
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

            {/* Title row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <Space align="start" size={12}>
                        <Typography.Title
                            level={3}
                            style={{ margin: 0, fontWeight: 700, fontSize: 'var(--font-size-xl)', lineHeight: 1.25 }}
                        >
                            {title}
                        </Typography.Title>
                        {helpTooltip && (
                            <Tooltip title={helpTooltip}>
                                <InfoCircleOutlined style={{ color: token.colorTextSecondary, fontSize: 16, marginTop: 6 }} />
                            </Tooltip>
                        )}
                    </Space>
                    {description && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 'var(--font-size-base)' }}>
                            {description}
                        </Text>
                    )}
                </div>
                {extra && <div>{extra}</div>}
            </div>
        </div>
    );
}
