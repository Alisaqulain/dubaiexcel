'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
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
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch dashboard data');
      }
      setData(result.data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">Error: {error || 'Failed to load data'}</div>
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1920px] mx-auto">
        {/* Summary Report Link for Super Admin */}
        {user?.role === 'super-admin' && (
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-lg p-6 mb-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">📊 Manpower Summary Report</h2>
                <p className="text-purple-100">View comprehensive Excel-style summary report with all sections and breakdowns</p>
              </div>
              <Link
                href="/admin/summary-report"
                className="bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-purple-50 transition-colors shadow-md"
              >
                View Summary Report →
              </Link>
            </div>
          </div>
        )}

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


