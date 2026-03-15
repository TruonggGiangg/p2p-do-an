import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import {
  Card, Table, Button, Space, Tag, Typography, Descriptions, Drawer, Empty,
  Skeleton, message, Popconfirm, theme, Row, Col, Avatar, Divider, Badge,
} from 'antd';
import {
  FileTextOutlined, CheckOutlined, CloseOutlined, EyeOutlined, UserOutlined,
  IdcardOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { adminApi, KycPendingUserDto, KycDetailDto } from '../api/admin';
import { useAbility } from '@casl/react';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function KYCApprovalsPage() {
  const { token } = theme.useToken();
  const ability = useAbility(AbilityContext);
  const [users, setUsers] = useState<KycPendingUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KycDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Set<string>>(new Set());
  const [messageApi, contextHolder] = message.useMessage();

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminApi.getPendingKyc();
      setUsers(list);
    } catch (e: any) {
      messageApi.error(e?.response?.data?.message || 'Không thể tải danh sách KYC');
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleViewDetail = useCallback(async (userId: string) => {
    setViewUserId(userId);
    setLoadingDetail(true);
    setDetail(null);
    try {
      const data = await adminApi.getKycDetail(userId);
      setDetail(data);
    } catch (e: any) {
      messageApi.error(e?.response?.data?.message || 'Không thể tải chi tiết KYC');
      setViewUserId(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [messageApi]);

  const handleApprove = useCallback(async (userId: string) => {
    setApproving(s => new Set(s).add(userId));
    try {
      await adminApi.approveKyc(userId);
      messageApi.success('Đã kích hoạt tài khoản');
      setViewUserId(null);
      setDetail(null);
      loadPending();
    } catch (e: any) {
      messageApi.error(e?.response?.data?.message || 'Kích hoạt tài khoản thất bại');
    } finally {
      setApproving(s => { const n = new Set(s); n.delete(userId); return n; });
    }
  }, [messageApi, loadPending]);

  const handleReject = useCallback(async (userId: string) => {
    setRejecting(s => new Set(s).add(userId));
    try {
      await adminApi.rejectKyc(userId);
      messageApi.success('Đã từ chối kích hoạt');
      setViewUserId(null);
      setDetail(null);
      loadPending();
    } catch (e: any) {
      messageApi.error(e?.response?.data?.message || 'Từ chối kích hoạt thất bại');
    } finally {
      setRejecting(s => { const n = new Set(s); n.delete(userId); return n; });
    }
  }, [messageApi, loadPending]);

  const [docImageUrls, setDocImageUrls] = useState<Record<string, string>>({});

  const handleDownloadDocument = async (doc: { id: number; name: string; entityType: string; entityId: number; label: string }) => {
    if (!viewUserId) return;
    const hide = messageApi.loading('Đang tải tài liệu...', 0);
    try {
      const response = await adminApi.downloadKycDocument(viewUserId, doc.entityType, doc.entityId, doc.id);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const isViewable = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(contentType);
      if (isViewable) {
        window.open(url, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', doc.name || 'document');
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (e) {
      messageApi.error('Không thể tải tài liệu');
    } finally {
      hide();
    }
  };

  useEffect(() => {
    if (!viewUserId || !detail?.documents?.length) return;
    const urls: Record<string, string> = {};
    let cancelled = false;
    (async () => {
      for (const doc of detail.documents) {
        if (cancelled) break;
        const key = `${doc.entityType}-${doc.entityId}-${doc.id}`;
        try {
          const response = await adminApi.downloadKycDocument(viewUserId, doc.entityType, doc.entityId, doc.id);
          const contentType = response.headers['content-type'] || 'image/jpeg';
          if (['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
            const blob = new Blob([response.data], { type: contentType });
            urls[key] = window.URL.createObjectURL(blob);
          }
        } catch {
          // skip failed
        }
      }
      if (!cancelled) setDocImageUrls(urls);
    })();
    return () => {
      cancelled = true;
      setDocImageUrls(prev => {
        Object.values(prev).forEach(u => window.URL.revokeObjectURL(u));
        return {};
      });
    };
  }, [viewUserId, detail?.documents]);

  const columns = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_: any, r: KycPendingUserDto) => (
        <Space>
          <Avatar size={36} icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
          <div>
            <Text strong>{r.displayName || r.username}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{r.username}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '–' },
    {
      title: 'Fineract ID',
      dataIndex: 'fineractClientId',
      key: 'fineractClientId',
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '–',
    },
    {
      title: 'Ngày hoàn thành',
      dataIndex: 'kycCompletedAt',
      key: 'kycCompletedAt',
      render: (v: string) => v ? <Text style={{ fontSize: 13 }}>{dayjs(v).format('DD/MM/YYYY HH:mm')}</Text> : <Text type="secondary">Chưa có</Text>,
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_: any, r: KycPendingUserDto) => (
        <Space>
          <Button type="primary" icon={<EyeOutlined />} onClick={() => handleViewDetail(r._id)}>
            Xem chi tiết
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Phê duyệt KYC"
        description="Xét duyệt hồ sơ định danh khách hàng (eKYC / KYC trực tiếp)"
        breadcrumb={[{ label: 'Khách hàng', path: '/customers' }, { label: 'Phê duyệt KYC' }]}
      />
      {contextHolder}
      <Card
        bordered={false}
        style={{ borderRadius: 12, marginBottom: 16 }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Text strong style={{ fontSize: 18 }}>
              <IdcardOutlined style={{ marginRight: 8 }} />
              Kích hoạt tài khoản (eKYC)
            </Text>
            <br />
            <Text type="secondary">Danh sách người dùng chờ xác minh định danh</Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={loadPending} loading={loading}>
            Làm mới
          </Button>
        </div>

        <Table
          rowKey="_id"
          loading={loading}
          dataSource={users}
          columns={columns}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} hồ sơ chờ duyệt` }}
          size="middle"
          onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => handleViewDetail(r._id) })}          locale={{ emptyText: <Empty description="Chưa có hồ sơ KYC chờ kích hoạt" /> }}
        />
      </Card>

      <Drawer
        title={
          <Space>
            <Avatar icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
            <span>
              {detail?.user?.profile ? `${detail.user.profile.firstName || ''} ${detail.user.profile.lastName || ''}`.trim() : detail?.user?.username || 'Chi tiết KYC'}
            </span>
          </Space>
        }
        open={!!viewUserId}
        onClose={() => { setViewUserId(null); setDetail(null); }}
        width={Math.min(720, window.innerWidth * 0.9)}
        destroyOnClose
        extra={
          viewUserId && detail && ability.can(Action.Approve, 'Kyc') && (
            <Space>
              <Popconfirm
                title="Kích hoạt tài khoản"
                description="Xác nhận kích hoạt tài khoản cho hồ sơ định danh này?"
                onConfirm={() => handleApprove(viewUserId)}
                okText="Kích hoạt"
                cancelText="Hủy"
              >
                <Button type="primary" icon={<CheckOutlined />} loading={approving.has(viewUserId)}>
                  Kích hoạt tài khoản
                </Button>
              </Popconfirm>
              <Popconfirm
                title="Từ chối kích hoạt"
                description="Xác nhận từ chối hồ sơ định danh này?"
                onConfirm={() => handleReject(viewUserId)}
                okText="Từ chối"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<CloseOutlined />} loading={rejecting.has(viewUserId)}>
                  Từ chối
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      >
        {loadingDetail ? (
          <Skeleton active />
        ) : detail ? (
          <div style={{ padding: '0 8px' }}>
            <Descriptions title="Thông tin OCR (CCCD)" column={1} bordered size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Họ tên">{detail.ocr?.fullName || '–'}</Descriptions.Item>
              <Descriptions.Item label="Số CCCD">{detail.ocr?.ssn || '–'}</Descriptions.Item>
              <Descriptions.Item label="Ngày sinh">{detail.ocr?.dateOfBirth || '–'}</Descriptions.Item>
              <Descriptions.Item label="Giới tính">{detail.ocr?.sex || '–'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{detail.ocr?.address || '–'}</Descriptions.Item>
              <Descriptions.Item label="Ngày hoàn thành KYC">
                {detail.metadata?.kycCompletedAt ? new Date(detail.metadata.kycCompletedAt).toLocaleString('vi-VN') : '–'}
              </Descriptions.Item>
            </Descriptions>

            <Divider>
              <Space><FileTextOutlined /> Hình ảnh CCCD (từ Fineract)</Space>
            </Divider>
            {detail.documents && detail.documents.length > 0 ? (
              <Row gutter={[16, 16]}>
                {detail.documents.map((doc) => {
                  const key = `${doc.entityType}-${doc.entityId}-${doc.id}`;
                  const imgUrl = docImageUrls[key];
                  return (
                    <Col xs={24} sm={12} key={key}>
                      <Card size="small" bordered style={{ borderRadius: 8 }}>
                        <div style={{ marginBottom: 8 }}>
                          <Badge count={doc.label} style={{ backgroundColor: token.colorPrimary }} />
                        </div>
                        <div style={{ minHeight: 180, background: token.colorFillAlter, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {imgUrl ? (
                            <img src={imgUrl} alt={doc.label} style={{ maxHeight: 200, objectFit: 'contain', width: '100%' }} />
                          ) : (
                            <Text type="secondary">Đang tải...</Text>
                          )}
                        </div>
                        <Button
                          type="link"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => handleDownloadDocument(doc)}
                          style={{ marginTop: 8 }}
                        >
                          Xem / Tải
                        </Button>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            ) : (
              <Empty description="Chưa có tài liệu CCCD trong Fineract" />
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
