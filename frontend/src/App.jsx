import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { DashboardLayout } from './features/dashboard/DashboardLayout';
import { ConsultationRoom } from './features/consultation/ConsultationRoom';
import { DevInboxPage } from './features/notifications/DevInboxPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardLayout />} />
            <Route path="/consultation/:roomId" element={<ConsultationRoom />} />
            <Route
              path="/dev-inbox"
              element={
                <DashboardLayout>
                  <DevInboxPage />
                </DashboardLayout>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
