import { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Alert, Button, Card, Col, Divider, InputNumber, Progress, Row, Space, Spin, Table,
    Tag, Tooltip, Typography, message,
} from 'antd';
import {
    CheckCircleOutlined, CloseCircleOutlined, HistoryOutlined,
    LockOutlined, SafetyCertificateOutlined, PieChartOutlined,
} from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import { adminApi } from '../api/admin';
import type { CreditGradeDto, ScoreWeightsDto } from '../api/admin';

const FMT = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

const GRADE_COLORS: Record<string, string> = { A: 'green', B: 'blue', C: 'gold', D: 'red' };
const DEFAULT_GRADES: CreditGradeDto[] = [
    { grade: 'A', label: 'Rủi ro cực thấp', minScore: 80, maxScore: 100, maxLoanAmount: 100_000_000, baseInterestRate: 12 },
    { grade: 'B', label: 'Rủi ro trung bình', minScore: 60, maxScore: 79, maxLoanAmount: 50_000_000, baseInterestRate: 15 },
    { grade: 'C', label: 'Rủi ro cao', minScore: 40, maxScore: 59, maxLoanAmount: 20_000_000, baseInterestRate: 18 },
];
const DEFAULT_WEIGHTS: ScoreWeightsDto = { paymentHistory: 35, debtLevel: 30, creditAge: 15, creditMix: 10, newCredit: 10 };
const WEIGHT_LABELS: Record<keyof ScoreWeightsDto, string> = {
    paymentHistory: 'Lịch sử thanh toán',
    debtLevel: 'Dư nợ tín dụng',
    creditAge: 'Tuổi tín dụng',
    creditMix: 'Đa dạng tín dụng',
    newCredit: 'Tín dụng mới',
};

