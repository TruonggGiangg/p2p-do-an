import { api } from './client';

export interface DocumentTypeDto {
  _id: string;
  name: string;
  required: boolean;
  sortOrder: number;
  description?: string;
}

export interface LoanProductDto {
  id: number;
  name: string;
  shortName: string;
  interestRatePerPeriod?: number;
  interestType?: { id: number; code: string; value: string };
}

export interface SyncDriftLogDto {
  _id: string;
  syncedAt: string;
  hasDrift: boolean;
  added: { id: number; name?: string; shortName?: string }[];
  removed: { id: number; name?: string; shortName?: string }[];
  modified: { id: number; name?: string; shortName?: string }[];
}

export const adminApi = {
  login: (username: string, password: string) =>
    api.post<{ message: string; data: { roles?: string[] }; accessToken: string; refreshToken: string }>(
      '/api/auth/login',
      { username, password }
    ),

  getLoanProducts: () =>
    api.get<{ data: { products: LoanProductDto[] } }>('/api/admin/loan-products').then((r) => r.data.data.products),

  getDocumentTypes: () =>
    api.get<{ data: DocumentTypeDto[] }>('/api/admin/document-types').then((r) => r.data.data),

  createDocumentType: (body: { name: string; required?: boolean; sortOrder?: number; description?: string }) =>
    api.post<{ data: DocumentTypeDto }>('/api/admin/document-types', body).then((r) => r.data.data),

  updateDocumentType: (id: string, body: Partial<DocumentTypeDto>) =>
    api.put<{ data: DocumentTypeDto }>(`/api/admin/document-types/${id}`, body).then((r) => r.data.data),

  deleteDocumentType: (id: string) => api.delete(`/api/admin/document-types/${id}`),

  getProductDocumentTypes: (fineractProductId: number) =>
    api
      .get<{ data: { documentTypeId: string; documentType: DocumentTypeDto; required: boolean; sortOrder: number }[] }>(
        `/api/admin/loan-products/${fineractProductId}/document-types`
      )
      .then((r) => r.data.data),

  setProductDocumentTypes: (fineractProductId: number, items: { documentTypeId: string; required?: boolean; sortOrder?: number }[]) =>
    api.put(`/api/admin/loan-products/${fineractProductId}/document-types`, { items }),

  getSyncDriftLogs: (limit = 20) =>
    api.get<{ data: SyncDriftLogDto[] }>(`/api/admin/sync-drift?limit=${limit}`).then((r) => r.data.data),

  syncCompare: () =>
    api.post<{ data: { added: unknown[]; removed: unknown[]; modified: unknown[] } }>('/api/admin/sync-compare').then((r) => r.data.data),
};
