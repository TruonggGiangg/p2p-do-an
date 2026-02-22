import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './pages/Layout';
import LoginPage from './pages/LoginPage';
import DocumentTypesPage from './pages/DocumentTypesPage';
import LoanProductsPage from './pages/LoanProductsPage';
import SyncDriftPage from './pages/SyncDriftPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_access_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DocumentTypesPage />} />
        <Route path="loan-products" element={<LoanProductsPage />} />
        <Route path="sync-drift" element={<SyncDriftPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
