import React, { useState, useEffect } from 'react';
import { adminApi, type DocumentTypeDto } from '../api/admin';

export default function DocumentTypesPage() {
  const [list, setList] = useState<DocumentTypeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'add' | DocumentTypeDto | null>(null);
  const [name, setName] = useState('');
  const [required, setRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getDocumentTypes();
      setList(data);
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Tải danh sách thất bại');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setName('');
    setRequired(false);
    setSortOrder(list.length);
    setModal('add');
  };

  const openEdit = (doc: DocumentTypeDto) => {
    setName(doc.name);
    setRequired(doc.required);
    setSortOrder(doc.sortOrder);
    setModal(doc);
  };

  const save = async () => {
    if (!name.trim()) return;
    try {
      if (modal === 'add') {
        await adminApi.createDocumentType({ name: name.trim(), required, sortOrder });
      } else if (modal && '_id' in modal) {
        await adminApi.updateDocumentType(modal._id, { name: name.trim(), required, sortOrder });
      }
      setModal(null);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message || 'Lưu thất bại');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Xóa loại tài liệu này?')) return;
    try {
      await adminApi.deleteDocumentType(id);
      setModal(null);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message || 'Xóa thất bại');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Loại tài liệu</h1>
        <button
          onClick={openAdd}
          style={{ padding: '10px 16px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600 }}
        >
          + Thêm loại tài liệu
        </button>
      </div>
      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3d1f1f', color: '#f85149', borderRadius: 8 }}>{error}</div>
      )}
      {loading ? (
        <p style={{ color: '#8b949e' }}>Đang tải...</p>
      ) : (
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0d1117', borderBottom: '1px solid #30363d' }}>
                <th style={{ textAlign: 'left', padding: 12 }}>Tên</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Bắt buộc</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Thứ tự</th>
                <th style={{ textAlign: 'right', padding: 12 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((doc) => (
                <tr key={doc._id} style={{ borderBottom: '1px solid #30363d' }}>
                  <td style={{ padding: 12 }}>{doc.name}</td>
                  <td style={{ padding: 12 }}>{doc.required ? 'Có' : 'Không'}</td>
                  <td style={{ padding: 12 }}>{doc.sortOrder}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <button onClick={() => openEdit(doc)} style={{ marginRight: 8, padding: '6px 10px', background: '#21262d', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3' }}>Sửa</button>
                    <button onClick={() => remove(doc._id)} style={{ padding: '6px 10px', background: 'transparent', border: '1px solid #da3633', borderRadius: 6, color: '#f85149' }}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p style={{ padding: 24, color: '#8b949e', textAlign: 'center' }}>Chưa có loại tài liệu nào.</p>}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#161b22', padding: 24, borderRadius: 12, border: '1px solid #30363d', width: '100%', maxWidth: 400 }}>
            <h2 style={{ margin: '0 0 20px' }}>{modal === 'add' ? 'Thêm loại tài liệu' : 'Sửa loại tài liệu'}</h2>
            <label style={{ display: 'block', marginBottom: 8, color: '#8b949e' }}>Tên</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Bắt buộc
            </label>
            <label style={{ display: 'block', marginBottom: 8, color: '#8b949e' }}>Thứ tự</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              style={{ width: '100%', padding: '10px 12px', marginBottom: 24, background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ padding: '10px 16px', background: '#21262d', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3' }}>Hủy</button>
              <button onClick={save} style={{ padding: '10px 16px', background: '#238636', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600 }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
