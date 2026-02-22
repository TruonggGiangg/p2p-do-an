import React, { useState, useEffect } from 'react';
import { adminApi, type LoanProductDto, type DocumentTypeDto } from '../api/admin';

export default function LoanProductsPage() {
  const [products, setProducts] = useState<LoanProductDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configProductId, setConfigProductId] = useState<number | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDto[]>([]);
  const [productDocTypes, setProductDocTypes] = useState<{ documentTypeId: string; documentType: DocumentTypeDto; required: boolean; sortOrder: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getLoanProducts();
      setProducts(data);
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Tải danh sách thất bại');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openConfig = async (productId: number) => {
    setConfigProductId(productId);
    try {
      const [docTypes, linked] = await Promise.all([
        adminApi.getDocumentTypes(),
        adminApi.getProductDocumentTypes(productId),
      ]);
      setDocumentTypes(docTypes);
      setProductDocTypes(linked);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message || 'Tải cấu hình thất bại');
    }
  };

  const toggleDocType = (docTypeId: string, required: boolean, sortOrder: number) => {
    const exists = productDocTypes.some((p) => (p.documentTypeId?._id ?? p.documentTypeId) === docTypeId);
    if (exists) {
      setProductDocTypes((prev) => prev.filter((p) => (p.documentTypeId?._id ?? p.documentTypeId) !== docTypeId));
    } else {
      setProductDocTypes((prev) => [...prev, { documentTypeId: docTypeId, documentType: documentTypes.find((d) => d._id === docTypeId)!, required, sortOrder }]);
    }
  };

  const setRequired = (docTypeId: string, required: boolean) => {
    setProductDocTypes((prev) =>
      prev.map((p) => ((p.documentTypeId?._id ?? p.documentTypeId) === docTypeId ? { ...p, required } : p))
    );
  };

  const saveConfig = async () => {
    if (configProductId == null) return;
    setSaving(true);
    try {
      const items = productDocTypes.map((p, i) => ({
        documentTypeId: getDocId(p),
        required: p.required,
        sortOrder: p.sortOrder ?? i,
      }));
      await adminApi.setProductDocumentTypes(configProductId, items);
      setConfigProductId(null);
    } catch (e: any) {
      alert(e.response?.data?.message || e.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const getDocId = (p: { documentTypeId: string | { _id: string }; documentType?: DocumentTypeDto }) =>
    typeof p.documentTypeId === 'object' && p.documentTypeId && '_id' in p.documentTypeId ? (p.documentTypeId as any)._id : (p.documentTypeId as string);

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Sản phẩm vay</h1>
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
                <th style={{ textAlign: 'left', padding: 12 }}>Mã</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Tên</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Lãi suất</th>
                <th style={{ textAlign: 'right', padding: 12 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #30363d' }}>
                  <td style={{ padding: 12 }}>{p.shortName}</td>
                  <td style={{ padding: 12 }}>{p.name}</td>
                  <td style={{ padding: 12 }}>{p.interestRatePerPeriod != null ? `${p.interestRatePerPeriod}% / tháng` : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <button
                      onClick={() => openConfig(p.id)}
                      style={{ padding: '6px 10px', background: '#21262d', border: '1px solid #30363d', borderRadius: 6, color: '#58a6ff' }}
                    >
                      Cấu hình tài liệu
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p style={{ padding: 24, color: '#8b949e', textAlign: 'center' }}>Chưa có sản phẩm vay từ Fineract.</p>}
        </div>
      )}

      {configProductId != null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#161b22', padding: 24, borderRadius: 12, border: '1px solid #30363d', width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ margin: '0 0 20px' }}>Cấu hình tài liệu cho sản phẩm</h2>
            <p style={{ color: '#8b949e', marginBottom: 16 }}>
              Chọn các loại tài liệu yêu cầu khi khách hàng đăng ký gói vay này.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {documentTypes.map((doc) => {
                const linked = productDocTypes.find((p) => getDocId(p) === doc._id);
                return (
                  <label
                    key={doc._id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#0d1117', borderRadius: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={!!linked}
                      onChange={() => toggleDocType(doc._id, doc.required, doc.sortOrder)}
                    />
                    <span style={{ flex: 1 }}>{doc.name}</span>
                    {linked && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#8b949e' }}>
                        <input
                          type="checkbox"
                          checked={linked.required}
                          onChange={(e) => setRequired(doc._id, e.target.checked)}
                        />
                        Bắt buộc
                      </label>
                    )}
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfigProductId(null)}
                style={{ padding: '10px 16px', background: '#21262d', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3' }}
              >
                Đóng
              </button>
              <button
                onClick={saveConfig}
                disabled={saving}
                style={{ padding: '10px 16px', background: '#238636', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600 }}
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
