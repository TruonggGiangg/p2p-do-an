import { useEffect, useState } from 'react';
import { Table, Tag, Button, Typography, Popconfirm, Select, Input, Modal, message } from 'antd';
import { CheckCircleOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;

export default function LoanSupportRequestsPage() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('PENDING');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const [modalVisible, setModalVisible] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [adminNote, setAdminNote] = useState('');

    const limit = 20;

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('admin_access_token');
            const res = await axios.get('http://localhost:3001/api/admin/loan-support-requests', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    page,
                    limit,
                    status: statusFilter || undefined,
                    requestType: typeFilter || undefined
                }
            });
            setRequests(res.data.data.items || []);
            setTotal(res.data.data.total || 0);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi tải danh sách yêu cầu');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [page, statusFilter, typeFilter]);

    const handleApproveWaive = async (id: string) => {
        try {
            const token = localStorage.getItem('admin_access_token');
            await axios.post(`http://localhost:3001/api/admin/loan-support-requests/${id}/approve-waive`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            message.success('Đã duyệt xóa phạt thành công');
            fetchRequests();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi duyệt yêu cầu');
        }
    };

    const handleApproveReschedule = async () => {
        if (!selectedRequest) return;
        try {
            const token = localStorage.getItem('admin_access_token');
            await axios.post(`http://localhost:3001/api/admin/loan-support-requests/${selectedRequest._id}/approve-reschedule`, { note: adminNote }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            message.success('Đã duyệt cơ cấu lại nợ thành công');
            setModalVisible(false);
            setAdminNote('');
            fetchRequests();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi duyệt yêu cầu');
        }
    };

    const handleApproveWriteOff = async (id: string, note?: string) => {
        try {
            const token = localStorage.getItem('admin_access_token');
            await axios.post(`http://localhost:3001/api/admin/loan-support-requests/${id}/approve-write-off`, { note: note || '' }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            message.success('Đã duyệt xóa nợ thành công');
            fetchRequests();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi duyệt yêu cầu');
        }
    };

    const handleApproveWaiveInterest = async (id: string, note?: string) => {
        try {
            const token = localStorage.getItem('admin_access_token');
            await axios.post(`http://localhost:3001/api/admin/loan-support-requests/${id}/approve-waive-interest`, { note: note || '' }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            message.success('Đã duyệt xóa lãi thành công');
            fetchRequests();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi duyệt yêu cầu');
        }
    };

    const openRescheduleModal = (req: any) => {
        setSelectedRequest(req);
        setAdminNote('');
        setModalVisible(true);
    };

    const columns = [
        {
            title: 'Ngày gửi',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: 'Khách hàng',
            key: 'user',
            render: (_: any, record: any) => (
                <div>
                    <Text strong>{record.userId?.fullName || record.userId?.username || 'Unknown'}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.userId?.phoneNumber || record.userId?.email}</Text>
                </div>
            )
        },
        {
            title: 'ID Khoản Vay (Fineract)',
            dataIndex: 'fineractLoanId',
            key: 'fineractLoanId',
            render: (val: number) => <Text strong>#{val}</Text>
        },
        {
            title: 'Loại hỗ trợ',
            dataIndex: 'requestType',
            key: 'requestType',
            render: (val: string) => {
                const labels: Record<string, { label: string; color: string }> = {
                    WAIVE_PENALTY: { label: 'Xóa Phạt', color: 'blue' },
                    RESCHEDULE: { label: 'Cơ Cấu Nợ', color: 'purple' },
                    WRITE_OFF: { label: 'Xóa Nợ', color: 'red' },
                    WAIVE_INTEREST: { label: 'Xóa Lãi', color: 'orange' },
                };
                const t = labels[val] || { label: val, color: 'default' };
                return <Tag color={t.color}>{t.label}</Tag>;
            }
        },
        {
            title: 'Lý do / Yêu cầu',
            key: 'details',
            render: (_: any, record: any) => (
                <div style={{ maxWidth: 200 }}>
                    <Text italic>"{record.reason}"</Text>
                    {record.requestType === 'RESCHEDULE' && record.proposedRescheduleDate && (
                        <div style={{ marginTop: 4 }}>
                            <Tag icon={<FileTextOutlined />}>Ngày dời: {dayjs(record.proposedRescheduleDate).format('YYYY-MM-DD')}</Tag>
                            {record.proposedExtraPeriods && <Tag>+ {record.proposedExtraPeriods} kỳ</Tag>}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            render: (val: string) => {
                const color = val === 'PENDING' ? 'warning' : val === 'APPROVED' ? 'success' : 'error';
                return <Tag color={color}>{val}</Tag>;
            }
        },
        {
            title: 'Hành động',
            key: 'actions',
            render: (_: any, record: any) => {
                if (record.status !== 'PENDING') return <Text type="secondary">Đã xử lý</Text>;

                if (record.requestType === 'WAIVE_PENALTY') {
                    return (
                        <Popconfirm
                            title="Xác nhận duyệt xóa phạt trên Fineract?"
                            onConfirm={() => handleApproveWaive(record._id)}
                            cancelText="Hủy"
                            okText="Duyệt"
                        >
                            <Button type="primary" size="small" icon={<CheckCircleOutlined />}>Duyệt Xóa Phạt</Button>
                        </Popconfirm>
                    );
                }

                if (record.requestType === 'RESCHEDULE') {
                    return (
                        <Button
                            type="primary"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openRescheduleModal(record)}
                        >
                            Kiểm duyệt
                        </Button>
                    );
                }

                if (record.requestType === 'WRITE_OFF') {
                    return (
                        <Popconfirm
                            title="Xác nhận duyệt xóa nợ (write-off) trên Fineract? Khoản vay sẽ được đóng."
                            onConfirm={() => handleApproveWriteOff(record._id)}
                            cancelText="Hủy"
                            okText="Duyệt"
                        >
                            <Button type="primary" danger size="small" icon={<CheckCircleOutlined />}>Duyệt Xóa Nợ</Button>
                        </Popconfirm>
                    );
                }

                if (record.requestType === 'WAIVE_INTEREST') {
                    return (
                        <Popconfirm
                            title="Xác nhận duyệt xóa lãi trên Fineract?"
                            onConfirm={() => handleApproveWaiveInterest(record._id)}
                            cancelText="Hủy"
                            okText="Duyệt"
                        >
                            <Button type="primary" size="small" icon={<CheckCircleOutlined />}>Duyệt Xóa Lãi</Button>
                        </Popconfirm>
                    );
                }

                return null;
            }
        }
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Yêu cầu hỗ trợ nợ</Title>
                    <Text type="secondary">Xử lý các yêu cầu xin miễn giảm phạt hoặc cơ cấu lại nợ quá hạn</Text>
                </div>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 150 }}
                    placeholder="Trạng thái"
                >
                    <Option value="">Tất cả trạng thái</Option>
                    <Option value="PENDING">Chờ duyệt</Option>
                    <Option value="APPROVED">Đã duyệt</Option>
                    <Option value="REJECTED">Đã từ chối</Option>
                </Select>
                <Select
                    value={typeFilter}
                    onChange={setTypeFilter}
                    style={{ width: 150 }}
                    placeholder="Loại yêu cầu"
                >
                    <Option value="">Tất cả loại</Option>
                    <Option value="WAIVE_PENALTY">Xóa phạt</Option>
                    <Option value="RESCHEDULE">Cơ cấu nợ</Option>
                    <Option value="WRITE_OFF">Xóa nợ</Option>
                    <Option value="WAIVE_INTEREST">Xóa lãi</Option>
                </Select>
            </div>

            <Table
                columns={columns}
                dataSource={requests}
                rowKey="_id"
                loading={loading}
                pagination={{
                    current: page,
                    pageSize: limit,
                    total: total,
                    onChange: (p) => setPage(p)
                }}
            />

            <Modal
                title="Duyệt Cơ Cấu Nợ"
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={handleApproveReschedule}
                okText="Duyệt Cơ Cấu"
                cancelText="Đóng"
                okButtonProps={{ type: 'primary' }}
            >
                {selectedRequest && (
                    <div>
                        <p>Bạn sắp duyệt đẩy ngày trả nợ tiếp theo cho khoản vay <b>#{selectedRequest.fineractLoanId}</b> sang <b>{dayjs(selectedRequest.proposedRescheduleDate).format('YYYY-MM-DD')}</b>.</p>
                        <p>Hành động này sẽ gọi lệnh Reschedule trên Fineract với First Repayment Date là kỳ chưa trả gần nhất.</p>

                        <div style={{ marginTop: 16 }}>
                            <Text strong>Ghi chú quyết định (tuỳ chọn):</Text>
                            <Input.TextArea
                                rows={3}
                                value={adminNote}
                                onChange={(e) => setAdminNote(e.target.value)}
                                placeholder="Ghi chú thêm về quyết định này..."
                                style={{ marginTop: 8 }}
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
