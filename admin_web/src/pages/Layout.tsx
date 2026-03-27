import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Button, Typography, Avatar, Space, theme, Tooltip, Dropdown } from 'antd';
import React from 'react';
import { useAbility } from '@casl/react';
import {
  FileTextOutlined,
  BankOutlined,
  WalletOutlined,
  FundOutlined,
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
  AuditOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTheme } from '../App';
import { useFontSize, type FontSizePreset } from '../components/FontSizeProvider';
import { AbilityContext } from '../AbilityContext';
import { Action } from '../ability';

const { Sider, Header, Content } = Layout;
const { Text, Title } = Typography;

/* ── Menu group definitions ────────────────────────────── */
interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
}

interface MenuGroup {
  groupLabel: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    groupLabel: 'TỔNG QUAN',
    items: [
      { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    ],
  },
  {
    groupLabel: 'QUẢN LÝ SẢN PHẨM',
    items: [
      { key: '/document-types', icon: <FileTextOutlined />, label: 'Loại tài liệu' },
      { key: '/loan-products', icon: <BankOutlined />, label: 'Sản phẩm vay' },
      { key: '/savings-products', icon: <WalletOutlined />, label: 'Sản phẩm tiết kiệm' },
      { key: '/fd-products', icon: <FundOutlined />, label: 'Quỹ đầu tư có kỳ hạn' },
    ],
  },
  {
    groupLabel: 'QUẢN LÝ VAY',
    items: [
      { key: '/loans', icon: <DollarOutlined />, label: 'Quản lý khoản vay' },
      { key: '/loan-approvals', icon: <CheckCircleOutlined />, label: 'Phê duyệt khoản vay' },
      { key: '/loan-support-requests', icon: <ToolOutlined />, label: 'Yêu cầu hỗ trợ nợ' },
    ],
  },
  {
    groupLabel: 'CẤU HÌNH',
    items: [
      { key: '/delinquency-policies', icon: <ExclamationCircleOutlined />, label: 'Cấu hình xử lý nợ xấu' },
      { key: '/loan-evaluation-config', icon: <AuditOutlined />, label: 'Đánh giá khoản vay' },
    ],
  },
  {
    groupLabel: 'NGƯỜI DÙNG',
    items: [
      { key: '/customers', icon: <UserOutlined />, label: 'Khách hàng' },
      { key: '/staff', icon: <TeamOutlined />, label: 'Nhân viên' },
      { key: '/roles-permissions', icon: <SafetyCertificateOutlined />, label: 'Vai trò & Phân quyền' },
    ],
  },
  {
    groupLabel: 'HỆ THỐNG',
    items: [
      { key: '/background-jobs', icon: <ThunderboltOutlined />, label: 'Tác vụ chạy ngầm' },
    ],
  },
];

/* Hidden from sidebar but still valid routes */
const hiddenMenuItems: MenuItem[] = [
  { key: '/profile', icon: <IdcardOutlined />, label: 'Hồ sơ cá nhân' },
];

