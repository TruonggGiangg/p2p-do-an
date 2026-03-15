/**
 * PageSkeleton - Skeleton loading chung cho tất cả pages
 * Bao gồm: StatCardsSkeleton, TableSkeleton, DetailSkeleton
 */
import { Skeleton, Card, Row, Col, Space, Divider } from 'antd';

/* ════════════ STAT CARDS SKELETON ════════════ */

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
    const span = count >= 5 ? 4 : count === 4 ? 6 : count === 3 ? 8 : 12;
    const gradients = [
        'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
        'linear-gradient(135deg, #059669 0%, #047857 100%)',
        'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
        'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
        'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    ];
    return (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {Array.from({ length: count }).map((_, i) => (
                <Col xs={24} sm={12} md={8} lg={span} key={i}>
                    <Card
                        bordered={false}
                        style={{
                            background: gradients[i % gradients.length],
                            minHeight: 100,
                            height: '100%',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}
                        styles={{ body: { padding: '20px 24px' } }}
                    >
                        <Space align="center" size={16} style={{ width: '100%' }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 8,
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Skeleton.Avatar active shape="square" size={24} style={{ background: 'rgba(255,255,255,0.3)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ width: 80, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.3)', marginBottom: 8 }} />
                                <div style={{ width: 50, height: 26, borderRadius: 4, background: 'rgba(255,255,255,0.4)' }} />
                            </div>
                        </Space>
                    </Card>
                </Col>
            ))}
        </Row>
    );
}

/* ════════════ TABLE SKELETON ════════════ */

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
    return (
        <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} styles={{ body: { padding: 0 } }}>
            {/* Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Skeleton.Input active size="small" style={{ width: 200, height: 22 }} />
                    <Space>
                        <Skeleton.Button active size="small" style={{ width: 100 }} />
                        <Skeleton.Button active size="small" style={{ width: 100 }} />
                    </Space>
                </Space>
            </div>
            {/* Table header row */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
                <Row gutter={16}>
                    {Array.from({ length: columns }).map((_, i) => (
                        <Col flex={i === 0 ? '60px' : '1'} key={i}>
                            <Skeleton.Input active size="small" style={{ width: i === 0 ? 30 : '80%', height: 14 }} />
                        </Col>
                    ))}
                </Row>
            </div>
            {/* Table rows */}
            {Array.from({ length: rows }).map((_, row) => (
                <div key={row} style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
                    <Row gutter={16} align="middle">
                        {Array.from({ length: columns }).map((_, col) => (
                            <Col flex={col === 0 ? '60px' : '1'} key={col}>
                                {col === 1 ? (
                                    <Space>
                                        <Skeleton.Avatar active size={32} />
                                        <Skeleton.Input active size="small" style={{ width: 120, height: 16 }} />
                                    </Space>
                                ) : col === columns - 1 ? (
                                    <Space>
                                        <Skeleton.Button active size="small" shape="circle" style={{ width: 28, height: 28 }} />
                                        <Skeleton.Button active size="small" shape="circle" style={{ width: 28, height: 28 }} />
                                    </Space>
                                ) : (
                                    <Skeleton.Input active size="small" style={{ width: col === 0 ? 30 : `${50 + Math.random() * 50}%`, height: 16 }} />
                                )}
                            </Col>
                        ))}
                    </Row>
                </div>
            ))}
            {/* Pagination */}
            <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'flex-end' }}>
                <Space>
                    <Skeleton.Input active size="small" style={{ width: 100, height: 24 }} />
                    <Skeleton.Button active size="small" style={{ width: 32, height: 32 }} />
                    <Skeleton.Button active size="small" style={{ width: 32, height: 32 }} />
                    <Skeleton.Button active size="small" style={{ width: 32, height: 32 }} />
                </Space>
            </div>
        </Card>
    );
}

/* ════════════ DETAIL PAGE SKELETON ════════════ */

