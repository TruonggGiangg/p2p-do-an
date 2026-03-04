import React, { useState, createContext, useContext, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import viVN from 'antd/locale/vi_VN';
import AppLayout from './pages/Layout';
import LoginPage from './pages/LoginPage';
import DocumentTypesPage from './pages/DocumentTypesPage';
import LoanProductsPage from './pages/LoanProductsPage';
import SyncDriftPage from './pages/SyncDriftPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import LoanApprovalsPage from './pages/LoanApprovalsPage';

// Modern fintech color palette - Teal/Cyan
const LIGHT_PALETTE = {
  primary: '#0D9488',
  primaryHover: '#0F766E',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  bgContainer: '#FFFFFF',
  bgLayout: '#F8FAFC',
  siderBg: '#0F172A',
};

const DARK_PALETTE = {
  primary: '#2DD4BF',
  primaryHover: '#5EEAD4',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  bgContainer: '#1E293B',
  bgElevated: '#334155',
  bgLayout: '#0F172A',
  siderBg: '#020617',
};

// Theme Context
export const ThemeContext = createContext({
  isDarkMode: true,
  toggleTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_access_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('admin_theme');
    return saved ? saved === 'dark' : true;
  });

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  useEffect(() => {
    localStorage.setItem('admin_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const p = isDarkMode ? DARK_PALETTE : LIGHT_PALETTE;

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: p.primary,
            colorSuccess: p.success,
            colorWarning: p.warning,
            colorError: p.error,
            colorBgContainer: isDarkMode ? p.bgContainer : p.bgContainer,
            colorBgElevated: isDarkMode ? p.bgLayout : '#FFFFFF',
            colorBgLayout: isDarkMode ? p.bgLayout : p.bgLayout,
            borderRadius: 10,
            borderRadiusLG: 12,
            fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 14,
          },
          components: {
            Layout: {
              siderBg: isDarkMode ? p.siderBg : p.siderBg,
              headerBg: isDarkMode ? p.bgContainer : p.bgContainer,
              bodyBg: isDarkMode ? p.bgLayout : p.bgLayout,
            },
            Menu: {
              darkItemBg: isDarkMode ? p.siderBg : p.siderBg,
              darkSubMenuItemBg: isDarkMode ? '#0F172A' : '#0C1222',
            },
            Card: {
              borderRadiusLG: 12,
            },
            Table: {
              borderRadiusLG: 8,
            },
          },
        }}
      >
        <AntApp>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DocumentTypesPage />} />
              <Route path="loan-products" element={<LoanProductsPage />} />
              <Route path="loan-approvals" element={<LoanApprovalsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              <Route path="sync-drift" element={<SyncDriftPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

