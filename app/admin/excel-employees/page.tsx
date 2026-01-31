'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

interface ExcelEmployee {
  _id: string;
  empId: string;
  name: string;
  site?: string;
  siteType?: string;
  role?: string;
  department?: string;
  division?: string;
  company?: string;
  projectName?: string;
  nationality?: string;
  status?: string;
  accommodation?: string;
  passportNumber?: string;
  [key: string]: any;
}

export default function ExcelEmployeesPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <ExcelEmployeesComponent />
    </ProtectedRoute>
  );
}

function ExcelEmployeesComponent() {
  const [employees, setEmployees] = useState<ExcelEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/excel-employees', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setEmployees(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch Excel employees:', err);
      setMessage({ type: 'error', text: 'Failed to fetch employees' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL Excel employees? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      setMessage(null);
      const response = await fetch('/api/admin/excel-employees', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'All Excel employees deleted successfully' });
        fetchEmployees();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete employees' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete employees' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  // Get all unique keys from employees for table headers
  const allKeys = new Set<string>();
  employees.forEach(emp => {
    Object.keys(emp).forEach(key => {
      if (key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'uploadedBy' && key !== 'raw') {
        allKeys.add(key);
      }
    });
  });
  
  // Sort headers with 'name' first, then others alphabetically
  const headers = Array.from(allKeys).sort((a, b) => {
    if (a.toLowerCase() === 'name' || a.toLowerCase().includes('employee name')) return -1;
    if (b.toLowerCase() === 'name' || b.toLowerCase().includes('employee name')) return 1;
    return a.localeCompare(b);
  });
  
  // Ensure 'name' is first
  const nameKey = headers.find(h => h.toLowerCase() === 'name' || h.toLowerCase().includes('employee name') || h.toLowerCase().includes('emp name'));
  if (nameKey) {
    const nameIndex = headers.indexOf(nameKey);
    if (nameIndex > 0) {
      headers.splice(nameIndex, 1);
      headers.unshift(nameKey);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Excel Employees</h1>
            <p className="text-sm text-gray-600 mt-1">
              Employees extracted from Excel files uploaded by users using formats. These are separate from regular users.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteAll}
              disabled={deleting || employees.length === 0}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : `Delete All (${employees.length})`}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {employees.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No Excel employees found</p>
            <p className="text-gray-400 text-sm mt-2">Employees will appear here when users upload Excel files using formats</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <div className="p-4 border-b">
              <p className="text-sm text-gray-600">
                Showing <strong>{employees.length}</strong> employees from Excel dummy data
              </p>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.map((emp) => (
                  <tr key={emp._id} className="hover:bg-gray-50">
                    {headers.map((header) => (
                      <td key={header} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {emp[header] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

