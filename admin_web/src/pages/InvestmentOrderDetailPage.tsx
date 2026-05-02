import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Typography,
  Button,
  Space,
  Divider,
  Row,
  Col,
  Statistic,
  message,
  theme,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  DoubleRightOutlined,
} from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import PageHeader from '../components/PageHeader';
import { SimplePageSkeleton } from '../components/PageSkeleton';
import { marketApi, type InvestmentOrderDetail } from '../api/market';
import { PRO_TABLE_DEFAULTS } from '../utils/proTableConfig';

const { Text, Title } = Typography;

function fmtNum(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export default function InvestmentOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InvestmentOrderDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    marketApi.getBidDetail(id)
      .then(setData)
      .catch((e) => {
        message.error(e?.message || 'Không thể tải chi tiết lệnh');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <SimplePageSkeleton rows={8} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Title level={4}>Không tìm thấy lệnh đầu tư</Title>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/investment-orders')}> Quay lại danh sách</Button>
      </div>
    );
  }

  const { investor, config, matchedLoans } = data;

  const loanColumns: ProColumns<any>[] = [
    {
      title: 'Mã khoản vay',
      dataIndex: 'loanCode',
      render: (text, r) => (
        <Space direction="vertical" size={0}>
          <Link to={`/loans?q=${r.loanCode}`} style={{ fontWeight: 600 }}>{text}</Link>
          {r.fineractLoanId && <Text type="secondary" style={{ fontSize: 11 }}>#FL_{r.fineractLoanId}</Text>}
        </Space>
      ),
    },
    {
      title: 'Vốn vay',
      dataIndex: 'loanCapital',
      align: 'right',
      render: (val: number) => <Text strong>{fmtNum(val)}</Text>,
    },
    {
      title: 'Số node khớp',
      dataIndex: 'nodeMatch',
      align: 'center',
      render: (val: number) => <Tag color="blue">{val} Nodes</Tag>,
    },
    {
      title: 'Lãi suất / Kỳ hạn',
      render: (_, r) => (
        <Text>{r.loanRate}% / {r.loanPeriod}T</Text>
      ),
    },
    {
      title: 'Mục đích',
      dataIndex: 'loanPurpose',
      ellipsis: true,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'loanStatus',
      render: (status: string, r) => (
        <Space>
          <Tag color={status === 'approved' ? 'green' : 'blue'}>{status.toUpperCase()}</Tag>
          {r.isInvested && <Tag color="success" icon={<CheckCircleOutlined />}>ĐÃ ĐẦU TƯ</Tag>}
        </Space>
      ),
    },
    {
      title: 'Thời gian khớp',
      dataIndex: 'matchedAt',
      render: (val: string) => {
        const d = new Date(val);
        return <Text type="secondary" style={{ fontSize: 12 }}>{d.toLocaleDateString('vi-VN')} {d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>;
      },
    },
  ];

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        title={`Chi tiết Lệnh đầu tư`}
        description={`Mã lệnh: ${data.id}`}
        breadcrumb={[
          { label: 'Bảng khớp lệnh', path: '/market' },
          { label: 'Lệnh đầu tư', path: '/investment-orders' },
          { label: 'Chi tiết' },
        ]}
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/investment-orders')}>Quay lại</Button>
        }
      />

      <div style={{ padding: '0 24px' }}>
        <Row gutter={[24, 24]}>
          {/* Cấu hình lệnh */}
          <Col xs={24} lg={16}>
            <Card
              title={
                <Space>
                  <WalletOutlined style={{ color: token.colorPrimary }} />
                  <span>Cấu hình đầu tư</span>
                </Space>
              }
              extra={<Tag color={config.status === 'open' ? 'success' : 'default'}>{config.status === 'open' ? 'ĐANG MỞ' : 'ĐÃ ĐÓNG'}</Tag>}
            >
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title="Tổng vốn" value={config.totalCapital} formatter={(v) => fmtNum(Number(v))} />
                </Col>
                <Col span={6}>
                  <Statistic 
                    title="Đã khớp" 
                    value={config.matchedCapital} 
                    formatter={(v) => fmtNum(Number(v))}
                    valueStyle={{ color: token.colorSuccess }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic title="Vốn còn lại" value={config.availableCapital} formatter={(v) => fmtNum(Number(v))} />
                </Col>
                <Col span={6}>
                  <Statistic title="Nodes" value={`${config.matchedNodes}/${config.totalNodes}`} />
                </Col>
              </Row>

              <Divider dashed />

              <Descriptions column={2} size="small">
                <Descriptions.Item label="Lãi suất mong muốn">
                  <Text strong>{config.interestRange.min}% – {config.interestRange.max}%</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Kỳ hạn chấp nhận">
                  <Text strong>{config.periodRange.min} – {config.periodRange.max} tháng</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Mục đích đầu tư" span={2}>
                  {config.purpose.length > 0 ? config.purpose.map(p => <Tag key={p} style={{ marginBottom: 4 }}>{p}</Tag>) : <Text type="secondary">Tất cả</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Giới hạn vốn/khoản vay">
                  <Text>{fmtNum(config.maxCapitalPerLoan)} VND</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Ngày tạo">
                  <Text type="secondary">{new Date(config.createdAt).toLocaleString('vi-VN')}</Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* Thông tin nhà đầu tư */}
          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <UserOutlined style={{ color: token.colorPrimary }} />
                  <span>Nhà đầu tư</span>
                </Space>
              }
              hoverable
            >
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ marginBottom: 4 }}>{investor.displayName}</Title>
                <Text type="secondary">@{investor.username}</Text>
              </div>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Điện thoại">
                  <Text copyable>{investor.phone || 'N/A'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  <Text>{investor.email || 'N/A'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="User ID">
                  <Text type="secondary" style={{ fontSize: 12 }}>{investor.id}</Text>
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <Button block type="dashed" onClick={() => navigate(`/customers/${investor.id}`)}>Xem hồ sơ chi tiết</Button>
              </div>
            </Card>
          </Col>

          {/* Danh sách khoản vay đã ghép */}
          <Col span={24}>
            <Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <DoubleRightOutlined />
              Các khoản vay đã khớp ({matchedLoans.length})
            </Title>
            <ProTable
              {...PRO_TABLE_DEFAULTS}
              columns={loanColumns}
              dataSource={matchedLoans}
              rowKey="loanId"
              search={false}
              options={false}
              pagination={false}
              ghost
            />
          </Col>
        </Row>
      </div>
    </div>
  );
}
