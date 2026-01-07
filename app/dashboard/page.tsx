'use client';

import { ProtectedRoute } from '../components/ProtectedRoute';
import Navigation from '../components/Navigation';
import ManpowerDashboard from '../components/ManpowerDashboard';
import EmployeeDashboard from '../components/EmployeeDashboard';
import { useAuth } from '../context/AuthContext';

function DashboardContent() {
  const { user } = useAuth();
  
  // Show employee dashboard for users, admin dashboard for admins/super-admins
  if (user?.role === 'user') {
    return <EmployeeDashboard />;
  }
  
  // Only admins and super-admins can see the manpower dashboard
  if (user?.role === 'admin' || user?.role === 'super-admin') {
    return <ManpowerDashboard />;
  }
  
  // Default to employee dashboard for any other role
  return <EmployeeDashboard />;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Navigation />
      <DashboardContent />
    </ProtectedRoute>
  );
}
