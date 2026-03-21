import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Avatar, Space, theme, Tooltip, Dropdown } from 'antd';
import React from 'react';
import { useAbility } from '@casl/react';
import {
  FileTextOutlined,
  BankOutlined,
  WalletOutlined,
  UserOutlined,
  CheckCircleOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
  TeamOutlined,
  IdcardOutlined,
  ToolOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
  FontSizeOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTheme } from '../App';
import { useFontSize, type FontSizePreset } from '../components/FontSizeProvider';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';

const { Sider, Header, Content } = Layout;
const { Text, Title } = Typography;

const menuItems = [
  { key: '/', icon: <FileTextOutlined />, label: 'Loại tài liệu' },
  { key: '/loan-products', icon: <BankOutlined />, label: 'Sản phẩm vay' },
  { key: '/savings-products', icon: <WalletOutlined />, label: 'Sản phẩm tiết kiệm' },
  { key: '/loans', icon: <DollarOutlined />, label: 'Quản lý khoản vay' },
  { key: '/delinquency-policies', icon: <ExclamationCircleOutlined />, label: 'Cấu hình xử lý nợ xấu' },
  { key: '/credit-score-weights', icon: <LineChartOutlined />, label: 'Trọng số điểm tín dụng' },
  { key: '/loan-approvals', icon: <CheckCircleOutlined />, label: 'Phê duyệt khoản vay' },
  { key: '/loan-support-requests', icon: <ToolOutlined />, label: 'Yêu cầu hỗ trợ nợ' },
  { key: '/customers', icon: <UserOutlined />, label: 'Khách hàng' },
  { key: '/staff', icon: <TeamOutlined />, label: 'Nhân viên' },
  { key: '/roles-permissions', icon: <SafetyCertificateOutlined />, label: 'Vai trò & Phân quyền' },
  { key: '/background-jobs', icon: <ThunderboltOutlined />, label: 'Tác vụ chạy ngầm' },
  { key: '/profile', icon: <IdcardOutlined />, label: 'Hồ sơ cá nhân' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();
  const { isDarkMode, toggleTheme } = useTheme();
  const { fontSize, setFontSize } = useFontSize();
  const ability = useAbility(AbilityContext);

  const fontSizeLabel: Record<FontSizePreset, string> = {
    compact: 'Nhỏ gọn',
    default: 'Mặc định',
    large: 'Lớn',
  };

  const user: any = (() => {
    try { return JSON.parse(localStorage.getItem('admin_user') || '{}'); } catch { return {}; }
  })();

  const userRoles: string[] = user?.roles || [];
  const roleLabel = userRoles.includes('admin') ? 'Quản trị viên' : 'Nhân viên';

  // Filter menu items based on CASL ability
  const filteredMenuItems = menuItems.filter(item => {
    if (item.key === '/staff') return ability.can(Action.Read, 'Staff');
    if (item.key === '/roles-permissions') return ability.can(Action.Manage, 'all');
    if (item.key === '/background-jobs') return ability.can(Action.Manage, 'all');
    if (item.key === '/loan-support-requests') return ability.can(Action.Read, 'LoanApplication');
    if (item.key === '/profile') return !userRoles.includes('admin'); // Staff only
    return true;
  });

  const logout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_user');
    ability.update([]); // Clear CASL permissions
    navigate('/login', { replace: true });
  };

  const selectedKey = filteredMenuItems
    .slice()
    .reverse()
    .find((item) => location.pathname === item.key || (item.key !== '/' && location.pathname.startsWith(item.key)))
    ?.key ?? '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={260}
        style={{
          background: isDarkMode ? '#020617' : '#0F172A',
          borderRight: `1px solid ${isDarkMode ? '#1E293B' : '#E2E8F0'}`,
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Logo */}
        <div style={{
          padding: collapsed ? '24px 0' : '28px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: `1px solid ${isDarkMode ? '#1E293B' : '#E2E8F0'}`,
          marginBottom: 8,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover || token.colorPrimary} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#fff', fontSize: 16, flexShrink: 0,
            boxShadow: '0 4px 12px rgba(30, 64, 175, 0.3)',
          }}>P2</div>
          {!collapsed && (
            <Text strong style={{
              color: '#FFFFFF',
              fontSize: 'var(--font-size-lg)',
              letterSpacing: '0.5px',
              fontWeight: 700,
            }}>P2P Admin</Text>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={filteredMenuItems.map((item) => ({
              key: item.key,
              icon: React.cloneElement(item.icon as React.ReactElement, {
                style: { fontSize: 16, marginRight: 4 }
              }),
              label: item.label,
              onClick: () => navigate(item.key),
            }))}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 'var(--font-size-sm)',
            }}
          />
        </div>

        {/* User + Logout */}
        <div style={{
          padding: collapsed ? '16px 0' : '16px 20px',
          borderTop: `1px solid ${isDarkMode ? '#1E293B' : '#E2E8F0'}`,
          background: isDarkMode ? '#020617' : '#0F172A',
          display: 'flex', alignItems: 'center', gap: 12,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <Avatar
            size={collapsed ? 32 : 36}
            icon={<UserOutlined />}
            style={{
              background: `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover || token.colorPrimary} 100%)`,
              flexShrink: 0,
              fontWeight: 600,
            }}
          />
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ color: '#FFFFFF', fontSize: 'var(--font-size-base)', display: 'block' }}>
                {user?.username || 'Admin'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'var(--font-size-xs)', display: 'block' }}>
                {roleLabel}
              </Text>
            </div>
          )}
        </div>
      </Sider>

      <Layout style={{
        marginLeft: collapsed ? 80 : 260,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        background: isDarkMode ? '#0F172A' : '#F1F5F9',
      }}>
        <Header style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${isDarkMode ? '#1E293B' : '#E2E8F0'}`,
          padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 64,
          position: 'fixed',
          top: 0,
          right: 0,
          left: collapsed ? 80 : 260,
          zIndex: 99,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}>
          <div>
            <Title level={4} style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: isDarkMode ? '#F1F5F9' : '#0F172A',
            }}>
              {filteredMenuItems.find(item => item.key === selectedKey)?.label || 'Dashboard'}
            </Title>
          </div>

          <Space size="middle">
            <Dropdown
              menu={{
                items: (['compact', 'default', 'large'] as FontSizePreset[]).map((size) => ({
                  key: size,
                  label: (
                    <Space>
                      <span style={{
                        fontSize: size === 'compact' ? 11 : size === 'large' ? 15 : 13,
                        fontWeight: fontSize === size ? 600 : 400,
                      }}>
                        A
                      </span>
                      <span>{fontSizeLabel[size]}</span>
                      {fontSize === size && <span style={{ color: token.colorPrimary }}>✓</span>}
                    </Space>
                  ),
                })),
                onClick: ({ key }) => setFontSize(key as FontSizePreset),
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Tooltip title="Cỡ chữ">
                <Button
                  type="text"
                  icon={<FontSizeOutlined />}
                  style={{
                    fontSize: '18px',
                    color: isDarkMode ? '#3B82F6' : '#1E40AF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                  }}
                />
              </Tooltip>
            </Dropdown>

            <Tooltip title={isDarkMode ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}>
              <Button
                type="text"
                icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                onClick={(e) => {
                  const x = e.clientX;
                  const y = e.clientY;

                  // @ts-ignore
                  if (!document.startViewTransition) {
                    toggleTheme();
                    return;
                  }

                  document.documentElement.style.setProperty('--reveal-x', `${x}px`);
                  document.documentElement.style.setProperty('--reveal-y', `${y}px`);

                  // @ts-ignore
                  document.startViewTransition(() => {
                    toggleTheme();
                  });
                }}
                style={{
                  fontSize: '18px',
                  color: isDarkMode ? '#3B82F6' : '#1E40AF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                }}
              />
            </Tooltip>

            <Button
              type="primary"
              danger
              icon={<LogoutOutlined />}
              onClick={logout}
              style={{
                height: 40,
                padding: '0 20px',
                fontWeight: 500,
              }}
            >
              Đăng xuất
            </Button>
          </Space>
        </Header>
        <Content style={{
          margin: '88px 32px 32px 32px',
          padding: 32,
          background: token.colorBgContainer,
          borderRadius: 10,
          minHeight: 'calc(100vh - 152px)',
          overflow: 'auto',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