export default function LoanEvaluationConfigPage() {
    const [messageApi, ctx] = message.useMessage();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentVersion, setCurrentVersion] = useState(0);
    const [configHash, setConfigHash] = useState('');

    // ── Block 1 state ──
    const [autoReject, setAutoReject] = useState(40);
    const [autoApprove, setAutoApprove] = useState(80);

    // ── Block 2 state — credit grades ──
    const [grades, setGrades] = useState<CreditGradeDto[]>(DEFAULT_GRADES);

    // ── Block 3 state — weights ──
    const [weights, setWeights] = useState<ScoreWeightsDto>({ ...DEFAULT_WEIGHTS });

    // ── Block 4 state — history ──
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // ── Derived ──
    const manualZone = useMemo(() => ({ min: autoReject, max: autoApprove - 1 }), [autoReject, autoApprove]);
    const weightSum = useMemo(() => Object.values(weights).reduce((s, v) => s + (v || 0), 0), [weights]);

    /** Rebuild grade score ranges cascading from thresholds. Top grade maxScore=100, bottom grade minScore=autoReject. */
    const rebuildGrades = useCallback(
        (prev: CreditGradeDto[], newAutoApprove: number, newAutoReject: number): CreditGradeDto[] => {
            if (prev.length === 0) return prev;
            const sorted = [...prev].sort((a, b) => b.maxScore - a.maxScore);
            const result: CreditGradeDto[] = [];
            let cursor = 100;
            for (let i = 0; i < sorted.length; i++) {
                const isFirst = i === 0;
                const isLast = i === sorted.length - 1;
                const g = { ...sorted[i] };
                g.maxScore = cursor;
                if (isFirst) {
                    g.minScore = newAutoApprove;
                } else if (isLast) {
                    g.minScore = newAutoReject;
                } else {
                    // Middle grades: keep proportional position, clamp between neighbours
                    const prevGrade = result[result.length - 1];
                    const maxAllowed = prevGrade.minScore - 1;
                    g.minScore = Math.max(newAutoReject, Math.min(maxAllowed, g.minScore));
                }
                cursor = g.minScore - 1;
                result.push(g);
            }
            return result;
        },
        [],
    );

    const fetchConfig = useCallback(async () => {
        try {
            setLoading(true);
            const data = await adminApi.getLoanEvaluationConfig();
            if (data) {
                setAutoReject(data.autoRejectScore);
                setAutoApprove(data.autoApproveScore);
                if (data.creditGrades?.length) setGrades(data.creditGrades);
                if (data.scoreWeights) setWeights(data.scoreWeights);
                setCurrentVersion(data.version ?? 0);
                setConfigHash(data.configHash ?? '');
            }
        } catch { /* default values */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    // When thresholds change → cascade grade ranges
    const onAutoApproveChange = (v: number | null) => {
        const val = v ?? 80;
        setAutoApprove(val);
        setGrades(prev => rebuildGrades(prev, val, autoReject));
    };
    const onAutoRejectChange = (v: number | null) => {
        const val = v ?? 40;
        setAutoReject(val);
        setGrades(prev => rebuildGrades(prev, autoApprove, val));
    };

    /** Update a single grade's editable field. Only minScore (for middle grades), maxLoanAmount, baseInterestRate are editable. */
    const updateGrade = (idx: number, field: keyof CreditGradeDto, val: number) => {
        setGrades(prev => {
            const next = prev.map((g, i) => (i === idx ? { ...g, [field]: val } : { ...g }));
            // When middle grade minScore changes, cascade the grades below
            if (field === 'minScore') {
                for (let i = idx + 1; i < next.length; i++) {
                    next[i].maxScore = next[i - 1].minScore - 1;
                    if (i === next.length - 1) {
                        next[i].minScore = autoReject;
                    }
                }
            }
            return next;
        });
    };

    const addGrade = () => {
        setGrades(prev => {
            const sorted = [...prev].sort((a, b) => b.maxScore - a.maxScore);
            const last = sorted[sorted.length - 1];
            const letter = String.fromCharCode(65 + sorted.length); // D, E, F…
            const mid = Math.floor((last.minScore + autoReject) / 2);
            const newGrade: CreditGradeDto = {
                grade: letter,
                label: `Hạng ${letter}`,
                minScore: autoReject,
                maxScore: last.minScore - 1,
                maxLoanAmount: Math.floor(last.maxLoanAmount / 2),
                baseInterestRate: Math.min(last.baseInterestRate + 3, 100),
            };
            // Push old last grade's minScore up
            last.minScore = mid + 1;
            newGrade.maxScore = mid;
            return [...sorted.slice(0, -1), { ...last }, newGrade];
        });
    };

    const removeGrade = (idx: number) => {
        setGrades(prev => {
            if (prev.length <= 1) return prev;
            const next = prev.filter((_, i) => i !== idx);
            // Rebuild ranges
            return rebuildGrades(next, autoApprove, autoReject);
        });
    };

    const handleSave = async () => {
        // Client-side validation
        if (autoReject >= autoApprove) {
            messageApi.error('Ngưỡng từ chối phải nhỏ hơn ngưỡng duyệt tự động');
            return;
        }
        if (weightSum !== 100) {
            messageApi.error(`Tổng trọng số phải = 100% (hiện tại: ${weightSum}%)`);
            return;
        }

        try {
            setSaving(true);
            const data = await adminApi.createLoanEvaluationConfig({
                autoRejectScore: autoReject,
                autoApproveScore: autoApprove,
                creditGrades: grades,
                scoreWeights: weights,
            });
            setCurrentVersion(data.version ?? 0);
            setConfigHash(data.configHash ?? '');
            messageApi.success(`Đã lưu cấu hình v${data.version} thành công`);
            if (showHistory) fetchHistory();
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
        } catch { messageApi.error('Không thể tải lịch sử'); }
        finally { setHistoryLoading(false); }
    };

    const toggleHistory = () => {
        const next = !showHistory;
        setShowHistory(next);
        if (next && history.length === 0) fetchHistory();
    };

    const resetDefaults = () => {
        setAutoReject(40);
        setAutoApprove(80);
        setGrades(DEFAULT_GRADES);
        setWeights({ ...DEFAULT_WEIGHTS });
    };

    // ════════════════════════ RENDER ════════════════════════
    return (
        <div>
            {ctx}
            <PageHeader
                title="Rule Engine — Đánh giá khoản vay"
                description="Cấu hình ngưỡng tự động, hạng tín dụng, trọng số. Mỗi lần lưu tạo phiên bản mới (INSERT-only), kèm SHA-256 hash."
                breadcrumb={[{ label: 'Đánh giá khoản vay' }]}
                helpTooltip="Cấu hình được lưu theo dạng versioning — không bao giờ ghi đè dữ liệu cũ."
            />

            {currentVersion > 0 && (
                <Alert
                    type="info" showIcon style={{ marginBottom: 16 }}
                    message={<>Phiên bản hiện tại: <strong>v{currentVersion}</strong> &nbsp;|&nbsp; Hash: <code style={{ fontSize: 11 }}>{configHash?.slice(0, 24)}…</code></>}
                />
            )}

            <Spin spinning={loading}>
                {/* ── BLOCK 1: Global Thresholds ── */}
                <Card
                    title={<Space><SafetyCertificateOutlined /> Khối 1 — Ngưỡng Chặn Dưới &amp; Chặn Trên</Space>}
                    style={{ marginBottom: 16 }}
                >
                    <Row gutter={24}>
                        <Col xs={24} md={8}>
                            <Typography.Text strong>Điểm Từ chối tự động</Typography.Text>
                            <div style={{ marginTop: 8 }}>
                                <InputNumber
                                    min={0} max={99} value={autoReject}
                                    onChange={onAutoRejectChange}
                                    addonAfter="điểm" style={{ width: '100%' }}
                                />
                            </div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Score &lt; {autoReject} → <Tag color="red">REJECTED</Tag>
                            </Typography.Text>
                        </Col>
                        <Col xs={24} md={8}>
                            <Typography.Text strong>Điểm Duyệt tự động</Typography.Text>
                            <div style={{ marginTop: 8 }}>
                                <InputNumber
                                    min={1} max={100} value={autoApprove}
                                    onChange={onAutoApproveChange}
                                    addonAfter="điểm" style={{ width: '100%' }}
                                />
                            </div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Score ≥ {autoApprove} → <Tag color="green">APPROVED</Tag>
                            </Typography.Text>
                        </Col>
                        <Col xs={24} md={8}>
                            <Typography.Text strong>Vùng Thẩm định thủ công</Typography.Text>
                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbe6', borderRadius: 8, border: '1px dashed #faad14' }}>
                                <Typography.Text style={{ fontSize: 18, fontWeight: 700 }}>
                                    {manualZone.min} — {manualZone.max} điểm
                                </Typography.Text>
                            </div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Tự sinh ra → <Tag color="gold">PENDING_REVIEW</Tag>
                            </Typography.Text>
                        </Col>
                    </Row>
                </Card>

                {/* ── BLOCK 2: Credit Grading ── */}
                <Card
                    title="Khối 2 — Phân Hạng &amp; Hạn Mức (Credit Grading)"
                    style={{ marginBottom: 16 }}
                    extra={<Tag color="blue">Cascading — Không cho phép hổng hoặc chồng lấn</Tag>}
                >
                    {grades.map((g, i) => {
                        const sorted = [...grades].sort((a, b) => b.maxScore - a.maxScore);
                        const sortedIdx = sorted.findIndex(s => s.grade === g.grade);
                        const isTop = sortedIdx === 0;
                        const isBottom = sortedIdx === sorted.length - 1;
                        const minLocked = isTop || isBottom;

                        return (
                            <Card
                                key={g.grade} size="small"
                                style={{ marginBottom: 12, borderLeft: `4px solid ${GRADE_COLORS[g.grade] || '#999'}` }}
                                title={
                                    <Space>
                                        <Tag color={GRADE_COLORS[g.grade] || 'default'}>Hạng {g.grade}</Tag>
                                        <span>{g.label}</span>
                                    </Space>
                                }
                                extra={
                                    grades.length > 1 && !isTop ? (
                                        <Button size="small" danger type="text" icon={<CloseCircleOutlined />} onClick={() => removeGrade(i)}>Xóa</Button>
                                    ) : null
                                }
                            >
                                <Row gutter={16}>
                                    <Col xs={12} md={6}>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Điểm tối thiểu</Typography.Text>
                                        <div>
                                            {minLocked ? (
                                                <Tooltip title={isTop ? 'Tự động = Ngưỡng duyệt' : 'Tự động = Ngưỡng từ chối'}>
                                                    <InputNumber value={g.minScore} disabled addonAfter={<LockOutlined />} style={{ width: '100%' }} />
                                                </Tooltip>
                                            ) : (
                                                <InputNumber
                                                    min={autoReject} max={g.maxScore - 1}
                                                    value={g.minScore}
                                                    onChange={(v) => updateGrade(i, 'minScore', v ?? g.minScore)}
                                                    style={{ width: '100%' }}
                                                />
                                            )}
                                        </div>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Điểm tối đa</Typography.Text>
                                        <Tooltip title="Tự sinh từ hạng phía trên">
                                            <InputNumber value={g.maxScore} disabled addonAfter={<LockOutlined />} style={{ width: '100%' }} />
                                        </Tooltip>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Hạn mức tối đa</Typography.Text>
                                        <InputNumber
                                            min={0} step={1_000_000}
                                            value={g.maxLoanAmount}
                                            onChange={(v) => updateGrade(i, 'maxLoanAmount', v ?? 0)}
                                            addonAfter="VNĐ" style={{ width: '100%' }}
                                            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                            parser={(v) => Number((v ?? '').replace(/,/g, ''))}
                                        />
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Lãi suất cơ sở</Typography.Text>
                                        <InputNumber
                                            min={0} max={100} step={0.5}
                                            value={g.baseInterestRate}
                                            onChange={(v) => updateGrade(i, 'baseInterestRate', v ?? 0)}
                                            addonAfter="%/năm" style={{ width: '100%' }}
                                        />
                                    </Col>
                                </Row>
                            </Card>
                        );
                    })}

                    <Button type="dashed" block onClick={addGrade} style={{ marginTop: 4 }}>
                        + Thêm hạng tín dụng
                    </Button>
                </Card>

                {/* ── BLOCK 3: Weight Configuration ── */}
                <Card
                    title={<Space><PieChartOutlined /> Khối 3 — Cấu hình Trọng số tính điểm</Space>}
                    style={{ marginBottom: 16 }}
                    extra={
                        <Space>
                            <Progress
                                type="circle" size={48}
                                percent={weightSum}
                                status={weightSum === 100 ? 'success' : 'exception'}
                                format={() => `${weightSum}%`}
                            />
                        </Space>
                    }
                >
                    <Row gutter={[16, 12]}>
                        {(Object.keys(WEIGHT_LABELS) as (keyof ScoreWeightsDto)[]).map((key) => (
                            <Col xs={24} sm={12} md={8} lg={4} key={key}>
                                <Typography.Text strong style={{ fontSize: 12 }}>{WEIGHT_LABELS[key]}</Typography.Text>
                                <InputNumber
                                    min={0} max={100} value={weights[key]}
                                    onChange={(v) => setWeights(prev => ({ ...prev, [key]: v ?? 0 }))}
                                    addonAfter="%" style={{ width: '100%', marginTop: 4 }}
                                />
                            </Col>
                        ))}
                    </Row>
                    {weightSum !== 100 && (
                        <Alert type="error" showIcon style={{ marginTop: 12 }}
                            message={`Tổng trọng số = ${weightSum}%. Phải bằng 100% để lưu cấu hình.`}
                        />
                    )}
                </Card>

                {/* ── Preview + Actions ── */}
                <Card title="Xem trước phân loại" style={{ marginBottom: 16 }}>
                    <Row gutter={12}>
                        <Col xs={24} md={6}>
                            <Card size="small" style={{ textAlign: 'center', background: '#fff1f0' }}>
                                <Tag color="red">AUTO REJECT</Tag>
                                <div><strong>&lt; {autoReject} điểm</strong></div>
                            </Card>
                        </Col>
                        {[...grades].sort((a, b) => a.minScore - b.minScore).map(g => (
                            <Col xs={24} md={Math.max(4, Math.floor(14 / grades.length))} key={g.grade}>
                                <Card size="small" style={{ textAlign: 'center' }}>
                                    <Tag color={GRADE_COLORS[g.grade] || 'default'}>Hạng {g.grade}</Tag>
                                    <div><strong>{g.minScore} — {g.maxScore}</strong></div>
                                    <div style={{ fontSize: 12, color: '#888' }}>≤ {FMT.format(g.maxLoanAmount)}</div>
                                    <div style={{ fontSize: 12, color: '#888' }}>{g.baseInterestRate}%/năm</div>
                                </Card>
                            </Col>
                        ))}
                        <Col xs={24} md={6}>
                            <Card size="small" style={{ textAlign: 'center', background: '#f6ffed' }}>
                                <Tag color="green">AUTO APPROVE</Tag>
                                <div><strong>≥ {autoApprove} điểm</strong></div>
                            </Card>
                        </Col>
                    </Row>

                    <Divider />

                    <Space>
                        <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleSave} loading={saving}
                            disabled={weightSum !== 100 || autoReject >= autoApprove}>
                            Lưu cấu hình (v{currentVersion + 1})
                        </Button>
                        <Button onClick={resetDefaults}>Khôi phục mặc định</Button>
                        <Button icon={<HistoryOutlined />} onClick={toggleHistory}>
                            {showHistory ? 'Ẩn lịch sử' : 'Lịch sử phiên bản'}
                        </Button>
                    </Space>
                </Card>

                {/* ── BLOCK 4: Version History ── */}
                {showHistory && (
                    <Card title="Lịch sử phiên bản cấu hình" style={{ marginBottom: 16 }}>
                        <Table
                            dataSource={history} rowKey="_id" loading={historyLoading}
                            pagination={false} size="small" scroll={{ x: 900 }}
                            columns={[
                                { title: 'Version', dataIndex: 'version', key: 'v', width: 80, render: (v: number) => v ? <Tag>v{v}</Tag> : <Tag color="orange">legacy</Tag> },
                                { title: 'Thời gian', dataIndex: 'createdAt', key: 't', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('vi-VN') : '-' },
                                {
                                    title: 'Reject / Approve', key: 'thresholds', width: 140, render: (_: any, r: any) => {
                                        const rej = r.autoRejectScore != null ? r.autoRejectScore : 'N/A';
                                        const app = r.autoApproveScore != null ? r.autoApproveScore : 'N/A';
                                        return `< ${rej} / ≥ ${app}`;
                                    }
                                },
                                {
                                    title: 'Hạng', key: 'grades', render: (_: any, r: any) => (r.creditGrades && r.creditGrades.length > 0)
                                        ? r.creditGrades.map((g: any) => <Tag key={g.grade} color={GRADE_COLORS[g.grade]}>{g.grade}: {g.minScore}-{g.maxScore}</Tag>)
                                        : <Tag color="default">Chưa cấu hình</Tag>
                                },
                                {
                                    title: 'Trọng số', key: 'weights', width: 200, render: (_: any, r: any) => {
                                        const w = r.scoreWeights;
                                        if (!w) return <Tag color="default">Chưa cấu hình</Tag>;
                                        return <span style={{ fontSize: 11 }}>PH:{w.paymentHistory} DL:{w.debtLevel} CA:{w.creditAge} CM:{w.creditMix} NC:{w.newCredit}</span>;
                                    }
                                },
                                { title: 'Hash', dataIndex: 'configHash', key: 'hash', width: 180, render: (v: string) => v ? <code style={{ fontSize: 10 }}>{v.slice(0, 24)}…</code> : '-' },
                                { title: 'Ghi chú', dataIndex: 'changeNote', key: 'note', ellipsis: true },
                            ]}
                        />
                    </Card>
                )}
            </Spin>
        </div>
    );
}
