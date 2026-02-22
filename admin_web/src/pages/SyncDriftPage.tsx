import React, { useState, useEffect } from 'react';
import { adminApi, type SyncDriftLogDto } from '../api/admin';

export default function SyncDriftPage() {
  const [logs, setLogs] = useState<SyncDriftLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSyncDriftLogs(30);
      setLogs(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runSync = async () => {
    setSyncing(true);
    try {
      await adminApi.syncCompare();
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message || 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Đồng bộ / Cảnh báo</h1>
        <button
          onClick={runSync}
          disabled={syncing}
          style={{ padding: '10px 16px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600 }}
        >
          {syncing ? 'Đang đồng bộ...' : 'Chạy so sánh ngay'}
        </button>
      </div>
      <p style={{ color: '#8b949e', marginBottom: 16 }}>
        Mỗi khi app gọi danh sách sản phẩm vay, server tự so sánh với Fineract và ghi log. Tại đây bạn xem lịch sử thay đổi (thêm/xóa/sửa sản phẩm) để điều chỉnh cấu hình cho phù hợp.
      </p>
      {loading ? (
        <p style={{ color: '#8b949e' }}>Đang tải...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {logs.length === 0 ? (
            <div style={{ padding: 24, background: '#161b22', border: '1px solid #30363d', borderRadius: 8, textAlign: 'center', color: '#8b949e' }}>
              Chưa có bản ghi đồng bộ. Hãy chạy "Chạy so sánh ngay" hoặc đợi app gọi API danh sách sản phẩm.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log._id}
                style={{
                  padding: 16,
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 8,
                  borderLeft: log.hasDrift ? '4px solid #da3633' : '4px solid #238636',
                }}
              >
                <div style={{ marginBottom: 8, color: '#8b949e', fontSize: 14 }}>
                  {new Date(log.syncedAt).toLocaleString('vi-VN')}
                  {log.hasDrift && <span style={{ marginLeft: 8, color: '#f85149', fontWeight: 600 }}>Có thay đổi</span>}
                </div>
                {log.hasDrift && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}>
                    {log.added.length > 0 && (
                      <div>
                        <strong style={{ color: '#3fb950' }}>Thêm ({log.added.length}):</strong>{' '}
                        {log.added.map((a) => `${a.shortName || a.name || a.id}`).join(', ')}
                      </div>
                    )}
                    {log.removed.length > 0 && (
                      <div>
                        <strong style={{ color: '#f85149' }}>Xóa ({log.removed.length}):</strong>{' '}
                        {log.removed.map((r) => `${r.shortName || r.name || r.id}`).join(', ')}
                      </div>
                    )}
                    {log.modified.length > 0 && (
                      <div>
                        <strong style={{ color: '#d29922' }}>Sửa ({log.modified.length}):</strong>{' '}
                        {log.modified.map((m) => `${m.shortName || m.name || m.id}`).join(', ')}
                      </div>
                    )}
                  </div>
                )}
                {!log.hasDrift && <span style={{ color: '#3fb950' }}>Không có thay đổi so với lần trước.</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
