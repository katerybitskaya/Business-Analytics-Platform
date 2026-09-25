import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotificationSocket } from '@/hooks/useNotificationSocket';
import { ProtectedRoute } from '@/components/Layout/ProtectedRoute';
import { TopNav } from '@/components/Layout/TopNav';
import { Sidebar } from '@/components/Layout/Sidebar';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';
import { useLang } from '@/context/LangContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ScrollToTop } from '@/components/ScrollToTop';

import AuthPage from '@/pages/Auth/AuthPage';
import ResetPasswordPage from '@/pages/ResetPassword/ResetPasswordPage';
import DashboardPage from '@/pages/Dashboard/DashboardPage';
import ProfilePage from '@/pages/Profile/ProfilePage';
import SettingsPage from '@/pages/Settings/SettingsPage';
import SwotPage from '@/pages/analyses/swot/SwotPage';
import AbcXyzPage from '@/pages/analyses/abc-xyz/AbcXyzPage';
import EisenhowerPage from '@/pages/analyses/eisenhower/EisenhowerPage';
import SchedulePage from '@/pages/analyses/schedule/SchedulePage';
import PunktowaPage from '@/pages/analyses/punktowa/PunktowaPage';
import AudytPage from '@/pages/analyses/audyt/AudytPage';

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { isOpen, close } = useSidebar();
  return (
    <>
      <TopNav />
      <div className="app-body">
        <Sidebar />
        <div
          className={'sidebar-overlay' + (isOpen ? ' visible' : '')}
          id="sidebarOverlay"
          onClick={close}
        />
        <main className="main-content">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SidebarProvider>
  );
}

export default function App() {
  useLang();
  const { user, loading } = useAuth();
  const location = useLocation();
  useNotificationSocket();
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('%c[Nav]', 'color:#9c7ef7;font-weight:bold', location.pathname);
    }
  }, [location.pathname]);

  if (loading) return null;

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/swot" element={
          <ProtectedRoute><AppLayout><SwotPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/abc-xyz" element={
          <ProtectedRoute><AppLayout><AbcXyzPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/eisenhower" element={
          <ProtectedRoute><AppLayout><EisenhowerPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/schedule" element={
          <ProtectedRoute><AppLayout><SchedulePage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/punktowa-dostawcy" element={
          <ProtectedRoute><AppLayout><PunktowaPage ptype="punktowa-dostawcy" /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/punktowa-odbiorcy" element={
          <ProtectedRoute><AppLayout><PunktowaPage ptype="punktowa-odbiorcy" /></AppLayout></ProtectedRoute>
        } />
        <Route path="/analyses/audyt" element={
          <ProtectedRoute><AppLayout><AudytPage /></AppLayout></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
