import React, { useState, useMemo, createContext, useContext, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import viVN from 'antd/locale/vi_VN';
import './styles/pages.css';
import AppLayout from './pages/Layout';
import LoginPage from './pages/LoginPage';
import DocumentTypesPage from './pages/DocumentTypesPage';
import LoanProductsPage from './pages/LoanProductsPage';
import SavingsProductsPage from './pages/SavingsProductsPage';
import SyncDriftPage from './pages/SyncDriftPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import LoanApprovalsPage from './pages/LoanApprovalsPage';
import StaffPage from './pages/StaffPage';
import StaffDetailPage from './pages/StaffDetailPage';
import StaffProfilePage from './pages/StaffProfilePage';
import { useAbility } from '@casl/react';
import { AbilityContext } from './AbilityContext';
import { Action, Subject, AppAbility, buildAbilityForRole, buildEmptyAbility } from './ability';

// Professional fintech color palette - Deep Blue/Slate
const LIGHT_PALETTE = {
  primary: '#1E40AF',
  primaryHover: '#1E3A8A',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  bgContainer: '#FFFFFF',
  bgLayout: '#F1F5F9',
  siderBg: '#0F172A',
};

const DARK_PALETTE = {
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
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

function ProtectedRoute({ action, subject, children }: { action: Action; subject: Subject; children: React.ReactNode }) {
  const ability = useAbility(AbilityContext);
  if (!ability.can(action, subject)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const [ability] = useState<AppAbility>(() => {
    try {
      const userStr = localStorage.getItem('admin_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return buildAbilityForRole(user.roles || []);
      }
    } catch { /* ignore */ }
    return buildEmptyAbility();
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('admin_theme');
    return saved ? saved === 'dark' : false; // Default to light mode for professional look
  });

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  useEffect(() => {
    localStorage.setItem('admin_theme', isDarkMode ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
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
            colorBgContainer: isDarkMode ? p.bgContainer : '#FFFFFF',
            colorBgElevated: isDarkMode ? '#334155' : '#FFFFFF',
            colorBgLayout: isDarkMode ? p.bgLayout : '#F1F5F9',
            colorBorder: isDarkMode ? '#334155' : '#E2E8F0',
            colorText: isDarkMode ? '#F1F5F9' : '#0F172A',
            colorTextSecondary: isDarkMode ? '#94A3B8' : '#475569',
            borderRadius: 0,
            borderRadiusLG: 0,
            fontFamily: "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 14,
            controlHeight: 40,
            controlHeightLG: 44,
            controlHeightSM: 32,
          },
          components: {
            Layout: {
              siderBg: isDarkMode ? p.siderBg : '#0F172A',
              headerBg: isDarkMode ? p.bgContainer : '#FFFFFF',
              headerHeight: 64,
              bodyBg: isDarkMode ? p.bgLayout : '#F1F5F9',
            },
            Menu: {
              darkItemBg: isDarkMode ? p.siderBg : '#0F172A',
              darkSubMenuItemBg: isDarkMode ? '#020617' : '#0F172A',
              itemHeight: 48,
              itemMarginBlock: 4,
            },
            Card: {
              borderRadiusLG: 0,
              boxShadowTertiary: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
            },
            Table: {
              borderRadiusLG: 0,
              headerBg: isDarkMode ? '#1E293B' : '#F8FAFC',
              rowHoverBg: isDarkMode ? '#334155' : '#F1F5F9',
              fontSize: 13,
              cellPaddingBlock: 10,
              cellPaddingInline: 12,
            },
            Button: {
              borderRadius: 0,
            },
            Input: {
              borderRadius: 0,
              borderRadiusLG: 0,
            },
            Select: {
              borderRadius: 0,
            },
            Tag: {
              borderRadius: 0,
            },
          },
        }}
      >
        <AbilityContext.Provider value={ability}>
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
                <Route path="savings-products" element={<SavingsProductsPage />} />
                <Route path="loan-approvals" element={<LoanApprovalsPage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:id" element={<CustomerDetailPage />} />
                <Route path="staff" element={
                  <ProtectedRoute action={Action.Read} subject="Staff">
                    <StaffPage />
                  </ProtectedRoute>
                } />
                <Route path="staff/:id" element={
                  <ProtectedRoute action={Action.Read} subject="Staff">
                    <StaffDetailPage />
                  </ProtectedRoute>
                } />
                <Route path="profile" element={<StaffProfilePage />} />
                <Route path="sync-drift" element={
                  <ProtectedRoute action={Action.Read} subject="SyncDrift">
                    <SyncDriftPage />
                  </ProtectedRoute>
                } />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AntApp>
        </AbilityContext.Provider>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