/* ── Component ─────────────────────────────────────────── */
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

  /* ── Permission filter ── */
  const canSee = (key: string): boolean => {
    if (key === '/staff') return ability.can(Action.Read, 'Staff');
    if (key === '/roles-permissions') return ability.can(Action.Manage, 'all');
    if (key === '/background-jobs') return ability.can(Action.Manage, 'all');
    if (key === '/loan-support-requests') return ability.can(Action.Read, 'LoanApplication');
    if (key === '/profile') return !userRoles.includes('admin');
    return true;
  };

  /* ── Active key resolution ── */
  const allItems = menuGroups.flatMap(g => g.items).concat(hiddenMenuItems);
  const selectedKey = allItems
    .slice()
    .reverse()
    .find(item =>
      location.pathname === item.key ||
      (item.key !== '/' && location.pathname.startsWith(item.key))
    )?.key ?? '/dashboard';

  /* ── Derived page title ── */
  const currentLabel = allItems.find(i => i.key === selectedKey)?.label || 'Dashboard';

  const logout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_user');
    ability.update([]);
    navigate('/login', { replace: true });
  };

  /* ── Styles ── */
  const siderBg = isDarkMode ? '#070d1f' : '#0F172A';
  const activeItemBg = isDarkMode ? 'rgba(77, 142, 255, 0.12)' : 'rgba(59, 130, 246, 0.15)';
  const activeGlow = isDarkMode ? '0 0 12px rgba(77, 142, 255, 0.25)' : '0 0 12px rgba(59, 130, 246, 0.2)';
  const hoverBg = isDarkMode ? 'rgba(77, 142, 255, 0.06)' : 'rgba(59, 130, 246, 0.08)';
  const groupLabelColor = isDarkMode ? '#8c909f' : '#94A3B8';
  const inactiveFg = isDarkMode ? '#b9c8de' : '#94A3B8';
  const activeFg = '#FFFFFF';
  const activeAccent = isDarkMode ? '#4d8eff' : '#3B82F6';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme="dark"
        width={264}
        collapsedWidth={72}
        style={{
          background: siderBg,
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Inner flex wrapper – Ant Design Sider wraps children in its own div,
            so we need an explicit flex container to make overflow scroll work. */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}>
          {/* ── Logo ── */}
          <div style={{
            padding: collapsed ? '20px 0' : '24px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: collapsed ? 'center' : 'flex-start',
            marginBottom: 4,
            flexShrink: 0,
            transition: 'all 0.3s ease',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, #4d8eff 0%, #3B82F6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: '#fff', fontSize: 14, flexShrink: 0,
              boxShadow: '0 4px 14px rgba(77, 142, 255, 0.35)',
              letterSpacing: '0.5px',
            }}>P2</div>
            {!collapsed && (
              <Text strong style={{
                color: '#FFFFFF',
                fontSize: 17,
                letterSpacing: '0.3px',
                fontWeight: 700,
                fontFamily: "'Manrope', var(--font-sans)",
              }}>P2P Admin</Text>
            )}
          </div>

          {/* ── Menu groups ── */}
          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: collapsed ? '4px 6px' : '4px 12px',
            transition: 'padding 0.3s ease',
          }}>
            {menuGroups.map((group, gi) => {
              const visibleItems = group.items.filter(i => canSee(i.key));
              if (visibleItems.length === 0) return null;

              return (
                <div key={gi} style={{ marginBottom: 6 }}>
                  {/* Group label */}
                  {!collapsed && (
                    <div style={{
                      padding: '12px 12px 6px 12px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: groupLabelColor,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      fontFamily: "'Inter', var(--font-sans)",
                      userSelect: 'none',
                    }}>
                      {group.groupLabel}
                    </div>
                  )}
                  {collapsed && gi > 0 && (
                    <div style={{
                      height: 1,
                      background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
                      margin: '6px 8px',
                    }} />
                  )}

                  {/* Items */}
                  {visibleItems.map(item => {
                    const isActive = selectedKey === item.key;
                    return (
                      <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                        <div
                          onClick={() => navigate(item.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: collapsed ? '10px 0' : '9px 12px',
                            margin: collapsed ? '2px 0' : '2px 0',
                            borderRadius: 8,
                            cursor: 'pointer',
                            position: 'relative',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            background: isActive ? activeItemBg : 'transparent',
                            boxShadow: isActive ? activeGlow : 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={e => {
                            if (!isActive) {
                              (e.currentTarget as HTMLDivElement).style.background = hoverBg;
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isActive) {
                              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                            }
                          }}
                        >
                          {/* Active left indicator */}
                          {isActive && (
                            <div style={{
                              position: 'absolute',
                              left: collapsed ? -6 : -12,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 3,
                              height: 20,
                              borderRadius: 4,
                              background: activeAccent,
                              boxShadow: `0 0 8px ${activeAccent}`,
                            }} />
                          )}

                          {/* Icon */}
                          {React.cloneElement(item.icon as React.ReactElement, {
                            style: {
                              fontSize: 16,
                              color: isActive ? activeFg : inactiveFg,
                              flexShrink: 0,
                              transition: 'color 0.2s ease',
                            },
                          })}

                          {/* Label */}
                          {!collapsed && (
                            <span style={{
                              fontSize: 13,
                              fontWeight: isActive ? 600 : 450,
                              color: isActive ? activeFg : inactiveFg,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              transition: 'color 0.2s ease',
                              fontFamily: "'Inter', var(--font-sans)",
                            }}>
                              {item.label}
                            </span>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* ── User panel ── */}
          <div style={{
            padding: collapsed ? '12px 6px' : '14px 16px',
            background: isDarkMode ? '#060c1c' : '#0a1628',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'all 0.3s ease',
          }}>
            <Avatar
              size={collapsed ? 30 : 34}
              icon={<UserOutlined />}
              style={{
                background: 'linear-gradient(135deg, #4d8eff 0%, #3B82F6 100%)',
                flexShrink: 0,
                fontWeight: 600,
              }}
            />
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ color: '#FFFFFF', fontSize: 13, display: 'block', lineHeight: 1.3 }}>
                  {user?.username || 'Admin'}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'block', lineHeight: 1.3 }}>
                  {roleLabel}
                </Text>
              </div>
            )}
          </div>

          {/* ── Collapse toggle ── */}
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              padding: '10px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              color: groupLabelColor,
              transition: 'all 0.2s ease',
              borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)'}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = activeFg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = groupLabelColor; }}
          >
            {collapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
          </div>
        </div>
      </Sider>

      {/* ── Main content area ── */}
      <Layout style={{
        marginLeft: collapsed ? 72 : 264,
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
          left: collapsed ? 72 : 264,
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
              {currentLabel}
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
          height: 'calc(100vh - 120px)',
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
