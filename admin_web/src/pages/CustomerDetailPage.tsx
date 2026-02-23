import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import {
    Card, Typography, Tag, Descriptions, Button, Space,
    Skeleton, Statistic, Row, Col, Avatar, Divider, message, theme,
    Drawer, Tabs, Table, Badge, Alert, Empty
} from 'antd';
import { CloseOutlined, EyeOutlined } from '@ant-design/icons';
import {
    ArrowLeftOutlined, UserOutlined, BankOutlined, CalendarOutlined,
    DollarOutlined, ClockCircleOutlined, FileTextOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { adminApi, CustomerDto, LoanDto } from '../api/admin';
import { FineractStatusBadge, fmtVND } from '../utils/fineractStatus';

const { Title, Text } = Typography;

export default function CustomerDetailPage() {
    const { token } = theme.useToken();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [customer, setCustomer] = useState<CustomerDto | null>(null);
    const [loans, setLoans] = useState<LoanDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Detailed Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [loanDetails, setLoanDetails] = useState<any>(null);
    const [loanDocuments, setLoanDocuments] = useState<any[]>([]);
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [viewLoanId, setViewLoanId] = useState<number | null>(null);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        Promise.all([adminApi.getCustomer(id), adminApi.getCustomerLoans(id)])
            .then(([c, l]) => { setCustomer(c); setLoans(l); })
            .catch(() => setError('Không thể tải thông tin khách hàng'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleViewDetails = async (fineractLoanId: number) => {
        setIsModalOpen(true);
        setModalLoading(true);
        setLoadingDocuments(true);
        setViewLoanId(fineractLoanId);
        try {
            const [data, docs] = await Promise.all([
                adminApi.getLoanDetails(fineractLoanId),
                adminApi.getLoanDocuments(fineractLoanId),
            ]);
            setLoanDetails(data);
            setLoanDocuments(docs);
        } catch (err) {
            message.error('Không thể tải chi tiết khoản vay');
        } finally {
            setModalLoading(false);
            setLoadingDocuments(false);
        }
    };

    const handleDownloadDocument = async (documentId: number, fileName: string) => {
        if (!viewLoanId) return;
        const hide = message.loading('Đang chuẩn bị tài liệu...', 0);
        try {
            const response = await adminApi.downloadLoanDocument(viewLoanId, documentId);
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            const blob = new Blob([response.data], { type: contentType });
            const url = window.URL.createObjectURL(blob);
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
            setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        } catch (e) {
            message.error('Không thể tải tài liệu');
        } finally {
            hide();
        }
    };

    const loanColumns: ProColumns<LoanDto>[] = [
        {
            title: 'Fineract #',
            dataIndex: 'fineractLoanId',
            key: 'fineractLoanId',
            width: 90,
            render: (_, record) => {
                const id = record?.fineractLoanId;
                const num = typeof id === 'number' ? id : (typeof id === 'object' && id != null && 'id' in id ? (id as { id: number }).id : Number(id));
                const valid = num != null && !Number.isNaN(num);
                return valid ? (
                    <Tag
                        color="blue"
                        style={{ fontFamily: 'monospace', cursor: 'pointer' }}
                        onClick={() => handleViewDetails(num)}
                    >
                        #{num}
                    </Tag>
                ) : '–';
            },
        },
        {
            title: 'Sản phẩm',
            key: 'product',
            render: (_, r) => (
                <Space>
                    <Tag color="gold">{r.productShortName}</Tag>
                    <Text style={{ fontSize: 12 }}>{r.productName}</Text>
                </Space>
            ),
        },
        {
            title: 'Mục đích',
            dataIndex: 'willing',
            width: 150,
            render: (v: any) => <Text type="secondary">{v || '–'}</Text>,
        },
        {
            title: 'Số tiền vay',
            dataIndex: 'capital',
            width: 140,
            render: (v: any) => <Text strong style={{ color: token.colorPrimary }}>{fmtVND(v)}</Text>,
        },
        {
            title: 'Kỳ hạn',
            dataIndex: 'periodMonth',
            align: 'center',
            width: 100,
            render: (v: any) => `${v} tháng`,
        },
        {
            title: 'Trả/tháng',
            dataIndex: 'monthlyPay',
            width: 140,
            render: (v: any) => fmtVND(v),
        },
        {
            title: 'Lãi suất',
            dataIndex: 'monthlyRatePercent',
            align: 'center',
            width: 100,
            render: (v: any) => v != null ? `${v}%/tháng` : '–',
        },
        {
            title: 'Trạng thái (Fineract)',
            dataIndex: 'status',
            align: 'center',
            width: 150,
            render: (_: any, r: any) => <FineractStatusBadge status={r.status} />,
        },
        {
            title: 'Ngày nộp',
            dataIndex: 'createdAt',
            width: 120,
            render: (v: any) => v ? new Date(v as string).toLocaleDateString('vi-VN') : '–',
        },
    ];

    if (loading) return <Skeleton active />;
    if (error) return <Alert type="error" message={error} />;
    if (!customer) return null;

    const totalCapital = loans.reduce((s, l) => s + (l.capital || 0), 0);

    return (
        <div>
            <Space style={{ marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
                    Quay lại
                </Button>
            </Space>

            <Row gutter={[16, 16]}>
                <Col xs={24} md={7}>
                    <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
                        <Statistic title={<><FileTextOutlined /> Sản phẩm</>} value={new Set(loans.map(l => l.productShortName)).size} suffix="loại" />
                    </Card>
                    <Card bordered={false} style={{ borderRadius: 12 }}>
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                            <Avatar size={72} icon={<UserOutlined />}
                                style={{ background: token.colorPrimaryBg, color: token.colorPrimary, fontSize: 32 }} />
                            <Title level={4} style={{ margin: '12px 0 4px' }}>{customer.displayName || customer.username}</Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>{customer.username}</Text>
                        </div>
                        <Divider style={{ margin: '12px 0' }} />
                        <Descriptions
                            column={1}
                            size="small"
                            labelStyle={{ color: token.colorTextSecondary, fontSize: 12 }}
                        >
                            <Descriptions.Item label="Email">{customer.email || '–'}</Descriptions.Item>
                            <Descriptions.Item label="Văn phòng">
                                <Tag color="gold">{customer.officeName || 'Head Office'}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="TT Fineract">
                                <FineractStatusBadge status={customer.fineractStatus} />
                            </Descriptions.Item>
                            <Descriptions.Item label={<><BankOutlined /> Fineract ID</>}>
                                {customer.fineractClientId
                                    ? <Tag color="blue" style={{ fontFamily: 'monospace' }}>{customer.fineractClientId}</Tag>
                                    : '–'}
                            </Descriptions.Item>
                            <Descriptions.Item label={<><CalendarOutlined /> Kích hoạt</>}>
                                {customer.activationDate ? new Date(customer.activationDate).toLocaleDateString('vi-VN') : '–'}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                </Col>

                <Col xs={24} md={17}>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col span={8}>
                            <Card bordered={false} style={{ borderRadius: 12, background: token.colorPrimaryBg, border: `1px solid ${token.colorPrimaryBorder}` }}>
                                <Statistic title="Khoản vay" value={loans.length} prefix={<DollarOutlined />} valueStyle={{ color: token.colorPrimary }} />
                            </Card>
                        </Col>
                        <Col span={8}>
                            <Card bordered={false} style={{ borderRadius: 12 }}>
                                <Statistic title="Tổng vốn" value={totalCapital} formatter={v => fmtVND(Number(v))} valueStyle={{ fontSize: 14, color: token.colorSuccess }} />
                            </Card>
                        </Col>
                        <Col span={8}>
                            <Card bordered={false} style={{ borderRadius: 12 }}>
                                <Statistic
                                    title="Chờ duyệt"
                                    value={loans.filter(l => {
                                        const code = l.status && typeof l.status === 'object' ? l.status.code : l.status;
                                        return String(code || '').includes('pending');
                                    }).length}
                                    valueStyle={{ color: token.colorWarning }}
                                />
                            </Card>
                        </Col>
                    </Row>

                    {loans.length === 0
                        ? <Card bordered={false} style={{ borderRadius: 12 }}><Empty description="Chưa có khoản vay" /></Card>
                        : (
                            <ProTable<LoanDto>
                                rowKey={(r) => r._id || `FL_${r.fineractLoanId}`}
                                headerTitle="Danh sách khoản vay"
                                columns={loanColumns}
                                dataSource={loans}
                                search={false}
                                pagination={{ pageSize: 10 }}
                                options={false}
                                scroll={{ x: 1300 }}
                            />
                        )
                    }
                </Col>
            </Row >

            <Drawer
                title={loanDetails ? `Chi tiết khoản vay #${loanDetails.id}` : 'Đang tải...'}
                open={isModalOpen}
                onClose={() => { setIsModalOpen(false); setLoanDetails(null); setLoanDocuments([]); setViewLoanId(null); }}
                width={Math.min(960, window.innerWidth * 0.92)}
                destroyOnClose
                styles={{ body: { padding: '0 24px 24px' } }}
                extra={
                    <Button type="text" icon={<CloseOutlined />} onClick={() => { setIsModalOpen(false); setLoanDetails(null); setLoanDocuments([]); setViewLoanId(null); }} />
                }
            >
                {modalLoading ? (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}><Skeleton active /></div>
                ) : loanDetails && (
                    <Tabs defaultActiveKey="overview" items={[
                        {
                            key: 'overview',
                            label: 'Chung',
                            children: (
                                <div style={{ padding: '8px 0' }}>
                                    <div style={{
                                        background: token.colorPrimary,
                                        padding: '24px',
                                        borderRadius: '12px',
                                        marginBottom: '24px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        color: '#fff',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}>
                                        <div style={{ display: 'flex', gap: '48px' }}>
                                            <div>
                                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sản phẩm vay</div>
                                                <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{loanDetails.loanProductName} <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 'normal' }}>({loanDetails.accountNo})</Text></div>
                                            </div>
                                            <Divider type="vertical" style={{ height: '40px', background: 'rgba(255,255,255,0.2)', margin: 'auto 0' }} />
                                            <div>
                                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Khách hàng</div>
                                                <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>{loanDetails.clientName}</div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Trạng thái</div>
                                            <Tag color={loanDetails.status?.active ? 'success' : 'processing'} style={{ padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', border: 'none' }}>
                                                {loanDetails.status?.value?.toUpperCase()}
                                            </Tag>
                                        </div>
                                    </div>

                                    <Row gutter={[16, 16]}>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic title="Số tiền giải ngân" value={loanDetails.principal} prefix={<DollarOutlined />} formatter={v => fmtVND(Number(v))} />
                                            </Card>
                                        </Col>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic title="Dư nợ gốc" value={loanDetails.summary?.principalOutstanding} prefix={<BankOutlined />} formatter={v => fmtVND(Number(v))} />
                                            </Card>
                                        </Col>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic title="Tổng nợ đến hạn" value={loanDetails.summary?.totalExpectedRepayment} prefix={<ClockCircleOutlined />} formatter={v => fmtVND(Number(v))} />
                                            </Card>
                                        </Col>
                                        <Col span={6}>
                                            <Card size="small" bordered={false} style={{ background: token.colorFillAlter, borderRadius: 8 }}>
                                                <Statistic
                                                    title="Tổng nợ quá hạn"
                                                    value={loanDetails.summary?.totalOverdue}
                                                    valueStyle={{ color: (loanDetails.summary?.totalOverdue > 0) ? token.colorError : token.colorSuccess }}
                                                    prefix={<InfoCircleOutlined />}
                                                    formatter={v => fmtVND(Number(v))}
                                                />
                                                {loanDetails.summary?.pastDueDays > 0 && (
                                                    <div style={{ fontSize: 12, color: token.colorError, marginTop: 4 }}>
                                                        Quá hạn {loanDetails.summary.pastDueDays} ngày
                                                    </div>
                                                )}
                                            </Card>
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
                                            render: (v: any) => v ? v.reverse().join('/') : '–'
                                        },
                                        {
                                            title: 'Ngày trả',
                                            dataIndex: 'obligationsMetOnDate',
                                            width: 120,
                                            align: 'center',
                                            render: (v: any) => v ? <Text type="success">{v.reverse().join('/')}</Text> : '–'
                                        },
                                        {
                                            title: 'Dư nợ gốc',
                                            dataIndex: 'principalLoanBalanceOutstanding',
                                            align: 'right',
                                            width: 150,
                                            render: (v: any) => v != null ? fmtVND(v) : '–'
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
                                            render: (v: any) => <Text strong>{fmtVND(v)}</Text>
                                        },
                                        {
                                            title: 'Chưa trả',
                                            dataIndex: 'totalOutstandingForPeriod',
                                            align: 'right',
                                            width: 130,
                                            render: (v: any) => v > 0 ? <Text type="danger">{fmtVND(v)}</Text> : <Badge status="success" text="Đã xong" />
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
                                            width: 200,
                                            render: (v: any) => v || <Text type="secondary">Chưa phân loại</Text>,
                                        },
                                        {
                                            title: 'Tên file gốc',
                                            dataIndex: 'originalName',
                                            ellipsis: true,
                                            render: (v: any, r: any) => v || r.fileName,
                                        },
                                        { title: 'Định dạng', dataIndex: 'type', width: 120, align: 'center' },
                                        {
                                            title: 'Ngày tải lên',
                                            key: 'createdAt',
                                            width: 180,
                                            align: 'center',
                                            render: (_: any, r: any) => {
                                                const date = r.uploadedAt || r.createdDate;
                                                return date ? new Date(date).toLocaleString('vi-VN') : '–';
                                            },
                                        },
                                        {
                                            title: 'Hành động',
                                            key: 'action',
                                            width: 150,
                                            align: 'right',
                                            render: (_: any, r: any) => (
                                                <Button
                                                    type="link"
                                                    icon={<EyeOutlined />}
                                                    onClick={() => handleDownloadDocument(r.id, r.originalName || r.fileName || 'document')}
                                                >
                                                    Xem/Tải về
                                                </Button>
                                            ),
                                        },
                                    ]}
                                    locale={{ emptyText: 'Chưa có tài liệu đính kèm' }}
                                />
                            ),
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
                                        { title: 'ID', dataIndex: 'id', width: 80, align: 'center' },
                                        {
                                            title: 'Ngày',
                                            dataIndex: 'date',
                                            width: 150,
                                            align: 'center',
                                            render: (v: any) => v ? v.reverse().join('/') : '–'
                                        },
                                        { title: 'Loại giao dịch', dataIndex: 'type', render: (v: any) => v?.value },
                                        {
                                            title: 'Số tiền',
                                            dataIndex: 'amount',
                                            width: 180,
                                            align: 'right',
                                            render: (v: any) => <Text strong>{fmtVND(v)}</Text>
                                        },
                                        {
                                            title: 'Trạng thái',
                                            dataIndex: 'manuallyReversed',
                                            width: 150,
                                            align: 'center',
                                            render: (v: any) => v ? <Tag color="error">Đã hủy</Tag> : <Tag color="success">Thành công</Tag>
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
        </div >
    );
}

