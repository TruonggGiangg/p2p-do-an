import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme, Typography, Button, Input, Form, Alert, Card } from 'antd';
import { adminApi } from '../api/admin';
import { AbilityContext } from '../AbilityContext';
import { buildAbilityForRole } from '../ability';

const { Title, Text } = Typography;
const ALLOWED_ROLES = ['admin', 'staff'];

export default function LoginPage() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const ability = useContext(AbilityContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.login(username, password);
      const data = (res.data as any)?.data ?? res.data;
      const roles: string[] = data?.roles ?? [];
      if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
        setError('Tài khoản không có quyền truy cập hệ thống quản trị.');
        return;
      }
      localStorage.setItem('admin_access_token', res.data.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(data));

      // Fetch real permissions from server, fallback to role-based
      try {
        const permRes = await adminApi.getMyPermissions();
        ability.update(permRes.rules);
      } catch {
        ability.update(buildAbilityForRole(roles).rules);
      }

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: token.colorBgLayout,
      transition: 'background 0.3s ease'
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          boxShadow: token.boxShadow,
          borderRadius: 0,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 0,
            background: token.colorPrimary,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, color: '#fff', fontSize: 20, marginBottom: 16
          }}>P2</div>
          <Title level={3} style={{ margin: 0 }}>P2P Admin</Title>
          <Text type="secondary">Đăng nhập vào hệ thống quản trị</Text>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="Tên đăng nhập" required>
            <Input
              size="large"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item label="Mật khẩu" required>
            <Input.Password
              size="large"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              style={{ fontWeight: 600 }}
            >
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

