
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DashboardData {
  metrics: {
    totalHeadcount: number;
    activeEmployees: number;
    inactiveEmployees: number;
    absent: number;
    absentPercent: string;
    present: number;
    vacation: number;
    visaMedical: number;
    weekOff: number;
    sickLeave: number;
  };
  divisions: Record<string, number>;
  staffLabour: Record<string, number>;
  nationalities: Record<string, number>;
  departments: Record<string, number>;
  camps: Record<string, number>;
  attendanceTypes: Record<string, number>;
  dates: string[];
  absentCountDateWise: number[];
  mepProjects: Array<{ name: string; present: number; absent: number }>;
  civilAluminiumProjects: Array<{ name: string; present: number; absent: number }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function ManpowerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      // Use admin dashboard for admin users, regular dashboard for others
      const apiEndpoint = user.role === 'admin' ? '/api/admin/dashboard' : '/api/dashboard';
      
      const response = await fetch(apiEndpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (!response.ok) {
        // If access denied, show user-friendly message
        if (response.status === 403) {
          setError('ACCESS_DENIED');
          return;
        }
        throw new Error(result.message || result.error || 'Failed to fetch dashboard data');
      }
      setData(result.data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, fetchDashboardData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-xl text-gray-600">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error === 'ACCESS_DENIED' || (error && error.includes('Access Denied'))) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <svg
                className="mx-auto h-16 w-16 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Dashboard Access
            </h1>
            
            <p className="text-gray-600 mb-6">
              The full analytics dashboard is available to administrators only. As an employee, you can upload and create Excel files, which will be visible to administrators.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Your Role:</strong> {user?.role === 'admin' ? 'Administrator' : 'Employee'}
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/excel"
                className="block w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Go to Excel Interface
              </Link>
              
              {user?.role === 'admin' && (
                <p className="text-sm text-gray-500 mt-4">
                  If you&apos;re an admin but seeing this message, please refresh the page or contact support.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="mb-6">
              <svg
                className="mx-auto h-16 w-16 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Unable to Load Dashboard
            </h1>
            
            <p className="text-gray-600 mb-6">
              {error || 'We encountered an issue loading the dashboard data. Please try again later.'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchDashboardData();
                }}
                className="block w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Try Again
              </button>
              
              <Link
                href="/excel"
                className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-200 transition-colors font-medium"
              >
                Go to Excel Interface
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const activeInactiveData = [
    { name: 'Active', value: data.metrics.activeEmployees },
    { name: 'Inactive', value: data.metrics.inactiveEmployees },
  ];

  const divisionData = Object.entries(data.divisions).map(([name, value]) => ({
    name,
    value,
    percentage: ((value / data.metrics.totalHeadcount) * 100).toFixed(2),
  }));

  const attendanceBreakupData = [
    { name: 'Present', value: data.metrics.present },
    { name: 'Vacation', value: data.metrics.vacation },
    { name: 'Absent', value: data.metrics.absent },
    { name: 'Visa Medical', value: data.metrics.visaMedical },
    { name: 'Week Off', value: data.metrics.weekOff },
    { name: 'Sick Leave', value: data.metrics.sickLeave },
  ];

  const staffLabourData = Object.entries(data.staffLabour)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const nationalityData = Object.entries(data.nationalities)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const departmentData = Object.entries(data.departments)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const campData = Object.entries(data.camps)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const attendanceTypeData = Object.entries(data.attendanceTypes).map(([name, value]) => ({
    name,
    value,
  }));

  const absentDateWiseData = data.dates.map((date, index) => ({
    date: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }),
    absent: data.absentCountDateWise[index],
  }));

  const currentDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6 overflow-y-auto">
      <div className="max-w-[1920px] mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Summary of Manpower Active Employees</h1>
          <p className="text-lg text-gray-600 mt-2">ABC Company</p>
          <p className="text-md text-gray-500">{currentDate}</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Total Headcount</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{data.metrics.totalHeadcount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Active Employees</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{data.metrics.activeEmployees}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Absent %</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {data.metrics.absent} - {data.metrics.absentPercent}%
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Present</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{data.metrics.present}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Vacation</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{data.metrics.vacation}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Visa Medical</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{data.metrics.visaMedical}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Week Off</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{data.metrics.weekOff}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-sm font-medium text-gray-600">Sick Leave</p>
            <p className="text-2xl font-bold text-pink-600 mt-1">{data.metrics.sickLeave}</p>
          </div>
        </div>

        {/* First Row of Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Active/Inactive Pie Chart */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Active/Inactive Count</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={activeInactiveData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {activeInactiveData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Division-Wise Headcount */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Division-Wise Headcount</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={divisionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#0088FE">
                  {divisionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 text-center text-sm text-gray-600">
              {divisionData.map((d) => (
                <div key={d.name}>{d.name}: {d.percentage}%</div>
              ))}
            </div>
          </div>

          {/* Attendance BreakUp */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Attendance BreakUp</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={attendanceBreakupData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Staff/Labour */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Staff/Labour</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={staffLabourData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Second Row of Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* TOP 10 Nationality */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">TOP 10 Nationality-Wise Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={nationalityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Department-Wise */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Department-Wise Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={departmentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="value" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Camp Wise */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Camp Wise Count</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="value" fill="#FF8042" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Attendance Type */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Attendance Type</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={attendanceTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {attendanceTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Side - Date List and Absent Count */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 border border-gray-200 mb-4">
              <h3 className="text-lg font-semibold mb-4">CURRENT DATE</h3>
              <div className="space-y-2">
                {data.dates.map((date, index) => (
                  <div key={index} className="text-sm text-gray-700">
                    {new Date(date).toLocaleDateString('en-GB')}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <h3 className="text-lg font-semibold mb-4">Absent Count Date Wise</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={absentDateWiseData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="absent" fill="#FF6B6B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Staff/Labour Table */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">STAFF / LABOUR</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {staffLabourData.map((item, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Third Row - Project Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* MEP Projects */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">MEP Project Present / Absent Count</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.mepProjects} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={180} />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" stackId="a" fill="#00C49F" name="Present" />
                <Bar dataKey="absent" stackId="a" fill="#FF6B6B" name="Absent" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Civil/Aluminium Projects */}
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-center">Civil/Aluminium Project Present / Absent Count</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.civilAluminiumProjects} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={180} />
                <Tooltip />
                <Legend />
                <Bar dataKey="present" stackId="a" fill="#00C49F" name="Present" />
                <Bar dataKey="absent" stackId="a" fill="#FF6B6B" name="Absent" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}


