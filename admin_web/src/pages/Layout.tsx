import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography, Avatar, Space, theme, Tooltip } from 'antd';
import {
  FileTextOutlined,
  BankOutlined,
  SyncOutlined,
  UserOutlined,
  CheckCircleOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useTheme } from '../App';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/', icon: <FileTextOutlined />, label: 'Loại tài liệu' },
  { key: '/loan-products', icon: <BankOutlined />, label: 'Sản phẩm vay' },
  { key: '/loan-approvals', icon: <CheckCircleOutlined />, label: 'Phê duyệt khoản vay' },
  { key: '/customers', icon: <UserOutlined />, label: 'Khách hàng' },
  { key: '/sync-drift', icon: <SyncOutlined />, label: 'Đồng bộ / Cảnh báo' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();
  const { isDarkMode, toggleTheme } = useTheme();

  const user: any = (() => {
    try { return JSON.parse(localStorage.getItem('admin_user') || '{}'); } catch { return {}; }
  })();

  const logout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_user');
    navigate('/login', { replace: true });
  };

  const selectedKey = menuItems
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
        width={240}
        style={{
          background: isDarkMode ? '#020617' : '#0F172A',
          borderRight: `1px solid ${token.colorBorder}`,
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: `1px solid ${token.colorBorder}`,
          marginBottom: 8,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: token.colorPrimary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, color: '#fff', fontSize: 14, flexShrink: 0,
          }}>P2</div>
          {!collapsed && (
            <Text strong style={{ color: 'rgba(255,255,255,0.95)', fontSize: 15 }}>P2P Admin</Text>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              onClick: () => navigate(item.key),
            }))}
            style={{ background: 'transparent', border: 'none' }}
          />
        </div>

        {/* User + Logout */}
        <div style={{
          padding: collapsed ? '12px 0' : '12px 16px',
          borderTop: `1px solid ${token.colorBorder}`,
          background: isDarkMode ? '#020617' : '#0F172A',
          display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <Avatar size="small" icon={<UserOutlined />} style={{ background: token.colorPrimary, flexShrink: 0 }} />
          {!collapsed && (
            <Text style={{ color: token.colorTextSecondary, fontSize: 12, flex: 1 }} ellipsis>
              {user?.username || 'Admin'}
            </Text>
          )}
        </div>
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'all 0.2s' }}>
        <Header style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorder}`,
          padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          height: 64,
          position: 'fixed',
          top: 0,
          right: 0,
          left: collapsed ? 80 : 240,
          zIndex: 99,
          transition: 'all 0.2s',
        }}>
          <Space size="middle">
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
                  color: isDarkMode ? '#2DD4BF' : '#0D9488',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              />
            </Tooltip>

            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={logout}
              style={{ color: token.colorTextSecondary }}
            >
              Đăng xuất
            </Button>
          </Space>
        </Header>
        <Content style={{
          margin: '88px 24px 24px 24px',
          padding: 24,
          background: token.colorBgContainer,
          borderRadius: token.borderRadius,
          minHeight: 'calc(100vh - 112px)',
          overflow: 'auto',
          transition: 'all 0.3s ease'
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

