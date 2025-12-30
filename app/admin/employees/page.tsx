'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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
  labourType?: 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR';
  projectId?: string;
}

export default function AdminEmployeesPage() {
  return (
    <ProtectedRoute requireAdmin allowViewOnly>
      <Navigation />
      <EmployeesComponent />
    </ProtectedRoute>
  );
}

function EmployeesComponent() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [rowCount, setRowCount] = useState(1);
  const [multipleRows, setMultipleRows] = useState<Array<{
    empId: string;
    name: string;
    site: string;
    siteType: string;
    role: string;
    department: string;
    active: boolean;
  }>>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [uploading, setUploading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  
  const canEdit = user?.role === 'admin' || user?.role === 'super-admin' || user?.role === 'user';

  useEffect(() => {
    fetchEmployees();
    // Check URL params for status filter
    const status = searchParams.get('status');
    if (status === 'active' || status === 'inactive') {
      setStatusFilter(status);
    }
  }, [searchParams]);

  useEffect(() => {
    filterEmployees();
  }, [employees, statusFilter]);

  useEffect(() => {
    if (rowCount > 0 && showForm) {
      const newRows = Array.from({ length: rowCount }, () => ({
        empId: '',
        name: '',
        site: '',
        siteType: 'OTHER',
        role: '',
        department: '',
        active: true,
      }));
      setMultipleRows(newRows);
    }
  }, [rowCount, showForm]);

  const filterEmployees = () => {
    if (statusFilter === 'all') {
      setFilteredEmployees(employees);
    } else if (statusFilter === 'active') {
      setFilteredEmployees(employees.filter(emp => emp.active));
    } else {
      setFilteredEmployees(employees.filter(emp => !emp.active));
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/employees', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      console.log('Fetch employees response:', result);
      if (result.success) {
        setEmployees(result.data || []);
        console.log('Employees loaded:', result.data?.length || 0);
      } else {
        console.error('Failed to fetch employees:', result.error);
        alert(`Error loading employees: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Failed to fetch employees:', err);
      alert(`Error: ${err.message || 'Failed to fetch employees. Please check your connection.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields before submitting
    const invalidRows = multipleRows.filter((row, index) => {
      if (!row.empId || !row.name || !row.site || !row.role) {
        return true;
      }
      // Validate siteType
      const validSiteTypes = ['HEAD_OFFICE', 'MEP', 'CIVIL', 'OTHER', 'OUTSOURCED', 'SUPPORT'];
      if (row.siteType && !validSiteTypes.includes(row.siteType)) {
        return true;
      }
      return false;
    });

    if (invalidRows.length > 0) {
      alert('Please fill in all required fields (Employee ID, Name, Site, Role) for all rows.');
      return;
    }

    try {
      if (rowCount > 1) {
        // Bulk create multiple employees
        const response = await fetch('/api/admin/employees/bulk', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ employees: multipleRows }),
        });

        const result = await response.json();
        if (result.success) {
          setShowForm(false);
          setRowCount(1);
          setMultipleRows([]);
          fetchEmployees();
          const message = result.data.failed > 0 
            ? `Created ${result.data.created} employees. ${result.data.failed} failed:\n${result.data.errors.slice(0, 5).join('\n')}${result.data.errors.length > 5 ? '\n...' : ''}`
            : `Successfully created ${result.data.created} employees`;
          alert(message);
        } else {
          const errorMsg = result.error || 'Failed to create employees';
          console.error('Bulk create error:', errorMsg);
          alert(`Error: ${errorMsg}`);
        }
      } else {
        // Single employee creation
        const response = await fetch('/api/admin/employees', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(multipleRows[0] || {}),
        });

        const result = await response.json();
        if (result.success) {
          setShowForm(false);
          setRowCount(1);
          setMultipleRows([]);
          fetchEmployees();
          alert('Employee created successfully!');
        } else {
          const errorMsg = result.error || 'Failed to create employee';
          console.error('Create employee error:', errorMsg);
          alert(`Error: ${errorMsg}`);
        }
      }
    } catch (err: any) {
      console.error('Failed to create employee:', err);
      const errorMsg = err.message || 'Failed to create employee. Please check your connection and try again.';
      alert(`Error: ${errorMsg}`);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          const employees = jsonData.map((row: any) => ({
            empId: String(row['Employee ID'] || row['empId'] || row['EmployeeID'] || ''),
            name: String(row['Name'] || row['name'] || ''),
            site: String(row['Site'] || row['site'] || ''),
            siteType: String(row['Site Type'] || row['siteType'] || row['SiteType'] || 'OTHER'),
            role: String(row['Role'] || row['role'] || ''),
            department: String(row['Department'] || row['department'] || ''),
            active: row['Active'] !== undefined ? Boolean(row['Active']) : (row['active'] !== undefined ? Boolean(row['active']) : true),
          }));

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
            setShowBulkUpload(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            fetchEmployees();
            alert(`Successfully uploaded ${result.data.created} employees`);
          } else {
            alert(result.error || 'Failed to upload employees');
          }
        } catch (err: any) {
          console.error('Failed to process file:', err);
          alert('Failed to process file: ' + err.message);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error('Failed to upload file:', err);
      alert('Failed to upload file: ' + err.message);
      setUploading(false);
    }
  };

  const updateRowData = (index: number, field: string, value: any) => {
    const newRows = [...multipleRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setMultipleRows(newRows);
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setShowEditModal(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const response = await fetch(`/api/admin/employees/${editingEmployee._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingEmployee),
      });

      const result = await response.json();
      if (result.success) {
        setShowEditModal(false);
        setEditingEmployee(null);
        fetchEmployees();
        alert('Employee updated successfully!');
      } else {
        alert(result.error || 'Failed to update employee');
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to update employee'}`);
    }
  };

  const handleToggleActive = async (employeeId: string) => {
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}/toggle-active`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        fetchEmployees();
        alert(result.message || 'Employee status updated!');
      } else {
        alert(result.error || 'Failed to update employee status');
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to update employee status'}`);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        fetchEmployees();
        alert('Employee deleted successfully!');
      } else {
        alert(result.error || 'Failed to delete employee');
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to delete employee'}`);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Employees {!canEdit && '(View Only)'}</h1>
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowBulkUpload(!showBulkUpload);
                  setShowForm(false);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                {showBulkUpload ? 'Cancel' : 'Bulk Upload'}
              </button>
              <button
                onClick={() => {
                  setShowForm(!showForm);
                  setShowBulkUpload(false);
                  if (!showForm) {
                    setRowCount(1);
                  }
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                {showForm ? 'Cancel' : 'Add Employee'}
              </button>
            </div>
          )}
        </div>

        {showBulkUpload && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Bulk Upload Employees</h2>
            <p className="text-sm text-gray-600 mb-4">
              Upload an Excel file (.xlsx, .xls) or CSV file with columns: Employee ID, Name, Site, Site Type, Role, Department, Active
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleBulkUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploading && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-600">Uploading...</p>
              </div>
            )}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Add Employee(s)</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How many rows do you want to enter?
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={rowCount}
                onChange={(e) => setRowCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="px-3 py-2 border rounded-md w-32"
              />
              <button
                type="button"
                onClick={() => {
                  const newRows = Array.from({ length: rowCount }, () => ({
                    empId: '',
                    name: '',
                    site: '',
                    siteType: 'OTHER',
                    role: '',
                    department: '',
                    active: true,
                  }));
                  setMultipleRows(newRows);
                }}
                className="ml-2 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
              >
                Generate Rows
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Employee ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {multipleRows.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.empId}
                            onChange={(e) => updateRowData(index, 'empId', e.target.value)}
                            required
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Employee ID"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateRowData(index, 'name', e.target.value)}
                            required
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Name"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.site}
                            onChange={(e) => updateRowData(index, 'site', e.target.value)}
                            required
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Site"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.siteType}
                            onChange={(e) => updateRowData(index, 'siteType', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm"
                          >
                            <option value="HEAD_OFFICE">Head Office</option>
                            <option value="MEP">MEP</option>
                            <option value="CIVIL">Civil</option>
                            <option value="OTHER">Other</option>
                            <option value="OUTSOURCED">Outsourced</option>
                            <option value="SUPPORT">Support</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.role}
                            onChange={(e) => updateRowData(index, 'role', e.target.value)}
                            required
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Role"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.department}
                            onChange={(e) => updateRowData(index, 'department', e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Department"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.active}
                            onChange={(e) => updateRowData(index, 'active', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
              >
                Create {rowCount > 1 ? `${rowCount} Employees` : 'Employee'}
              </button>
            </form>
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-md ${
              statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
            }`}
          >
            All ({employees.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-md ${
              statusFilter === 'active' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border'
            }`}
          >
            Active ({employees.filter(e => e.active).length})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-4 py-2 rounded-md ${
              statusFilter === 'inactive' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border'
            }`}
          >
            Inactive ({employees.filter(e => !e.active).length})
          </button>
        </div>

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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labour Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                {canEdit && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="px-6 py-4 text-center text-gray-500">
                    No employees found
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.empId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.site}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.siteType}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.department || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        emp.labourType === 'OUR_LABOUR' ? 'bg-blue-100 text-blue-800' :
                        emp.labourType === 'SUPPLY_LABOUR' ? 'bg-green-100 text-green-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {emp.labourType ? emp.labourType.replace('_', ' ') : 'Our Labour'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        emp.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {emp.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditEmployee(emp)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleToggleActive(emp._id)}
                            className={`${
                              emp.active ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'
                            }`}
                            title={emp.active ? 'Deactivate' : 'Activate'}
                          >
                            {emp.active ? '⏸️ Deactivate' : '▶️ Activate'}
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(emp._id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Employee Modal */}
        {showEditModal && editingEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Edit Employee</h2>
              <form onSubmit={handleUpdateEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Employee ID *
                    </label>
                    <input
                      type="text"
                      value={editingEmployee.empId}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, empId: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={editingEmployee.name}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Site *
                    </label>
                    <input
                      type="text"
                      value={editingEmployee.site}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, site: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Site Type *
                    </label>
                    <select
                      value={editingEmployee.siteType}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, siteType: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="HEAD_OFFICE">Head Office</option>
                      <option value="MEP">MEP</option>
                      <option value="CIVIL">Civil</option>
                      <option value="OTHER">Other</option>
                      <option value="OUTSOURCED">Outsourced</option>
                      <option value="SUPPORT">Support</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Labour Type *
                    </label>
                    <select
                      value={editingEmployee.labourType || 'OUR_LABOUR'}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, labourType: e.target.value as any })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="OUR_LABOUR">Our Labour</option>
                      <option value="SUPPLY_LABOUR">Supply Labour</option>
                      <option value="SUBCONTRACTOR">Subcontractor</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role *
                    </label>
                    <input
                      type="text"
                      value={editingEmployee.role}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={editingEmployee.department || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project ID
                    </label>
                    <input
                      type="text"
                      value={editingEmployee.projectId || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, projectId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingEmployee.active}
                        onChange={(e) => setEditingEmployee({ ...editingEmployee, active: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingEmployee(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Update Employee
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
