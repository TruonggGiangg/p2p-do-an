import { useRef, useCallback, useState } from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import {
    Tag, Typography, Button, Space, Popconfirm, Statistic, Row, Col, Card, Badge, theme, Drawer, Table, Tabs, Empty, Descriptions, Skeleton, Flex, Tooltip, Avatar
} from 'antd';
import { CheckOutlined, CheckCircleOutlined, SendOutlined, ReloadOutlined, ClockCircleOutlined, DollarOutlined, FileTextOutlined, EyeOutlined, CloseOutlined, CloseCircleOutlined, BankOutlined, UserOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { adminApi, LoanDto } from '../api/admin';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';
import { useTheme } from '../App';

const { Text } = Typography;

export default function LoanApprovalsPage() {
    const { token } = theme.useToken();
    const { isDarkMode } = useTheme();
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
    const [contractStatus, setContractStatus] = useState<{ hasContract: boolean; contractStatus: string | null; signedAt: string | null } | null>(null);

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
        setContractStatus(null);
        try {
            const [details, docs, canApproveRes, contractRes] = await Promise.all([
                adminApi.getLoanDetails(loanId),
                adminApi.getLoanDocuments(loanId),
                adminApi.canApproveLoan(loanId),
                adminApi.getContractStatus(loanId),
            ]);
            setLoanDetails(details);
            setLoanDocuments(docs);
            setCanApprove(canApproveRes.canApprove);
            setMissingRequired(canApproveRes.missingRequired || []);
            setContractStatus(contractRes);
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
            render: (_, r) => r.clientName ? <Text strong style={{ fontSize: 12 }} ellipsis>{r.clientName}</Text> : <Text type="secondary">–</Text>,
        },
        {
            title: 'Sản phẩm',
            key: 'product',
            width: 140,
            dataIndex: 'productShortName',
            search: { transform: (v) => v?.trim() || undefined },
            fieldProps: { placeholder: 'Mã sản phẩm...' },
            render: (_, r) => (
                <Space size={4} style={{ whiteSpace: 'nowrap' }}>
                    <Tag color="gold">{r.productShortName}</Tag>
                    <Text ellipsis style={{ fontSize: 12, maxWidth: 90 }}>{r.productName}</Text>
                </Space>
            ),
        },
        {
            title: 'Mục đích',
            dataIndex: 'willing',
            width: 100,
            search: false,
            render: (_, r) => <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} ellipsis>{r.willing || '–'}</Text>,
        },
        {
            title: 'Số tiền vay',
            dataIndex: 'capital',
            width: 120,
            sorter: (a, b) => (a.capital || 0) - (b.capital || 0),
            search: false,
            render: (_, r) => <Text strong style={{ color: token.colorPrimary, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtVND(r.capital)}</Text>,
        },
        {
            title: 'Kỳ hạn',
            dataIndex: 'periodMonth',
            width: 80,
            align: 'center',
            search: false,
            sorter: (a, b) => (a.periodMonth || 0) - (b.periodMonth || 0),
            render: (_, r) => <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.periodMonth} tháng</Text>,
        },
        {
            title: 'Trả/tháng',
            dataIndex: 'monthlyPay',
            width: 110,
            search: false,
            render: (_, r) => <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtVND(r.monthlyPay)}</Text>,
        },
        {
            title: 'Tổng trả',
            dataIndex: 'entirelyPay',
            width: 110,
            search: false,
            render: (_, r) => <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtVND(r.entirelyPay)}</Text>,
        },
        {
            title: 'Lãi suất',
            dataIndex: 'monthlyRatePercent',
            width: 80,
            align: 'center',
            search: false,
            render: (_, r) => r.monthlyRatePercent != null ? <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.monthlyRatePercent}%/th</Text> : '–',
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
            width: 220,
            onCell: () => ({ style: { paddingLeft: 12, paddingRight: 12, whiteSpace: 'nowrap' } }),
            render: (_, r) => {
                if (!r.fineractLoanId) return <Tag color="red">Chưa có Fineract ID</Tag>;
                return (
                    <Space size={4} style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                        <Popconfirm
                            title={`Phê duyệt #${r.fineractLoanId} (${fmtVND(r.capital)})?`}
                            onConfirm={() => handleApprove(r)}
                            okText="Duyệt" cancelText="Hủy"
                            okButtonProps={{ type: 'primary', style: { background: token.colorSuccess, borderColor: token.colorSuccess } }}
                        >
                            <Button size="small" icon={<CheckOutlined />} loading={approving.has(r.fineractLoanId)}
                                style={{ background: token.colorSuccess, borderColor: token.colorSuccess, color: '#fff', fontSize: 12 }}>
                                Duyệt
                            </Button>
                        </Popconfirm>
                        <Popconfirm
                            title={`Giải ngân #${r.fineractLoanId} (${fmtVND(r.capital)})?`}
                            onConfirm={() => handleDisburse(r)}
                            okText="Giải ngân" cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                        >
                            <Button size="small" icon={<SendOutlined />} loading={disbursing.has(r.fineractLoanId)} danger
                                style={{ fontSize: 12 }}>
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

            {/* Stats Cards - Enhanced with gradient backgrounds */}
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={12} lg={8}>
                    <Card
                        bordered={false}
                        style={{
                            borderRadius: 0,
                            background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
                            boxShadow: '0 4px 12px rgba(30, 64, 175, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <Flex align="center" gap={16}>
                            <div style={{
                                width: 60,
                                height: 60,
                                borderRadius: 0,
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <ClockCircleOutlined style={{ fontSize: 30, color: '#FFFFFF' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 4 }}>
                                    Chờ duyệt
                                </Typography.Text>
                                <Statistic
                                    value={loans.length}
                                    valueStyle={{
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: '#FFFFFF',
                                        lineHeight: 1.2,
                                    }}
                                />
                            </div>
                        </Flex>
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={8}>
                    <Card
                        bordered={false}
                        style={{
                            borderRadius: 0,
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <Flex align="center" gap={16}>
                            <div style={{
                                width: 60,
                                height: 60,
                                borderRadius: 0,
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <DollarOutlined style={{ fontSize: 30, color: '#FFFFFF' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 4 }}>
                                    Tổng vốn cần duyệt
                                </Typography.Text>
                                <Statistic
                                    value={totalCapital}
                                    formatter={v => fmtVND(Number(v))}
                                    valueStyle={{
                                        fontSize: 24,
                                        fontWeight: 700,
                                        color: '#FFFFFF',
                                        lineHeight: 1.2,
                                    }}
                                />
                            </div>
                        </Flex>
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={8}>
                    <Card
                        bordered={false}
                        style={{
                            borderRadius: 0,
                            background: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                            boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
                            height: '100%',
                        }}
                        bodyStyle={{ padding: '24px' }}
                    >
                        <Flex align="center" gap={16}>
                            <div style={{
                                width: 60,
                                height: 60,
                                borderRadius: 0,
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <FileTextOutlined style={{ fontSize: 30, color: '#FFFFFF' }} />
                            </div>
                            <div>
                                <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, display: 'block', marginBottom: 4 }}>
                                    Sản phẩm vay
                                </Typography.Text>
                                <Statistic
                                    value={new Set(loans.map(l => l.productShortName)).size}
                                    suffix=" loại"
                                    valueStyle={{
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: '#FFFFFF',
                                        lineHeight: 1.2,
                                    }}
                                />
                            </div>
                        </Flex>
                    </Card>
                </Col>
            </Row>

            <ProTable<LoanDto>
                {...PRO_TABLE_DEFAULTS}
                actionRef={actionRef}
                rowKey={(r) => r._id || `FL_${r.fineractLoanId}`}
                headerTitle={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <CheckCircleOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
                        <div style={{ fontSize: 18, fontWeight: 700, color: token.colorTextHeading }}>Phê duyệt khoản vay</div>
                    </div>
                }
                columns={columns}
                request={async (params) => {
                    const data = await adminApi.getPendingLoans();
                    let filtered = (data || []).filter(Boolean).filter(
                        (l) => l && (l.fineractLoanId != null || (l as any)._id != null)
                    );
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
                postData={(data: LoanDto[]) => (data || []).filter((r: LoanDto) => r && (r.fineractLoanId != null || (r as any)._id != null))}
                search={{
                    labelWidth: 'auto',
                    defaultCollapsed: false,
                }}
                scroll={{ x: 1750 }}
                pagination={{
                    pageSize: 15,
                    showSizeChanger: true,
                    showTotal: t => `Tổng ${t} khoản vay chờ duyệt`,
                    showQuickJumper: true,
                }}
                locale={{ emptyText: '🎉 Không có khoản vay nào chờ phê duyệt' }}
                toolBarRender={() => [
                    <Button
                        key="reload"
                        icon={<ReloadOutlined />}
                        onClick={() => actionRef.current?.reload()}
                        size="large"
                        style={{
                            height: 44,
                            padding: '0 20px',
                            fontWeight: 600,
                        }}
                    >
                        Làm mới
                    </Button>
                ]}
                options={{
                    reload: true,
                    density: true,
                    fullScreen: true,
                    setting: true,
                    search: true,
                }}
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
                                <div style={{ padding: '8px 4px' }}>
                                    {/* Premium Banner Card */}
                                    <div style={{
                                        background: isDarkMode
                                            ? `linear-gradient(135deg, ${token.colorPrimary} 0%, #0F172A 100%)`
                                            : `linear-gradient(135deg, ${token.colorPrimary} 0%, #F0FDFA 100%)`,
                                        padding: '24px',
                                        borderRadius: 0,
                                        marginBottom: '28px',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                                    }}>
                                        {/* Subtle background pattern/glow */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '-20%',
                                            right: '-10%',
                                            width: '300px',
                                            height: '300px',
                                            borderRadius: '50%',
                                            background: `${token.colorPrimary}20`,
                                            filter: 'blur(60px)',
                                            zIndex: 0
                                        }} />

                                        <Flex wrap="wrap" justify="space-between" align="center" style={{ position: 'relative', zIndex: 1 }}>
                                            <Flex gap={24} align="center">
                                                <div style={{
                                                    width: 64,
                                                    height: 64,
                                                    borderRadius: 0,
                                                    background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                                }}>
                                                    <BankOutlined style={{ fontSize: 32, color: isDarkMode ? '#fff' : token.colorPrimary }} />
                                                </div>
                                                <div>
                                                    <div style={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : token.colorTextSecondary, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                                        Sản phẩm: {loanDetails.accountNo}
                                                    </div>
                                                    <Text strong style={{ fontSize: 22, color: isDarkMode ? '#fff' : token.colorTextHeading, display: 'block' }}>
                                                        {loanDetails.loanProductName}
                                                    </Text>
                                                    <Space style={{ marginTop: 4 }}>
                                                        <Avatar size="small" icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
                                                        <Text style={{ color: isDarkMode ? 'rgba(255,255,255,0.85)' : token.colorText, fontWeight: 500 }}>{loanDetails.clientName}</Text>
                                                    </Space>
                                                </div>
                                            </Flex>

                                            <Flex vertical align="flex-end" gap={12}>
                                                <Tag color={loanDetails.status?.active ? 'success' : 'processing'} style={{
                                                    padding: '6px 16px',
                                                    borderRadius: 0,
                                                    fontWeight: 700,
                                                    fontSize: 13,
                                                    margin: 0,
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                                    border: 'none'
                                                }}>
                                                    {loanDetails.status?.value?.toUpperCase()}
                                                </Tag>
                                                {contractStatus?.hasContract && (
                                                    <Tag
                                                        color={contractStatus.contractStatus === 'signed' ? 'blue' : contractStatus.contractStatus === 'active' ? 'green' : contractStatus.contractStatus === 'pending_signature' ? 'orange' : 'default'}
                                                        style={{ padding: '4px 12px', borderRadius: 0, fontWeight: 600, fontSize: 12, margin: 0 }}
                                                    >
                                                        {contractStatus.contractStatus === 'pending_signature' ? '📝 Chờ ký hợp đồng'
                                                            : contractStatus.contractStatus === 'signed' ? '✅ Đã ký hợp đồng'
                                                                : contractStatus.contractStatus === 'active' ? '📄 HĐ đang hiệu lực'
                                                                    : `HĐ: ${contractStatus.contractStatus}`}
                                                    </Tag>
                                                )}

                                                {viewLoanId && (
                                                    <Space>
                                                        {canApprove ? (
                                                            <Popconfirm
                                                                title="Phê duyệt khoản vay"
                                                                description={`Xác nhận phê duyệt khoản vay #${viewLoanId}?`}
                                                                onConfirm={() => { handleApprove({ fineractLoanId: viewLoanId } as LoanDto); setViewLoanId(null); setLoanDetails(null); }}
                                                                okText="Duyệt ngay" cancelText="Hủy"
                                                                okButtonProps={{ type: 'primary', size: 'middle' }}
                                                            >
                                                                <Button type="primary" size="middle" icon={<CheckOutlined />} loading={approving.has(viewLoanId)} style={{ borderRadius: 0, fontWeight: 600 }}>
                                                                    Duyệt khoản vay
                                                                </Button>
                                                            </Popconfirm>
                                                        ) : (
                                                            <Tooltip title={`Thiếu: ${missingRequired.join(', ')}`}>
                                                                <Button size="middle" icon={<CheckOutlined />} disabled style={{ borderRadius: 0 }}>
                                                                    Duyệt khoản vay
                                                                </Button>
                                                            </Tooltip>
                                                        )}
                                                        {contractStatus?.hasContract && contractStatus.contractStatus === 'signed' ? (
                                                            <Popconfirm
                                                                title="Giải ngân khoản vay"
                                                                description="Xác nhận giải ngân ngay bây giờ?"
                                                                onConfirm={() => { handleDisburse({ fineractLoanId: viewLoanId } as LoanDto); setViewLoanId(null); setLoanDetails(null); }}
                                                                okText="Giải ngân" cancelText="Hủy"
                                                                okButtonProps={{ danger: true }}
                                                            >
                                                                <Button size="middle" danger icon={<SendOutlined />} loading={disbursing.has(viewLoanId)} style={{ borderRadius: 0, fontWeight: 600 }}>
                                                                    Giải ngân
                                                                </Button>
                                                            </Popconfirm>
                                                        ) : (
                                                            <Tooltip title={
                                                                !contractStatus?.hasContract
                                                                    ? 'Chưa có hợp đồng cho khoản vay này'
                                                                    : contractStatus?.contractStatus === 'pending_signature'
                                                                        ? 'Người vay chưa ký hợp đồng. Cần ký trước khi giải ngân.'
                                                                        : `Trạng thái hợp đồng: ${contractStatus?.contractStatus}`
                                                            }>
                                                                <Button size="middle" icon={<SendOutlined />} disabled style={{ borderRadius: 0, fontWeight: 600 }}>
                                                                    Giải ngân
                                                                </Button>
                                                            </Tooltip>
                                                        )}
                                                    </Space>
                                                )}
                                            </Flex>
                                        </Flex>
                                    </div>

                                    {/* Grouped Statistics Sections */}
                                    <Row gutter={[24, 24]}>
                                        {/* Section: Vốn & Giải ngân */}
                                        <Col span={24}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                                <div style={{ width: 4, height: 16, background: token.colorPrimary, borderRadius: 0 }} />
                                                <Text strong style={{ fontSize: 15, color: token.colorTextHeading }}>Vốn & Giải ngân</Text>
                                            </div>
                                            <Row gutter={16}>
                                                <Col span={6}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 0 }}>
                                                        <Statistic title="Phê duyệt gốc" value={loanDetails.principal} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorPrimary, fontWeight: 700 }} />
                                                    </Card>
                                                </Col>
                                                <Col span={6}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 0 }}>
                                                        <Statistic title="Đã giải ngân" value={loanDetails.summary?.principalDisbursed || 0} formatter={v => fmtVND(Number(v))} />
                                                    </Card>
                                                </Col>
                                                <Col span={6}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 0 }}>
                                                        <Statistic title="Gốc chưa trả" value={loanDetails.summary?.principalOutstanding || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorError }} />
                                                    </Card>
                                                </Col>
                                                <Col span={6}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorPrimary + '08', border: `1px solid ${token.colorPrimary}20`, borderRadius: 0 }}>
                                                        <Statistic title="Tổng dư nợ" value={loanDetails.summary?.totalOutstanding || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ fontWeight: 800, color: token.colorPrimary }} />
                                                    </Card>
                                                </Col>
                                            </Row>
                                        </Col>

                                        {/* Section: Thanh toán đã thực hiện */}
                                        <Col span={24}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                                <div style={{ width: 4, height: 16, background: token.colorSuccess, borderRadius: 0 }} />
                                                <Text strong style={{ fontSize: 15, color: token.colorTextHeading }}>Thanh toán</Text>
                                            </div>
                                            <Row gutter={16}>
                                                <Col span={8}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorSuccess + '08', borderRadius: 0 }}>
                                                        <Statistic title="Đã trả (Gốc)" value={loanDetails.summary?.principalPaid || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorSuccess }} />
                                                    </Card>
                                                </Col>
                                                <Col span={8}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorSuccess + '08', borderRadius: 0 }}>
                                                        <Statistic title="Đã trả (Lãi)" value={loanDetails.summary?.interestPaid || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorSuccess }} />
                                                    </Card>
                                                </Col>
                                                <Col span={8}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorSuccess + '08', borderRadius: 0 }}>
                                                        <Statistic title="Phí & Phạt đã thu" value={(loanDetails.summary?.feeChargesPaid || 0) + (loanDetails.summary?.penaltyChargesPaid || 0)} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorSuccess }} />
                                                    </Card>
                                                </Col>
                                            </Row>
                                        </Col>

                                        {/* Section: Tình trạng quá hạn */}
                                        <Col span={24}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                                <div style={{ width: 4, height: 16, background: token.colorError, borderRadius: 0 }} />
                                                <Text strong style={{ fontSize: 15, color: token.colorTextHeading }}>Tình trạng nợ</Text>
                                            </div>
                                            <Row gutter={16}>
                                                <Col span={12}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorError + '08', borderRadius: 0 }}>
                                                        <Statistic title="Tổng số tiền quá hạn" value={loanDetails.summary?.totalOverdue || 0} formatter={v => fmtVND(Number(v))} valueStyle={{ color: token.colorError, fontWeight: 700 }} prefix={<CloseCircleOutlined />} />
                                                    </Card>
                                                </Col>
                                                <Col span={12}>
                                                    <Card size="small" bordered={false} style={{ background: token.colorError + '08', borderRadius: 0 }}>
                                                        <Statistic title="Số ngày quá hạn" value={loanDetails.summary?.pastDueDays || 0} suffix="ngày" valueStyle={{ color: token.colorError, fontWeight: 700 }} />
                                                    </Card>
                                                </Col>
                                            </Row>
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
                                        <div style={{ marginBottom: 12, padding: '8px 12px', background: token.colorWarningBg, borderRadius: 0, border: `1px solid ${token.colorWarningBorder}` }}>
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
                                    borderRadius: 0,
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
