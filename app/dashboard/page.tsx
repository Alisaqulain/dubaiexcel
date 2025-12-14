'use client';

import { ProtectedRoute } from '../components/ProtectedRoute';
import Navigation from '../components/Navigation';
import ManpowerDashboard from '../components/ManpowerDashboard';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Navigation />
      <ManpowerDashboard />
    </ProtectedRoute>
  );
}
