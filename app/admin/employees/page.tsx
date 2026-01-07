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
    password: string;
    active: boolean;
    labourType?: string;
  }>>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [uploading, setUploading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [excelFormats, setExcelFormats] = useState<Array<{ _id: string; name: string; description?: string; assignedToType?: string }>>([]);
  const [loadingFormats, setLoadingFormats] = useState(false);
  const [assignedFormats, setAssignedFormats] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  
  const canEdit = user?.role === 'admin' || user?.role === 'super-admin' || user?.role === 'user';

  useEffect(() => {
    fetchEmployees();
    fetchExcelFormats();
    // Check URL params for status filter
    const status = searchParams.get('status');
    if (status === 'active' || status === 'inactive') {
      setStatusFilter(status);
    }
  }, [searchParams]);

  const fetchExcelFormats = async () => {
    try {
      setLoadingFormats(true);
      const response = await fetch('/api/admin/excel-formats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        // Store full format objects including assignedToType
        setExcelFormats(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch Excel formats:', err);
    } finally {
      setLoadingFormats(false);
    }
  };

  const fetchAssignedFormats = async (employeeId: string) => {
    try {
      const response = await fetch('/api/admin/excel-formats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        // Find formats assigned to this employee
        // Formats can be assigned:
        // 1. To 'all' (assignedToType === 'all') - applies to everyone
        // 2. To specific employees (assignedToType === 'employee' and employeeId in assignedTo)
        const formats = result.data || [];
        const assigned = formats
          .filter((format: any) => 
            (format.assignedToType === 'all') ||
            (format.assignedToType === 'employee' && 
             format.assignedTo?.some((id: any) => id.toString() === employeeId))
          )
          .map((format: any) => format._id);
        setAssignedFormats(assigned);
      }
    } catch (err) {
      console.error('Failed to fetch assigned formats:', err);
    }
  };

  const handleAssignFormat = async (formatId: string, assign: boolean) => {
    if (!editingEmployee) return;

    try {
      const response = await fetch(`/api/admin/employees/${editingEmployee._id}/assign-format`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formatId, assign }),
      });

      const result = await response.json();
      if (result.success) {
        // Update assigned formats list
        if (assign) {
          setAssignedFormats([...assignedFormats, formatId]);
        } else {
          setAssignedFormats(assignedFormats.filter(id => id !== formatId));
        }
        // Refresh formats to get updated data
        fetchExcelFormats();
      } else {
        alert(result.error || 'Failed to assign format');
      }
    } catch (err: any) {
      console.error('Error assigning format:', err);
      alert('Failed to assign format: ' + err.message);
    }
  };

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
        password: '',
        active: true,
        labourType: 'OUR_LABOUR',
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

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/admin/employees/template', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download template');
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download template:', err);
      alert(`Error: ${err.message || 'Failed to download template'}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields before submitting
    const invalidRows = multipleRows.filter((row, index) => {
      if (!row.empId || !row.name || !row.site || !row.role || !row.password) {
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
      alert('Please fill in all required fields (Employee ID, Name, Site, Role, Password) for all rows.');
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
          
          // Convert to JSON with header row
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { 
            defval: '', // Default value for empty cells
            raw: false // Convert all values to strings
          });

          console.log('Parsed Excel data:', jsonData);

          // Filter and map employees - exclude instruction rows and empty rows
          const employees = jsonData
            .map((row: any) => {
              // Get values with multiple possible column name variations
              const empId = String(row['Employee ID'] || row['empId'] || row['EmployeeID'] || row['employee_id'] || '').trim();
              const name = String(row['Name'] || row['name'] || '').trim();
              const site = String(row['Site'] || row['site'] || '').trim();
              const siteType = String(row['Site Type'] || row['siteType'] || row['SiteType'] || row['site_type'] || 'OTHER').trim();
              const role = String(row['Role'] || row['role'] || '').trim();
              const department = String(row['Department'] || row['department'] || '').trim();
              const password = String(row['Password'] || row['password'] || '').trim();
              const activeStr = String(row['Active'] || row['active'] || 'Yes').trim();
              const labourType = String(row['Labour Type'] || row['labourType'] || row['LabourType'] || row['labour_type'] || 'OUR_LABOUR').trim();

              // Skip instruction rows or rows that are clearly not employee data
              if (
                empId.toLowerCase().includes('instruction') ||
                empId.toLowerCase().includes('option') ||
                empId.toLowerCase().includes('site type') ||
                empId.toLowerCase().includes('labour type') ||
                empId.toLowerCase().includes('active option') ||
                name.toLowerCase().includes('instruction') ||
                name.toLowerCase().includes('option') ||
                (!empId && !name && !site) // Skip completely empty rows
              ) {
                return null;
              }

              // Only include rows with required fields
              if (!empId || !name || !site || !role) {
                return null;
              }

              // Parse active field
              const active = activeStr.toLowerCase() === 'yes' || activeStr === '1' || activeStr.toLowerCase() === 'true' || activeStr === '';

              return {
                empId,
                name,
                site,
                siteType: siteType || 'OTHER',
                role,
                department: department || '',
                password: password || '',
                active,
                labourType: labourType || 'OUR_LABOUR',
              };
            })
            .filter((emp: any) => emp !== null); // Remove null entries

          console.log('Filtered employees:', employees);

          if (employees.length === 0) {
            alert('No valid employee data found in the Excel file. Please check:\n1. The file has a header row with: Employee ID, Name, Site, Site Type, Role, Department, Password, Active, Labour Type\n2. At least one row with Employee ID, Name, Site, and Role filled in\n3. Instruction rows are not included in the data');
            setUploading(false);
            return;
          }

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
            const message = result.data.failed > 0 
              ? `Successfully uploaded ${result.data.created} employees. ${result.data.failed} failed:\n${result.data.errors.slice(0, 5).join('\n')}${result.data.errors.length > 5 ? '\n...' : ''}`
              : `Successfully uploaded ${result.data.created} employees`;
            alert(message);
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
    // Fetch assigned formats for this employee
    fetchAssignedFormats(employee._id);
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
                onClick={handleDownloadTemplate}
                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
              >
                Download Template
              </button>
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
            <div className="mb-4 flex gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
              >
                Download Template
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Upload an Excel file (.xlsx, .xls) or CSV file with columns: Employee ID, Name, Site, Site Type, Role, Department, Password, Active, Labour Type
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
                    password: '',
                    active: true,
                    labourType: 'OUR_LABOUR',
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
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Password</th>
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
                            type="password"
                            value={row.password}
                            onChange={(e) => updateRowData(index, 'password', e.target.value)}
                            required
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Password"
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password (leave empty to keep current)
                    </label>
                    <input
                      type="password"
                      value={(editingEmployee as any).password || ''}
                      onChange={(e) => setEditingEmployee({ ...editingEmployee, password: e.target.value } as any)}
                      placeholder="Enter new password or leave empty"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty to keep current password unchanged</p>
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

                {/* Assign Excel Format Section */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-3">Assign Excel Format</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Assign Excel formats to this employee. The employee will only be able to use assigned formats to create/upload Excel files.
                  </p>
                  
                  {loadingFormats ? (
                    <div className="text-center py-4 text-gray-500">Loading formats...</div>
                  ) : excelFormats.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      No Excel formats available. <a href="/admin/excel-formats" className="text-blue-600 hover:underline">Create a format first</a>.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
                      {excelFormats.map((format) => {
                        // Check if format is assigned to this employee
                        // Formats can be assigned to "all" (assignedToType === 'all') or specifically to this employee
                        const isAssignedToAll = format.assignedToType === 'all';
                        const isAssignedToEmployee = assignedFormats.includes(format._id);
                        const isAssigned = isAssignedToAll || isAssignedToEmployee;
                        
                        return (
                          <label
                            key={format._id}
                            className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <div className="flex items-center flex-1">
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={(e) => handleAssignFormat(format._id, e.target.checked)}
                                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div>
                                <span className="text-sm font-medium text-gray-900">{format.name}</span>
                                {format.description && (
                                  <span className="text-xs text-gray-500 ml-2">- {format.description}</span>
                                )}
                                {isAssignedToAll && (
                                  <span className="text-xs text-blue-600 ml-2">(Assigned to All)</span>
                                )}
                              </div>
                            </div>
                            {isAssigned && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                {isAssignedToAll ? 'All' : 'Assigned'}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  
                  {assignedFormats.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>Currently Assigned:</strong> {assignedFormats.length} format(s)
                      </p>
                    </div>
                  )}
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