export function DetailSkeleton() {
    return (
        <div>
            {/* Back button */}
            <Skeleton.Button active size="small" style={{ width: 140, height: 32, marginBottom: 24 }} />

            {/* Profile Card */}
            <Card bordered={false} style={{ marginBottom: 24 }}>
                <Row gutter={24} align="middle">
                    <Col>
                        <Skeleton.Avatar active size={80} />
                    </Col>
                    <Col flex="1">
                        <Skeleton.Input active style={{ width: 200, height: 24, marginBottom: 8 }} />
                        <Skeleton.Input active size="small" style={{ width: 300, height: 16, marginBottom: 8 }} />
                        <Space>
                            <Skeleton.Button active size="small" style={{ width: 80, height: 22 }} />
                            <Skeleton.Button active size="small" style={{ width: 80, height: 22 }} />
                        </Space>
                    </Col>
                </Row>
            </Card>

            {/* Tabs */}
            <Card bordered={false}>
                <Space style={{ marginBottom: 24 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton.Button active size="small" style={{ width: 90, height: 32 }} key={i} />
                    ))}
                </Space>
                <Divider style={{ margin: '0 0 24px' }} />

                {/* Info rows */}
                <Row gutter={[24, 16]}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Col xs={24} sm={12} key={i}>
                            <Skeleton.Input active size="small" style={{ width: 100, height: 14, marginBottom: 6 }} />
                            <Skeleton.Input active size="small" style={{ width: '80%', height: 18 }} />
                        </Col>
                    ))}
                </Row>
            </Card>
        </div>
    );
}

/* ════════════ COMBINED: STAT + TABLE SKELETON ════════════ */

export function PageWithStatsSkeleton({ statCount = 4, tableRows = 5, tableColumns = 6 }: {
    statCount?: number;
    tableRows?: number;
    tableColumns?: number;
}) {
    return (
        <div>
            <StatCardsSkeleton count={statCount} />
            <TableSkeleton rows={tableRows} columns={tableColumns} />
        </div>
    );
}

/* ════════════ SIMPLE TABLE PAGE SKELETON ════════════ */

export function SimplePageSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
    return <TableSkeleton rows={rows} columns={columns} />;
}

/* ════════════ ROLES & PERMISSIONS SKELETON ════════════ */

export function RolesPermissionsSkeleton() {
    return (
        <div>
            {/* Roles table */}
            <Card bordered={false} style={{ marginBottom: 24 }} styles={{ body: { padding: 0 } }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                            <Skeleton.Avatar active shape="square" size={20} />
                            <Skeleton.Input active size="small" style={{ width: 140, height: 20 }} />
                        </Space>
                        <Space>
                            <Skeleton.Input active size="small" style={{ width: 180, height: 32 }} />
                            <Skeleton.Button active style={{ width: 100, height: 32 }} />
                        </Space>
                    </Space>
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} style={{ padding: '14px 24px', borderBottom: '1px solid #f0f0f0' }}>
                        <Row gutter={16} align="middle">
                            <Col flex="60px"><Skeleton.Input active size="small" style={{ width: 24, height: 16 }} /></Col>
                            <Col flex="1"><Skeleton.Button active size="small" style={{ width: 100, height: 24 }} /></Col>
                            <Col flex="2"><Skeleton.Input active size="small" style={{ width: '60%', height: 16 }} /></Col>
                            <Col flex="100px"><Skeleton.Button active size="small" style={{ width: 70, height: 22 }} /></Col>
                            <Col flex="140px"><Skeleton.Input active size="small" style={{ width: 100, height: 16 }} /></Col>
                            <Col flex="200px">
                                <Space>
                                    <Skeleton.Button active size="small" style={{ width: 80, height: 28 }} />
                                    <Skeleton.Button active size="small" shape="circle" style={{ width: 28, height: 28 }} />
                                    <Skeleton.Button active size="small" shape="circle" style={{ width: 28, height: 28 }} />
                                </Space>
                            </Col>
                        </Row>
                    </div>
                ))}
            </Card>

            {/* Permission section placeholder */}
            <Card bordered={false} styles={{ body: { padding: 48, textAlign: 'center' as const } }}>
                <Skeleton.Avatar active shape="square" size={48} style={{ marginBottom: 16 }} />
                <Skeleton.Input active size="small" style={{ width: 280, height: 16 }} />
            </Card>
        </div>
    );
}

