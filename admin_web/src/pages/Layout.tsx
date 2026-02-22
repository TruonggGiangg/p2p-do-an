import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: 'block',
  padding: '10px 16px',
  color: isActive ? '#58a6ff' : '#8b949e',
  fontWeight: isActive ? 600 : 400,
  textDecoration: 'none',
});

export default function Layout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_user');
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220,
          background: '#161b22',
          borderRight: '1px solid #30363d',
          padding: '24px 0',
        }}
      >
        <div style={{ padding: '0 16px 16px', fontWeight: 700, fontSize: 18 }}>P2P Admin</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavLink to="/" style={navLinkStyle}>Loại tài liệu</NavLink>
          <NavLink to="/loan-products" style={navLinkStyle}>Sản phẩm vay</NavLink>
          <NavLink to="/sync-drift" style={navLinkStyle}>Đồng bộ / Cảnh báo</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: 16 }}>
          <button
            onClick={logout}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#8b949e',
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
