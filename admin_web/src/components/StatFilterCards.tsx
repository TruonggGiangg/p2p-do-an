/**
 * StatFilterCards — Premium banking-style stat cards with filter functionality
 *
 * Design: Modern fintech dashboard cards with strong visual hierarchy.
 * Active state: accent gradient top bar + elevated shadow + tinted background.
 * Inactive state: clean surface with colored icon badge + subtle hover lift.
 */
import type { ReactNode, CSSProperties } from 'react';
import { Row, Col, Typography, theme } from 'antd';

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
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {items.map((item) => {
                const isActive = activeKey === item.filterKey;

                const cardStyle: CSSProperties = {
                    borderRadius: 14,
                    padding: '20px 20px 18px',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    height: '100%',
                    transition: 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    border: isActive
                        ? `1.5px solid ${item.color}60`
                        : `1px solid ${token.colorBorderSecondary}`,
                    background: isActive
                        ? token.colorBgContainer
                        : token.colorBgContainer,
                    boxShadow: isActive
                        ? `0 8px 28px ${item.color}20, 0 2px 4px ${item.color}10`
                        : '0 1px 3px rgba(0,0,0,0.04)',
                    transform: isActive ? 'translateY(-3px)' : 'none',
                };



                /* Icon container */
                const iconWrapperStyle: CSSProperties = {
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 20,
                    transition: 'all 0.3s ease',
                    background: isActive
                        ? `${item.color}18`
                        : `${item.color}0C`,
                    color: item.color,
                    border: isActive
                        ? `1.5px solid ${item.color}30`
                        : `1px solid ${item.color}15`,
                    boxShadow: isActive
                        ? `inset 0 0 12px ${item.color}10`
                        : 'none',
                };

                return (
                    <Col {...span} key={item.filterKey}>
                        <div
                            style={cardStyle}
                            className={`stat-filter-card ${isActive ? 'active' : ''}`}
                            onClick={() => onChange(
                                isActive && item.filterKey !== 'all' ? 'all' : item.filterKey,
                            )}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    const el = e.currentTarget;
                                    el.style.transform = 'translateY(-4px)';
                                    el.style.boxShadow = `0 12px 24px rgba(0,0,0,0.08)`;
                                    el.style.borderColor = `${item.color}40`;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    const el = e.currentTarget;
                                    el.style.transform = 'none';
                                    el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                                    el.style.borderColor = token.colorBorderSecondary;
                                }
                            }}
                        >


                            {/* Content */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={iconWrapperStyle}>
                                    {item.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        style={{
                                            color: token.colorTextSecondary,
                                            fontSize: 12,
                                            fontWeight: 500,
                                            display: 'block',
                                            lineHeight: 1.3,
                                            marginBottom: 4,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            letterSpacing: '0.02em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {item.title}
                                    </Text>
                                    <Text
                                        strong
                                        style={{
                                            color: isActive ? item.color : token.colorText,
                                            fontSize: 26,
                                            fontWeight: 800,
                                            lineHeight: 1,
                                            display: 'block',
                                            fontFeatureSettings: '"tnum"',
                                            fontVariantNumeric: 'tabular-nums',
                                            transition: 'color 0.3s ease',
                                            letterSpacing: '-0.02em',
                                        }}
                                    >
                                        {item.value}
                                    </Text>
                                </div>
                            </div>
                        </div>
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
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {items.map((item, i) => (
                <Col {...span} key={i}>
                    <div
                        style={{
                            borderRadius: 14,
                            padding: '20px 20px 18px',
                            position: 'relative',
                            overflow: 'hidden',
                            height: '100%',
                            background: token.colorBgContainer,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                        className="stat-filter-card"
                    >


                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    background: `${item.color}0C`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: item.color,
                                    fontSize: 20,
                                    border: `1px solid ${item.color}15`,
                                }}
                            >
                                {item.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                    style={{
                                        color: token.colorTextSecondary,
                                        fontSize: 12,
                                        fontWeight: 500,
                                        display: 'block',
                                        lineHeight: 1.3,
                                        marginBottom: 4,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        letterSpacing: '0.02em',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {item.title}
                                </Text>
                                <Text
                                    strong
                                    style={{
                                        color: token.colorText,
                                        fontSize: 26,
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        display: 'block',
                                        fontFeatureSettings: '"tnum"',
                                        fontVariantNumeric: 'tabular-nums',
                                        letterSpacing: '-0.02em',
                                    }}
                                >
                                    {item.value}
                                </Text>
                            </div>
                        </div>
                    </div>
                </Col>
            ))}
        </Row>
    );
}