/* ════════════ SYNC DRIFT SKELETON ════════════ */

export function SyncDriftSkeleton() {
    return (
        <div>
            {/* Alert */}
            <Card bordered={false} style={{ marginBottom: 24, background: '#e6f4ff' }}>
                <Skeleton active paragraph={{ rows: 2 }} />
            </Card>

            {/* Tabs + content */}
            <Card bordered={false}>
                <Space style={{ marginBottom: 16 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton.Button active size="small" style={{ width: 120, height: 32 }} key={i} />
                    ))}
                </Space>
                <Divider style={{ margin: '0 0 16px' }} />
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Row gutter={16} align="middle">
                            <Col flex="200px"><Skeleton.Input active size="small" style={{ width: 140, height: 16 }} /></Col>
                            <Col flex="1"><Skeleton.Input active size="small" style={{ width: '60%', height: 16 }} /></Col>
                            <Col flex="100px"><Skeleton.Button active size="small" style={{ width: 60, height: 22 }} /></Col>
                        </Row>
                    </div>
                ))}
            </Card>
        </div>
    );
}
/* ════════════ LOAN PAGE SHELL SKELETON ════════════ */
/* Dùng cho LoansPage, LoanApprovalsPage — khớp layout LoanPageShell */

const DEFAULT_GRADIENTS = [
    'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
    'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
    'linear-gradient(135deg, #059669 0%, #047857 100%)',
    'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)',
];

export function LoanPageShellSkeleton({ statCount = 5, tableRows = 6, tableColumns = 6, title, description, breadcrumbLabels }: {
    statCount?: number;
    tableRows?: number;
    tableColumns?: number;
    title?: string;
    description?: string;
    breadcrumbLabels?: string[];
}) {
    const span = statCount >= 5 ? 4 : statCount === 4 ? 6 : statCount === 3 ? 8 : 12;
    return (
        <div style={{ padding: 0 }}>
            {/* Breadcrumb */}
            {breadcrumbLabels && breadcrumbLabels.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <Space size={4}>
                        <Skeleton.Input active size="small" style={{ width: 80, height: 14 }} />
                        {breadcrumbLabels.map((_, i) => (
                            <Skeleton.Input active size="small" style={{ width: 100, height: 14 }} key={i} />
                        ))}
                    </Space>
                </div>
            )}
            {/* Title + Description */}
            <div style={{ marginBottom: 24 }}>
                {title ? (
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: 24 }}>{title}</h3>
                ) : (
                    <Skeleton.Input active style={{ width: 250, height: 28, marginBottom: 4 }} />
                )}
                {description ? (
                    <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14, display: 'block', marginTop: 4 }}>{description}</span>
                ) : (
                    <Skeleton.Input active size="small" style={{ width: 400, height: 16, marginTop: 4 }} />
                )}
            </div>
            {/* Stat Cards with gradients */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {Array.from({ length: statCount }).map((_, i) => (
                    <Col xs={24} sm={12} md={8} lg={span} key={i}>
                        <Card
                            bordered={false}
                            style={{
                                background: DEFAULT_GRADIENTS[i % DEFAULT_GRADIENTS.length],
                                minHeight: 100,
                                height: '100%',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            }}
                            styles={{ body: { padding: '20px 24px' } }}
                        >
                            <Space align="center" size={16} style={{ width: '100%' }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 8,
                                    background: 'rgba(255,255,255,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Skeleton.Avatar active shape="square" size={24} style={{ background: 'rgba(255,255,255,0.3)' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ width: 80, height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.3)', marginBottom: 8 }} />
                                    <div style={{ width: 50, height: 26, borderRadius: 4, background: 'rgba(255,255,255,0.4)' }} />
                                </div>
                            </Space>
                        </Card>
                    </Col>
                ))}
            </Row>
            {/* Table */}
            <TableSkeleton rows={tableRows} columns={tableColumns} />
        </div>
    );
}
