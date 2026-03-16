/**
 * StatFilterCards — Compact banking-style stat cards with filter functionality
 * 
 * Design: Compact inline stat with colored dot indicator + clean typography.
 * Active state: gradient pill. Inactive: subtle surface with left accent.
 */
import type { ReactNode, CSSProperties } from 'react';
import { Row, Col, Card, Typography, theme } from 'antd';

const { Text } = Typography;

export type StatFilterItem = {
    filterKey: string;
    title: string;
    value: number | string;
    color: string;
    gradient: string;
    icon: ReactNode;
};

type Props = {
    items: StatFilterItem[];
    activeKey: string;
    onChange: (key: string) => void;
    colSpan?: { xs?: number; sm?: number; md?: number; lg?: number };
};

export default function StatFilterCards({ items, activeKey, onChange, colSpan }: Props) {
    const { token } = theme.useToken();
    const defaultSpan = {
        xs: 12,
        sm: 12,
        md: Math.min(8, Math.floor(24 / items.length) || 6),
        lg: Math.floor(24 / items.length) || 4,
    };
    const span = { ...defaultSpan, ...colSpan };

    return (
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
            {items.map((item) => {
                const isActive = activeKey === item.filterKey;

                const activeStyle: CSSProperties = {
                    background: item.gradient,
                    boxShadow: `0 4px 14px ${item.color}30`,
                    transform: 'translateY(-2px)',
                };

                const inactiveStyle: CSSProperties = {
                    background: token.colorBgContainer,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    borderLeft: `3px solid ${item.color}`,
                };

                const cardStyle: CSSProperties = {
                    borderRadius: 10,
                    height: '100%',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: 'none',
                    overflow: 'hidden',
                    ...(isActive ? activeStyle : inactiveStyle),
                };

                const iconColor = isActive ? '#fff' : item.color;
                const titleColor = isActive ? 'rgba(255,255,255,0.85)' : token.colorTextSecondary;
                const valueColor = isActive ? '#fff' : token.colorText;

                return (
                    <Col {...span} key={item.filterKey}>
                        <Card
                            bordered={false}
                            onClick={() => onChange(
                                isActive && item.filterKey !== 'all' ? 'all' : item.filterKey,
                            )}
                            style={cardStyle}
                            styles={{ body: { padding: '12px 14px' } }}
                            className="stat-filter-card"
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        background: isActive ? 'rgba(255,255,255,0.18)' : `${item.color}12`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        color: iconColor,
                                        fontSize: 16,
                                        transition: 'all 0.25s ease',
                                    }}
                                >
                                    {item.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        style={{
                                            color: titleColor,
                                            fontSize: 11,
                                            fontWeight: 500,
                                            display: 'block',
                                            lineHeight: 1.2,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            transition: 'color 0.25s ease',
                                        }}
                                    >
                                        {item.title}
                                    </Text>
                                    <Text
                                        strong
                                        style={{
                                            color: valueColor,
                                            fontSize: 22,
                                            fontWeight: 700,
                                            lineHeight: 1.1,
                                            display: 'block',
                                            fontFeatureSettings: '"tnum"',
                                            fontVariantNumeric: 'tabular-nums',
                                            transition: 'color 0.25s ease',
                                        }}
                                    >
                                        {item.value}
                                    </Text>
                                </div>
                            </div>
                        </Card>
                    </Col>
                );
            })}
        </Row>
    );
}

/**
 * StatDisplayCards — Non-interactive stat cards (for pages without filter)
 */
export function StatDisplayCards({ items, colSpan }: {
    items: Array<{
        title: string;
        value: number | string;
        color: string;
        gradient: string;
        icon: ReactNode;
    }>;
    colSpan?: { xs?: number; sm?: number; md?: number; lg?: number };
}) {
    const { token } = theme.useToken();
    const defaultSpan = {
        xs: 12,
        sm: 12,
        md: Math.min(8, Math.floor(24 / items.length) || 6),
        lg: Math.floor(24 / items.length) || 4,
    };
    const span = { ...defaultSpan, ...colSpan };

    return (
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
            {items.map((item, i) => (
                <Col {...span} key={i}>
                    <Card
                        bordered={false}
                        style={{
                            borderRadius: 10,
                            height: '100%',
                            background: token.colorBgContainer,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            border: 'none',
                            borderLeft: `3px solid ${item.color}`,
                        }}
                        styles={{ body: { padding: '12px 14px' } }}
                        className="stat-filter-card"
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    background: `${item.color}12`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: item.color,
                                    fontSize: 16,
                                }}
                            >
                                {item.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                    style={{
                                        color: token.colorTextSecondary,
                                        fontSize: 11,
                                        fontWeight: 500,
                                        display: 'block',
                                        lineHeight: 1.2,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {item.title}
                                </Text>
                                <Text
                                    strong
                                    style={{
                                        color: token.colorText,
                                        fontSize: 22,
                                        fontWeight: 700,
                                        lineHeight: 1.1,
                                        display: 'block',
                                        fontFeatureSettings: '"tnum"',
                                        fontVariantNumeric: 'tabular-nums',
                                    }}
                                >
                                    {item.value}
                                </Text>
                            </div>
                        </div>
                    </Card>
                </Col>
            ))}
        </Row>
    );
}
