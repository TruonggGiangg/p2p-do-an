import { useRef, useCallback, useState } from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
    Tag, Typography, Button, Space, Popconfirm, Statistic, Row, Col, Card, Badge, theme, Drawer, Table, Tabs, Empty, Descriptions, Divider, Skeleton, Flex, Tooltip
} from 'antd';
import { CheckOutlined, SendOutlined, ReloadOutlined, ClockCircleOutlined, DollarOutlined, FileTextOutlined, EyeOutlined, CloseOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { adminApi, LoanDto } from '../api/admin';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';

const { Text } = Typography;

export default function LoanApprovalsPage() {
    const { token } = theme.useToken();
    const actionRef = useRef<ActionType>();
    const [loans, setLoans] = useState<LoanDto[]>([]);
    const [approving, setApproving] = useState<Set<number>>(new Set());
    const [disbursing, setDisbursing] = useState<Set<number>>(new Set());
    const [messageApi, contextHolder] = message.useMessage();
    const [viewLoanId, setViewLoanId] = useState<number | null>(null);
    const [loanDetails, setLoanDetails] = useState<any>(null);
    const [loanDocuments, setLoanDocuments] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [canApprove, setCanApprove] = useState(true);
    const [missingRequired, setMissingRequired] = useState<string[]>([]);
    const [documentReviewing, setDocumentReviewing] = useState<Set<number>>(new Set());

    const handleApprove = useCallback(async (loan: LoanDto) => {
        if (!loan.fineractLoanId) return;
        setApproving(s => new Set(s).add(loan.fineractLoanId!));
        try {
            await adminApi.approveLoan(loan.fineractLoanId);
            messageApi.success(`✅ Đã phê duyệt khoản vay #${loan.fineractLoanId}`);
            actionRef.current?.reload();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message || 'Phê duyệt thất bại');
        } finally {
            setApproving(s => { const n = new Set(s); n.delete(loan.fineractLoanId!); return n; });
        }
    }, [messageApi]);

    const handleDisburse = useCallback(async (loan: LoanDto) => {
        if (!loan.fineractLoanId) return;
        setDisbursing(s => new Set(s).add(loan.fineractLoanId!));
        try {
            await adminApi.disburseLoan(loan.fineractLoanId);
            messageApi.success(`💸 Đã giải ngân khoản vay #${loan.fineractLoanId}`);
            actionRef.current?.reload();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message || 'Giải ngân thất bại');
        } finally {
            setDisbursing(s => { const n = new Set(s); n.delete(loan.fineractLoanId!); return n; });
        }
    }, [messageApi]);

    const handleViewDetails = useCallback(async (loanId: number) => {
        setViewLoanId(loanId);
        setLoadingDetails(true);
        setLoadingDocuments(true);
        try {
            const [details, docs, canApproveRes] = await Promise.all([
                adminApi.getLoanDetails(loanId),
                adminApi.getLoanDocuments(loanId),
                adminApi.canApproveLoan(loanId),
            ]);
            setLoanDetails(details);
            setLoanDocuments(docs);
            setCanApprove(canApproveRes.canApprove);
            setMissingRequired(canApproveRes.missingRequired || []);
        } catch (e: any) {
            messageApi.error('Không thể tải chi tiết khoản vay');
            setViewLoanId(null);
        } finally {
            setLoadingDetails(false);
            setLoadingDocuments(false);
        }
    }, [messageApi]);

    const refreshDocumentsAndCanApprove = useCallback(async () => {
        if (!viewLoanId) return;
        try {
            const [docs, canApproveRes] = await Promise.all([
                adminApi.getLoanDocuments(viewLoanId),
                adminApi.canApproveLoan(viewLoanId),
            ]);
            setLoanDocuments(docs);
            setCanApprove(canApproveRes.canApprove);
            setMissingRequired(canApproveRes.missingRequired || []);
        } catch (e) {
            messageApi.error('Không thể cập nhật');
        }
    }, [viewLoanId, messageApi]);

    const handleApproveDocument = useCallback(async (documentId: number) => {
        if (!viewLoanId) return;
        setDocumentReviewing(s => new Set(s).add(documentId));
        try {
            await adminApi.approveDocument(viewLoanId, documentId);
            messageApi.success('Đã duyệt tài liệu');
            await refreshDocumentsAndCanApprove();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message || 'Duyệt tài liệu thất bại');
        } finally {
            setDocumentReviewing(s => { const n = new Set(s); n.delete(documentId); return n; });
        }
    }, [viewLoanId, messageApi, refreshDocumentsAndCanApprove]);

    const handleRejectDocument = useCallback(async (documentId: number) => {
        if (!viewLoanId) return;
        setDocumentReviewing(s => new Set(s).add(documentId));
        try {
            await adminApi.rejectDocument(viewLoanId, documentId);
            messageApi.success('Đã từ chối tài liệu');
            await refreshDocumentsAndCanApprove();
        } catch (e: any) {
            messageApi.error(e?.response?.data?.message || 'Từ chối tài liệu thất bại');
        } finally {
            setDocumentReviewing(s => { const n = new Set(s); n.delete(documentId); return n; });
        }
    }, [viewLoanId, messageApi, refreshDocumentsAndCanApprove]);

    const handleDownloadDocument = useCallback(async (documentId: number, fileName: string) => {
        if (!viewLoanId) return;
        const hide = messageApi.loading('Đang chuẩn bị tài liệu...', 0);
        try {
            const response = await adminApi.downloadLoanDocument(viewLoanId, documentId);
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            const blob = new Blob([response.data], { type: contentType });
            const url = window.URL.createObjectURL(blob);

            // Images and PDFs can be opened in a new tab for viewing
            const isViewable = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(contentType);
            if (isViewable) {
                window.open(url, '_blank');
            } else {
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                link.parentNode?.removeChild(link);
            }
            // Cleanup: revoke after a delay to allow browser to open tab
            setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        } catch (e) {
            messageApi.error('Không thể tải tài liệu');
        } finally {
            hide();
        }
    }, [viewLoanId, messageApi]);

    const columns: ProColumns<LoanDto>[] = [
        {
            title: 'Fineract #',
            dataIndex: 'fineractLoanId',
            width: 90,
            copyable: true,
            search: false,
            render: (_, record) => {
                const id = record?.fineractLoanId;
                const num = typeof id === 'number' ? id : (typeof id === 'object' && id != null && 'id' in id ? (id as { id: number }).id : Number(id));
                const valid = num != null && !Number.isNaN(num);
                return valid
                    ? (
                        <Typography.Link onClick={() => handleViewDetails(num)}>
                            <Tag color="blue" style={{ fontFamily: 'monospace', cursor: 'pointer' }}>#{num}</Tag>
                        </Typography.Link>
                    )
                    : <Tag color="orange">Chưa sync</Tag>;
            },
        },
        {
            title: 'Người vay',
            dataIndex: 'clientName',
            width: 150,
            ellipsis: true,
            search: { transform: (v) => v?.trim() || undefined },
            fieldProps: { placeholder: 'Tìm theo tên...' },
            render: (_, r) => r.clientName ? <Text strong style={{ fontSize: 13 }}>{r.clientName}</Text> : <Text type="secondary">–</Text>,
        },
        {
            title: 'Sản phẩm',
            key: 'product',
            width: 130,
            dataIndex: 'productShortName',
            search: { transform: (v) => v?.trim() || undefined },
            fieldProps: { placeholder: 'Mã sản phẩm...' },
            render: (_, r) => (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Tag color="gold" style={{ width: 'fit-content', marginBottom: 2 }}>{r.productShortName}</Tag>
                    <Text ellipsis style={{ fontSize: 11, maxWidth: 120 }}>{r.productName}</Text>
                </div>
            ),
        },
        {
            title: 'Mục đích',
            dataIndex: 'willing',
            width: 100,
            search: false,
            render: (_, r) => <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{r.willing || '–'}</Text>,
        },
        {
            title: 'Số tiền vay',
            dataIndex: 'capital',
            width: 110,
            valueType: 'money',
            sorter: (a, b) => (a.capital || 0) - (b.capital || 0),
            search: false,
            render: (_, r) => <Text strong style={{ color: token.colorPrimary, fontSize: 13 }}>{fmtVND(r.capital)}</Text>,
        },
        {
            title: 'Kỳ hạn',
            dataIndex: 'periodMonth',
            width: 80,
            align: 'center',
            search: false,
            sorter: (a, b) => (a.periodMonth || 0) - (b.periodMonth || 0),
            render: (_, r) => <Text style={{ fontSize: 13 }}>{r.periodMonth} tháng</Text>,
        },
        {
            title: 'Trả/tháng',
            dataIndex: 'monthlyPay',
            width: 110,
            search: false,
            render: (_, r) => <Text style={{ fontSize: 13 }}>{fmtVND(r.monthlyPay)}</Text>,
        },
        {
            title: 'Tổng trả',
            dataIndex: 'entirelyPay',
            width: 110,
            search: false,
            render: (_, r) => <Text style={{ fontSize: 13 }}>{fmtVND(r.entirelyPay)}</Text>,
        },
        {
            title: 'Lãi suất',
            dataIndex: 'monthlyRatePercent',
            width: 80,
            align: 'center',
            search: false,
            render: (_, r) => r.monthlyRatePercent != null ? <Text style={{ fontSize: 13 }}>{r.monthlyRatePercent}%/th</Text> : '–',
        },
        {
            title: 'Trạng thái (Fineract)',
            dataIndex: 'status',
            width: 220,
            align: 'center',
            search: false,
            render: (_, r) => <FineractStatusBadge status={r.status} />,
        },
        {
            title: 'Ngày nộp',
            dataIndex: 'createdAt',
            width: 120,
            valueType: 'date',
            search: false,
            sorter: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
            render: (_, r) => {
                const d = r.createdAt;
                if (!d) return '–';
                const date = Array.isArray(d) ? new Date(d[0], (d[1] ?? 1) - 1, d[2] ?? 1) : new Date(d as string);
                return <Text type="secondary" style={{ fontSize: 12 }}>{date.toLocaleDateString('vi-VN')}</Text>;
            },
        },
        {
            title: 'Hành động',
            key: 'actions',
            search: false,
            fixed: 'right',
            width: 180,
            render: (_, r) => {
                if (!r.fineractLoanId) return <Tag color="red">Chưa có Fineract ID</Tag>;
                return (
                    <Space size={4}>
                        <Popconfirm
                            title={`Phê duyệt #${r.fineractLoanId} (${fmtVND(r.capital)})?`}
                            onConfirm={() => handleApprove(r)}
                            okText="Duyệt" cancelText="Hủy"
                            okButtonProps={{ type: 'primary', style: { background: token.colorSuccess, borderColor: token.colorSuccess } }}
                        >
                            <Button size="small" icon={<CheckOutlined />} loading={approving.has(r.fineractLoanId)}
                                style={{ background: token.colorSuccess, borderColor: token.colorSuccess, color: '#fff' }}>
                                Duyệt
                            </Button>
                        </Popconfirm>
                        <Popconfirm
                            title={`Giải ngân #${r.fineractLoanId} (${fmtVND(r.capital)})?`}
                            onConfirm={() => handleDisburse(r)}
                            okText="Giải ngân" cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" icon={<SendOutlined />} loading={disbursing.has(r.fineractLoanId)} danger>
                                Giải ngân
                            </Button>
                        </Popconfirm>
                    </Space>
                );
            },
        },
    ];

    const totalCapital = loans.reduce((s, l) => s + (l.capital || 0), 0);

    return (
        <>
            {contextHolder}

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={8}>
                    <Card bordered={false} style={{ borderRadius: 12, background: token.colorPrimaryBg, border: `1px solid ${token.colorPrimaryBorder}` }}>
                        <Flex align="center" gap={12}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: token.colorPrimary + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ClockCircleOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Chờ duyệt</Typography.Text>
                                <Statistic value={loans.length} valueStyle={{ fontSize: 22, fontWeight: 700, color: token.colorPrimary }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <Card bordered={false} style={{ borderRadius: 12, boxShadow: token.boxShadowSecondary }}>
                        <Flex align="center" gap={12}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: token.colorSuccess + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <DollarOutlined style={{ fontSize: 24, color: token.colorSuccess }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Tổng vốn</Typography.Text>
                                <Statistic value={totalCapital} formatter={v => fmtVND(Number(v))} valueStyle={{ fontSize: 18, fontWeight: 600, color: token.colorSuccess }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                    <Card bordered={false} style={{ borderRadius: 12, boxShadow: token.boxShadowSecondary }}>
                        <Flex align="center" gap={12}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: token.colorWarning + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileTextOutlined style={{ fontSize: 24, color: token.colorWarning }} />
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Sản phẩm</Typography.Text>
                                <Statistic value={new Set(loans.map(l => l.productShortName)).size} suffix="loại" valueStyle={{ fontSize: 22, fontWeight: 600 }} />
                            </div>
                        </Flex>
                    </Card>
                </Col>
            </Row>

            <ProTable<LoanDto>
                actionRef={actionRef}
                rowKey={(r) => r._id || `FL_${r.fineractLoanId}`}
                headerTitle={
                    <Space>
                        Phê duyệt khoản vay
                        <Badge count={loans.length} showZero color="#0D9488" />
                    </Space>
                }
                columns={columns}
                request={async (params) => {
                    const data = await adminApi.getPendingLoans();
                    let filtered = data;
                    const q = (params.clientName as string)?.toLowerCase?.()?.trim?.();
                    if (q) filtered = filtered.filter(l => (l.clientName || '').toLowerCase().includes(q));
                    const p = (params.productShortName as string)?.toLowerCase?.()?.trim?.();
                    if (p) filtered = filtered.filter(l => (l.productShortName || '').toLowerCase().includes(p));
                    setLoans(filtered);
                    const page = params.current ?? 1;
                    const size = params.pageSize ?? 15;
                    const start = (page - 1) * size;
                    const paged = filtered.slice(start, start + size);
                    return { data: paged, success: true, total: filtered.length };
                }}
                search={{
                    labelWidth: 'auto',
                    defaultCollapsed: false,
                }}
                scroll={{ x: 1600 }}
                pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} khoản vay chờ duyệt` }}
                locale={{ emptyText: '🎉 Không có khoản vay nào chờ phê duyệt' }}
                toolBarRender={() => [
                    <Button key="reload" icon={<ReloadOutlined />} onClick={() => actionRef.current?.reload()}>
                        Làm mới
                    </Button>
                ]}
                options={{ reload: true, density: true, fullScreen: true, setting: true }}
                columnsState={{
                    persistenceKey: 'loan-approvals-table',
                    persistenceType: 'localStorage',
                }}
            />

            <Drawer
                title={
                    <Space>
                        <span>Chi tiết khoản vay</span>
                        {viewLoanId && <Tag color="blue">#{viewLoanId}</Tag>}
                    </Space>
                }
                open={!!viewLoanId}
                onClose={() => { setViewLoanId(null); setLoanDetails(null); setLoanDocuments([]); setCanApprove(true); setMissingRequired([]); }}
                width={Math.min(960, window.innerWidth * 0.92)}
                destroyOnClose
                styles={{ body: { paddingTop: 8 } }}
                extra={
                    <Button type="text" icon={<CloseOutlined />} onClick={() => { setViewLoanId(null); setLoanDetails(null); setLoanDocuments([]); setCanApprove(true); setMissingRequired([]); }} />
                }
            >
                {loadingDetails ? (
                    <div style={{ padding: '24px 0' }}>
                        <Skeleton active paragraph={{ rows: 8 }} />
                    </div>
                ) : !loanDetails ? (
                    <Empty description="Không có dữ liệu" />
                ) : (
                    <Tabs defaultActiveKey="documents" items={[
                        {
                            key: 'info',
                            label: 'Chung (Overview)',
                            children: (
                                <div style={{ padding: '8px 0' }}>
                                    <div style={{
                                        background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimary}dd 100%)`,
                                        padding: '20px 24px',
                                        borderRadius: '12px',
                                        marginBottom: '24px',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: 16,
                                        color: '#fff',
                                        boxShadow: token.boxShadowSecondary
                                    }}>
                                        <Flex wrap="wrap" gap={24} align="center">
                                            <div>
                                                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Sản phẩm vay</div>
                                                <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>{loanDetails.loanProductName} <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 400 }}>({loanDetails.accountNo})</Text></div>
                                            </div>
                                            <Divider type="vertical" style={{ height: 36, background: 'rgba(255,255,255,0.25)', margin: 0 }} />
                                            <div>
                                                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Khách hàng</div>
                                                <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>{loanDetails.clientName}</div>
                                            </div>
                                        </Flex>
                                        <Flex gap={8} align="center">
                                            <Tag color={loanDetails.status?.active ? 'success' : 'processing'} style={{ padding: '4px 10px', borderRadius: 6, fontWeight: 600, border: 'none', margin: 0 }}>
                                                {loanDetails.status?.value?.toUpperCase()}
                                            </Tag>
                                            {viewLoanId && (
                                                <Space.Compact>
                                                    {canApprove ? (
                                                        <Popconfirm
                                                            title={`Phê duyệt #${viewLoanId}?`}
                                                            onConfirm={() => { handleApprove({ fineractLoanId: viewLoanId } as LoanDto); setViewLoanId(null); setLoanDetails(null); }}
                                                            okText="Duyệt" cancelText="Hủy"
                                                            okButtonProps={{ type: 'primary', style: { background: token.colorSuccess, borderColor: token.colorSuccess } }}
                                                        >
                                                            <Button size="small" type="primary" icon={<CheckOutlined />} loading={approving.has(viewLoanId)} style={{ background: token.colorSuccess, borderColor: token.colorSuccess }}>
                                                                Duyệt khoản vay
                                                            </Button>
                                                        </Popconfirm>
                                                    ) : (
                                                        <Tooltip title={`Chưa duyệt đủ tài liệu: ${missingRequired.join(', ')}`}>
                                                            <Button size="small" icon={<CheckOutlined />} disabled>
                                                                Duyệt khoản vay
                                                            </Button>
                                                        </Tooltip>
                                                    )}
                                                    <Popconfirm
                                                        title={`Giải ngân #${viewLoanId}?`}
                                                        onConfirm={() => { handleDisburse({ fineractLoanId: viewLoanId } as LoanDto); setViewLoanId(null); setLoanDetails(null); }}
                                                        okText="Giải ngân" cancelText="Hủy"
                                                        okButtonProps={{ danger: true }}
                                                    >
                                                        <Button size="small" danger icon={<SendOutlined />} loading={disbursing.has(viewLoanId)}>
                                                            Giải ngân
                                                        </Button>
                                                    </Popconfirm>
                                                </Space.Compact>
                                            )}
                                        </Flex>
                                    </div>

                                    <Row gutter={[16, 24]}>
                                        <Col span={6}>
                                            <Statistic title="Phê duyệt gốc" value={loanDetails.principal} formatter={v => fmtVND(Number(v))} />
                                        </Col>
                                        <Col span={6}>
                                            <Statistic title="Đã giải ngân" value={loanDetails.summary?.principalDisbursed || 0} formatter={v => fmtVND(Number(v))} />
                                        </Col>
                                        <Col span={6}>
                                            <Statistic title="Gốc chưa trả" value={loanDetails.summary?.principalOutstanding || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorError }} />
                                        </Col>
                                        <Col span={6}>
                                            <Statistic title="Tổng nợ hiện tại" value={loanDetails.summary?.totalOutstanding || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ fontWeight: 'bold' }} />
                                        </Col>
                                        <Col span={24}><Divider style={{ margin: '8px 0' }} /></Col>
                                        <Col span={6}>
                                            <Statistic title="Đã trả (Gốc)" value={loanDetails.summary?.principalPaid || 0} formatter={v => fmtVND(Number(v))} />
                                        </Col>
                                        <Col span={6}>
                                            <Statistic title="Đã trả (Lãi)" value={loanDetails.summary?.interestPaid || 0} formatter={v => fmtVND(Number(v))} />
                                        </Col>
                                        <Col span={6}>
                                            <Statistic title="Đã quá hạn" value={loanDetails.summary?.totalOverdue || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorError }} />
                                        </Col>
                                        <Col span={6}>
                                            <Statistic title="Số ngày quá hạn" value={loanDetails.summary?.pastDueDays || 0} suffix="ngày" />
                                        </Col>
                                    </Row>
                                </div>
                            )
                        },
                        {
                            key: 'details',
                            label: 'Chi tiết tài khoản',
                            children: (
                                <div style={{ padding: '8px 0' }}>
                                    <Descriptions bordered size="small" column={2}>
                                        <Descriptions.Item label="Sản phẩm">{loanDetails.loanProductName}</Descriptions.Item>
                                        <Descriptions.Item label="Số tài khoản">{loanDetails.accountNo}</Descriptions.Item>
                                        <Descriptions.Item label="ID Fineract">{loanDetails.id}</Descriptions.Item>
                                        <Descriptions.Item label="Bên ngoài ID">{loanDetails.externalId || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Tiền tệ">{loanDetails.currency?.displayLabel}</Descriptions.Item>
                                        <Descriptions.Item label="Chi nhánh">{loanDetails.officeName}</Descriptions.Item>

                                        <Descriptions.Item label="Số tiền gốc">{fmtVND(loanDetails.principal)}</Descriptions.Item>
                                        <Descriptions.Item label="Số kỳ hạn">{loanDetails.numberOfRepayments} {loanDetails.repaymentFrequencyType?.value}</Descriptions.Item>
                                        <Descriptions.Item label="Lãi suất">{loanDetails.annualInterestRate}% / năm ({loanDetails.interestRatePerPeriod}% / {loanDetails.interestRateFrequencyType?.value})</Descriptions.Item>
                                        <Descriptions.Item label="Kiểu lãi suất">{loanDetails.interestType?.value}</Descriptions.Item>
                                        <Descriptions.Item label="Phương thức Amortization">{loanDetails.amortizationType?.value}</Descriptions.Item>
                                        <Descriptions.Item label="Chiến lược giao dịch">{loanDetails.transactionProcessingStrategyName}</Descriptions.Item>

                                        <Descriptions.Item label="Ngày nộp">{loanDetails.timeline?.submittedOnDate?.reverse().join('/')}</Descriptions.Item>
                                        <Descriptions.Item label="Ngày giải ngân">{loanDetails.timeline?.actualDisbursementDate?.reverse().join('/') || '–'}</Descriptions.Item>
                                        <Descriptions.Item label="Ngày đáo hạn dự kiến">{loanDetails.timeline?.expectedMaturityDate?.reverse().join('/') || '–'}</Descriptions.Item>
                                    </Descriptions>
                                </div>
                            )
                        },
                        {
                            key: 'schedule',
                            label: 'Lịch trả nợ',
                            children: (
                                <Table
                                    dataSource={loanDetails.repaymentSchedule?.periods || []}
                                    pagination={false}
                                    size="small"
                                    scroll={{ y: 500, x: 1300 }}
                                    rowKey="period"
                                    columns={[
                                        { title: '#', dataIndex: 'period', width: 60, fixed: 'left', align: 'center' },
                                        {
                                            title: 'Ngày đến hạn',
                                            dataIndex: 'dueDate',
                                            width: 120,
                                            align: 'center',
                                            render: v => v ? v.reverse().join('/') : '–'
                                        },
                                        {
                                            title: 'Ngày trả',
                                            dataIndex: 'obligationsMetOnDate',
                                            width: 120,
                                            align: 'center',
                                            render: v => v ? <Text type="success">{v.reverse().join('/')}</Text> : '–'
                                        },
                                        {
                                            title: 'Dư nợ gốc',
                                            dataIndex: 'principalLoanBalanceOutstanding',
                                            align: 'right',
                                            width: 150,
                                            render: v => v != null ? fmtVND(v) : '–'
                                        },
                                        {
                                            title: 'Gốc (Hẹn/Trả)',
                                            key: 'principal',
                                            align: 'right',
                                            width: 180,
                                            render: (_: any, r: any) => (
                                                <div>
                                                    <div>{fmtVND(r.principalDue)}</div>
                                                    <div style={{ fontSize: '11px', color: token.colorSuccess }}>{fmtVND(r.principalPaid)}</div>
                                                </div>
                                            )
                                        },
                                        {
                                            title: 'Lãi (Hẹn/Trả)',
                                            key: 'interest',
                                            align: 'right',
                                            width: 180,
                                            render: (_: any, r: any) => (
                                                <div>
                                                    <div>{fmtVND(r.interestDue)}</div>
                                                    <div style={{ fontSize: '11px', color: token.colorSuccess }}>{fmtVND(r.interestPaid)}</div>
                                                </div>
                                            )
                                        },
                                        {
                                            title: 'Phí/Phạt',
                                            key: 'fees',
                                            align: 'right',
                                            width: 140,
                                            render: (_: any, r: any) => fmtVND((r.feeChargesDue || 0) + (r.penaltyChargesDue || 0))
                                        },
                                        {
                                            title: 'Tổng kỳ',
                                            dataIndex: 'totalDueForPeriod',
                                            align: 'right',
                                            width: 150,
                                            render: v => <Text strong>{fmtVND(v)}</Text>
                                        },
                                        {
                                            title: 'Chưa trả',
                                            dataIndex: 'totalOutstandingForPeriod',
                                            align: 'right',
                                            width: 130,
                                            render: v => v > 0 ? <Text type="danger">{fmtVND(v)}</Text> : <Badge status="success" text="Đã xong" />
                                        },
                                    ]}
                                />
                            )
                        },
                        {
                            key: 'documents',
                            label: (
                                <Badge count={loanDocuments.length} size="small" offset={[10, 0]}>
                                    Hồ sơ tài liệu
                                </Badge>
                            ),
                            children: (
                                <>
                                    {!canApprove && missingRequired.length > 0 && (
                                        <div style={{ marginBottom: 12, padding: '8px 12px', background: token.colorWarningBg, borderRadius: 8, border: `1px solid ${token.colorWarningBorder}` }}>
                                            <Text type="warning">
                                                <strong>Lưu ý:</strong> Cần duyệt đủ tài liệu bắt buộc trước khi duyệt khoản vay: {missingRequired.join(', ')}
                                            </Text>
                                        </div>
                                    )}
                                    <Table
                                        dataSource={loanDocuments}
                                        loading={loadingDocuments}
                                        pagination={false}
                                        size="small"
                                        rowKey="id"
                                        columns={[
                                            {
                                                title: 'Loại tài liệu',
                                                dataIndex: 'documentTypeName',
                                                width: 180,
                                                render: (v) => v || <Text type="secondary">Chưa phân loại</Text>
                                            },
                                            {
                                                title: 'Tên file',
                                                dataIndex: 'originalName',
                                                ellipsis: true,
                                                width: 160,
                                                render: (v, r) => v || r.fileName
                                            },
                                            {
                                                title: 'Trạng thái',
                                                dataIndex: 'reviewStatus',
                                                width: 120,
                                                align: 'center',
                                                render: (v) => {
                                                    if (v === 'approved') return <Tag color="success">Đã duyệt</Tag>;
                                                    if (v === 'rejected') return <Tag color="error">Từ chối</Tag>;
                                                    return <Tag color="processing">Chờ duyệt</Tag>;
                                                }
                                            },
                                            { title: 'Định dạng', dataIndex: 'type', width: 90, align: 'center' },
                                            {
                                                title: 'Hành động',
                                                key: 'action',
                                                width: 220,
                                                align: 'right',
                                                render: (_, r) => (
                                                    <Space size={4}>
                                                        <Button
                                                            type="link"
                                                            size="small"
                                                            icon={<EyeOutlined />}
                                                            onClick={() => handleDownloadDocument(r.id, r.originalName || r.fileName || 'document')}
                                                        >
                                                            Xem
                                                        </Button>
                                                        {r.reviewStatus !== 'approved' && (
                                                            <Button
                                                                type="link"
                                                                size="small"
                                                                icon={<CheckOutlined />}
                                                                loading={documentReviewing.has(r.id)}
                                                                onClick={() => handleApproveDocument(r.id)}
                                                                style={{ color: token.colorSuccess }}
                                                            >
                                                                Duyệt
                                                            </Button>
                                                        )}
                                                        {r.reviewStatus !== 'rejected' && (
                                                            <Button
                                                                type="link"
                                                                size="small"
                                                                danger
                                                                icon={<CloseCircleOutlined />}
                                                                loading={documentReviewing.has(r.id)}
                                                                onClick={() => handleRejectDocument(r.id)}
                                                            >
                                                                Từ chối
                                                            </Button>
                                                        )}
                                                    </Space>
                                                )
                                            }
                                        ]}
                                        locale={{ emptyText: 'Chưa có tài liệu đính kèm' }}
                                    />
                                </>
                            )
                        },
                        {
                            key: 'transactions',
                            label: 'Giao dịch',
                            children: (
                                <Table
                                    dataSource={loanDetails.transactions || []}
                                    pagination={false}
                                    size="small"
                                    scroll={{ y: 400 }}
                                    rowKey="id"
                                    columns={[
                                        { title: 'ID', dataIndex: 'id', width: 80 },
                                        {
                                            title: 'Ngày',
                                            dataIndex: 'date',
                                            render: v => v ? v.reverse().join('/') : '–'
                                        },
                                        { title: 'Loại', dataIndex: 'type', render: v => v?.value },
                                        {
                                            title: 'Số tiền',
                                            dataIndex: 'amount',
                                            align: 'right',
                                            render: v => fmtVND(v)
                                        },
                                        {
                                            title: 'Trạng thái',
                                            dataIndex: 'manuallyReversed',
                                            render: v => v ? <Tag color="error">Đã hủy</Tag> : <Tag color="success">Bình thường</Tag>
                                        },
                                    ]}
                                />
                            )
                        },
                        {
                            key: 'raw',
                            label: 'Dữ liệu thô',
                            children: (
                                <pre style={{
                                    background: token.colorFillAlter,
                                    padding: 12,
                                    borderRadius: 4,
                                    fontSize: '11px',
                                    maxHeight: '400px',
                                    overflow: 'auto',
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    color: token.colorText
                                }}>
                                    {JSON.stringify(loanDetails, null, 2)}
                                </pre>
                            )
                        }
                    ]} />
                )}
            </Drawer>
        </>
    );
}
