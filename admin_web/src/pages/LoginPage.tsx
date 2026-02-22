import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';

const ADMIN_ROLE = 'admin';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.login(username, password);
      const data = (res.data as any)?.data ?? res.data;
      const roles: string[] = data?.roles ?? [];
      if (!roles.includes(ADMIN_ROLE)) {
        setError('Tài khoản không có quyền admin.');
        return;
      }
      localStorage.setItem('admin_access_token', res.data.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(data));
      navigate('/', { replace: true });
    } catch (err: any) {
      const isNetworkError = err.message === 'Network Error' || err.code === 'ERR_NETWORK' || !err.response;
      setError(
        isNetworkError
          ? 'Không kết nối được server. Kiểm tra: (1) server_do_an_new đã chạy (npm run start:dev), (2) VITE_API_URL trong .env trỏ đúng (mặc định http://localhost:3001).'
          : err.response?.data?.message || err.message || 'Đăng nhập thất bại.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#161b22',
          padding: 32,
          borderRadius: 12,
          border: '1px solid #30363d',
        }}
      >
        <h1 style={{ margin: '0 0 24px', fontSize: 22 }}>P2P Admin</h1>
        {error && (
          <div style={{ marginBottom: 16, padding: 12, background: '#3d1f1f', color: '#f85149', borderRadius: 8 }}>
            {error}
          </div>
        )}
        <label style={{ display: 'block', marginBottom: 8, color: '#8b949e' }}>Tên đăng nhập</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          style={{
            width: '100%',
            padding: '10px 12px',
            marginBottom: 16,
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#e6edf3',
          }}
        />
        <label style={{ display: 'block', marginBottom: 8, color: '#8b949e' }}>Mật khẩu</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={{
            width: '100%',
            padding: '10px 12px',
            marginBottom: 24,
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#e6edf3',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            background: '#238636',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
