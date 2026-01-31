'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';

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
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [uploadingBulk, setUploadingBulk] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [formData, setFormData] = useState({
    empId: '',
    name: '',
    site: '',
    siteType: 'OTHER',
    role: '',
    department: '',
    active: true,
    password: '',
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
      setMessage(null);
      if (editingEmployeeId) {
        // Update existing employee
        const response = await fetch(`/api/admin/employees/${editingEmployeeId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            empId: formData.empId,
            name: formData.name,
            site: formData.site,
            siteType: formData.siteType,
            role: formData.role,
            department: formData.department,
            active: formData.active,
            password: formData.password || undefined,
          }),
        });

        const result = await response.json();
        if (result.success) {
          setMessage({ type: 'success', text: 'User updated successfully' });
          setShowForm(false);
          setEditingEmployeeId(null);
          resetForm();
          fetchEmployees();
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to update user' });
        }
      } else {
        // Create new employee
        const response = await fetch('/api/admin/employees', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            empId: formData.empId,
            name: formData.name,
            site: formData.site,
            siteType: formData.siteType,
            role: formData.role,
            department: formData.department,
            active: formData.active,
            password: formData.password,
          }),
        });

        const result = await response.json();
        if (result.success) {
          setMessage({ type: 'success', text: 'User created successfully' });
          setShowForm(false);
          resetForm();
          fetchEmployees();
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to create user' });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save user' });
      console.error('Failed to save user:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      empId: '',
      name: '',
      site: '',
      siteType: 'OTHER',
      role: '',
      department: '',
      active: true,
      password: '',
    });
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployeeId(employee._id);
    setFormData({
      empId: employee.empId,
      name: employee.name,
      site: employee.site,
      siteType: employee.siteType,
      role: employee.role,
      department: employee.department || '',
      active: employee.active,
      password: '',
    });
    setShowForm(true);
    setMessage(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingEmployeeId(null);
    resetForm();
    setShowBulkUpload(false);
    setBulkUploadFile(null);
    setMessage(null);
  };

  const handleDelete = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      setDeletingEmployeeId(employeeId);
      setMessage(null);
      const response = await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'User deleted successfully' });
        fetchEmployees();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete user' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete user' });
    } finally {
      setDeletingEmployeeId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Are you sure you want to delete ALL ${employees.length} users? This action cannot be undone!`)) {
      return;
    }

    if (!confirm('This will permanently delete all users. Are you absolutely sure?')) {
      return;
    }

    try {
      setDeletingAll(true);
      setMessage(null);
      const response = await fetch('/api/admin/employees', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: result.message || `Successfully deleted ${result.deletedCount} users` });
        fetchEmployees();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete users' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete users' });
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/admin/employees/template', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'user_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setMessage({ type: 'success', text: 'Template downloaded successfully' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to download template' });
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadFile) {
      setMessage({ type: 'error', text: 'Please select a file to upload' });
      return;
    }

    try {
      setUploadingBulk(true);
      setMessage(null);

      // Read Excel file
      const arrayBuffer = await bulkUploadFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Read all data including headers
      const allData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];

      if (allData.length < 2) {
        setMessage({ type: 'error', text: 'Excel file must have at least a header row and one data row' });
        setUploadingBulk(false);
        return;
      }

      // Get headers from first row
      const headers = (allData[0] as string[]).map((h: any) => String(h).trim());
      
      // Find column indices by matching header names (case-insensitive, flexible matching)
      const getColumnIndex = (possibleNames: string[]): number => {
        for (const name of possibleNames) {
          const index = headers.findIndex(h => 
            h.toLowerCase() === name.toLowerCase() || 
            h.toLowerCase().replace(/\s+/g, '') === name.toLowerCase().replace(/\s+/g, '') ||
            h.toLowerCase().replace(/\s+/g, '_') === name.toLowerCase().replace(/\s+/g, '_')
          );
          if (index !== -1) return index;
        }
        return -1;
      };

      const empIdIndex = getColumnIndex(['User ID', 'UserID', 'empId', 'USER ID', 'User Id', 'Employee ID', 'EmployeeID', 'EMP ID', 'Emp ID', 'Employee Id']);
      const nameIndex = getColumnIndex(['Name', 'NAME']);
      const siteIndex = getColumnIndex(['Site', 'SITE']);
      const siteTypeIndex = getColumnIndex(['Site Type', 'SiteType', 'siteType', 'SITE TYPE', 'Site Type']);
      const roleIndex = getColumnIndex(['Role', 'ROLE']);
      const departmentIndex = getColumnIndex(['Department', 'DEPARTMENT', 'department']);
      const passwordIndex = getColumnIndex(['Password', 'PASSWORD', 'password']);
      const activeIndex = getColumnIndex(['Active', 'ACTIVE', 'active']);
      const labourTypeIndex = getColumnIndex(['Labour Type', 'LabourType', 'labourType', 'LABOUR TYPE', 'Labour Type']);

      // Check required columns
      if (empIdIndex === -1 || nameIndex === -1 || siteIndex === -1 || roleIndex === -1) {
        setMessage({ 
          type: 'error', 
          text: `Missing required columns. Found headers: ${headers.join(', ')}. Required: User ID, Name, Site, Role` 
        });
        setUploadingBulk(false);
        return;
      }

      // Transform data rows (skip first row which is headers, and skip instruction rows)
      const employees = allData.slice(1)
        .map((row: any[], index: number) => {
          // Skip empty rows
          if (!row || row.length === 0) return null;
          
          const empId = row[empIdIndex]?.toString().trim();
          const name = row[nameIndex]?.toString().trim();
          const site = row[siteIndex]?.toString().trim();
          
          // Skip instruction rows
          if (empId && typeof empId === 'string' && (
            empId.toUpperCase().includes('INSTRUCTIONS') || 
            empId.toUpperCase().includes('SITE TYPE OPTIONS') || 
            empId.toUpperCase().includes('LABOUR TYPE OPTIONS') ||
            empId.toUpperCase().includes('ACTIVE OPTIONS')
          )) {
            return null;
          }

          // Extract all values
          const siteType = siteTypeIndex !== -1 ? (row[siteTypeIndex]?.toString().trim() || '') : '';
          const role = row[roleIndex] ? row[roleIndex].toString().trim() : '';
          const department = departmentIndex !== -1 ? (row[departmentIndex]?.toString().trim() || '') : '';
          const password = passwordIndex !== -1 ? (row[passwordIndex]?.toString().trim() || '') : '';
          const labourType = labourTypeIndex !== -1 ? (row[labourTypeIndex]?.toString().trim() || '') : '';
          const active = activeIndex !== -1 ? (row[activeIndex]?.toString().trim() || '') : '';

          // Skip rows missing required fields (must have empId, name, site, and role)
          if (!empId || empId === '' || !name || name === '' || !site || site === '' || !role || role === '') {
            return null;
          }

          const activeValue = typeof active === 'string' && active !== ''
            ? active.toLowerCase() === 'yes' || active.toLowerCase() === 'true' || active === '1' || active === 'YES'
            : true;

          return {
            empId: empId,
            name: name,
            site: site,
            siteType: siteType || 'OTHER',
            role: role,
            department: department || '',
            password: password || '',
            active: activeValue,
            labourType: labourType || 'OUR_LABOUR',
          };
        })
        .filter((emp: any) => emp !== null);

      // Validate that we have valid employees
      if (employees.length === 0) {
        setMessage({ 
          type: 'error', 
          text: `No valid user data found. Found headers: ${headers.join(', ')}. Required headers: User ID, Name, Site, Role` 
        });
        setUploadingBulk(false);
        return;
      }

      // Debug: Log parsed employees to see what we're sending
      console.log('Parsed employees:', employees);
      console.log('First employee:', employees[0]);

      // Send to API
      const response = await fetch('/api/admin/employees/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employees }),
      });

      const result = await response.json();
      if (result.success) {
        const { created, failed, errors } = result.data;
        let messageText = `Successfully created ${created} user(s)`;
        if (failed > 0) {
          messageText += `. ${failed} failed.`;
          if (errors.length > 0) {
            messageText += ` Errors: ${errors.slice(0, 5).join('; ')}`;
            if (errors.length > 5) {
              messageText += `... and ${errors.length - 5} more`;
            }
          }
        }
        setMessage({ type: 'success', text: messageText });
        setBulkUploadFile(null);
        setShowBulkUpload(false);
        // Reset file input
        const fileInput = document.getElementById('bulk-upload-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fetchEmployees();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to upload users' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to process bulk upload' });
    } finally {
      setUploadingBulk(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Users</h1>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll || employees.length === 0}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deletingAll ? 'Deleting...' : `Delete All (${employees.length})`}
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              Download Template
            </button>
            <button
              onClick={() => {
                if (showBulkUpload) {
                  // Cancel bulk upload
                  setShowBulkUpload(false);
                  setBulkUploadFile(null);
                  const fileInput = document.getElementById('bulk-upload-file') as HTMLInputElement;
                  if (fileInput) fileInput.value = '';
                  setMessage(null);
                } else {
                  // Show bulk upload
                  setShowBulkUpload(true);
                  setShowForm(false);
                  setEditingEmployeeId(null);
                  resetForm();
                }
              }}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
            >
              {showBulkUpload ? 'Cancel Bulk Upload' : 'Bulk Upload'}
            </button>
            <button
              onClick={() => {
                if (showForm) {
                  handleCancel();
                } else {
                  setShowForm(true);
                  setEditingEmployeeId(null);
                  resetForm();
                  setShowBulkUpload(false);
                }
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              {showForm ? 'Cancel' : 'Add User'}
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

        {showBulkUpload && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Bulk Upload Users</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Excel File
                </label>
                <input
                  id="bulk-upload-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setBulkUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                {bulkUploadFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {bulkUploadFile.name}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkUpload}
                  disabled={!bulkUploadFile || uploadingBulk}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadingBulk ? 'Uploading...' : 'Upload Users'}
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                >
                  Download Template
                </button>
              </div>
              <div className="text-sm text-gray-600 mt-4">
                <p className="font-semibold mb-2">Instructions:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Download the template to see the required format</li>
                  <li>Fill in the user data in the Excel file</li>
                  <li>Required fields: User ID, Name, Site, Role</li>
                  <li>Active field: Use &quot;Yes&quot; or &quot;No&quot; (default: Yes)</li>
                  <li>Site Type options: HEAD_OFFICE, MEP, CIVIL, OTHER, OUTSOURCED, SUPPORT</li>
                  <li>Labour Type options: OUR_LABOUR, SUPPLY_LABOUR, SUBCONTRACTOR</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingEmployeeId ? 'Edit User' : 'Add New User'}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="User ID"
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
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Active</span>
                </label>
              </div>
              {editingEmployeeId && (
                <input
                  type="password"
                  placeholder="New Password (leave blank to keep current)"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="px-3 py-2 border rounded-md"
                />
              )}
              {!editingEmployeeId && (
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="px-3 py-2 border rounded-md"
                />
              )}
              <button
                type="submit"
                className="col-span-2 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
              >
                {editingEmployeeId ? 'Update User' : 'Create User'}
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(emp)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(emp._id)}
                        disabled={deletingEmployeeId === emp._id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {deletingEmployeeId === emp._id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
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

