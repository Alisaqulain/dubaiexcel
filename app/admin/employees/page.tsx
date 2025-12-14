'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

interface Employee {
  _id: string;
  empId: string;
  name: string;
  site: string;
  siteType: string;
  role: string;
  department?: string;
  active: boolean;
}

export default function AdminEmployeesPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <EmployeesComponent />
    </ProtectedRoute>
  );
}

function EmployeesComponent() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    empId: '',
    name: '',
    site: '',
    siteType: 'OTHER',
    role: '',
    department: '',
    active: true,
  });
  const { token } = useAuth();

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/employees', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setEmployees(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (result.success) {
        setShowForm(false);
        setFormData({
          empId: '',
          name: '',
          site: '',
          siteType: 'OTHER',
          role: '',
          department: '',
          active: true,
        });
        fetchEmployees();
      }
    } catch (err) {
      console.error('Failed to create employee:', err);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Employees</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add Employee'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Add New Employee</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Employee ID"
                value={formData.empId}
                onChange={(e) => setFormData({ ...formData, empId: e.target.value })}
                required
                className="px-3 py-2 border rounded-md"
              />
              <input
                type="text"
                placeholder="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="px-3 py-2 border rounded-md"
              />
              <input
                type="text"
                placeholder="Site"
                value={formData.site}
                onChange={(e) => setFormData({ ...formData, site: e.target.value })}
                required
                className="px-3 py-2 border rounded-md"
              />
              <select
                value={formData.siteType}
                onChange={(e) => setFormData({ ...formData, siteType: e.target.value })}
                className="px-3 py-2 border rounded-md"
              >
                <option value="HEAD_OFFICE">Head Office</option>
                <option value="MEP">MEP</option>
                <option value="CIVIL">Civil</option>
                <option value="OTHER">Other</option>
                <option value="OUTSOURCED">Outsourced</option>
                <option value="SUPPORT">Support</option>
              </select>
              <input
                type="text"
                placeholder="Role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
                className="px-3 py-2 border rounded-md"
              />
              <input
                type="text"
                placeholder="Department (optional)"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="px-3 py-2 border rounded-md"
              />
              <button
                type="submit"
                className="col-span-2 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
              >
                Create Employee
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((emp) => (
                <tr key={emp._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.empId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.site}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.siteType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.department || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      emp.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {emp.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

