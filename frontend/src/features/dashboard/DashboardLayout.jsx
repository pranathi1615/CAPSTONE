import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { Navbar } from '../../components/Navbar';
import { PatientDashboard } from './PatientDashboard';
import { DoctorDashboard } from './DoctorDashboard';
import { ChwDashboard } from './ChwDashboard';
import { PharmacyDashboard } from './PharmacyDashboard';
import { AdminDashboard } from './AdminDashboard';

export const DashboardLayout = () => {
  const { user } = useAuth();

  const renderDashboardByRole = () => {
    switch (user?.role) {
      case 'patient':
        return <PatientDashboard />;
      case 'doctor':
        return <DoctorDashboard />;
      case 'chw':
        return <ChwDashboard />;
      case 'pharmacy':
        return <PharmacyDashboard />;
      case 'admin':
        return <AdminDashboard />;
      default:
        return <PatientDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {renderDashboardByRole()}
      </main>
    </div>
  );
};
