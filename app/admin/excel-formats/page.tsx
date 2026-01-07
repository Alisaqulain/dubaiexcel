'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';

interface Column {
  name: string;
  type: 'text' | 'number' | 'date' | 'email' | 'dropdown';
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
  order: number;
}

interface ExcelFormat {
  _id: string;
  name: string;
  description?: string;
  columns: Column[];
  assignedTo: string[];
  assignedToType: 'employee' | 'user' | 'all';
  active: boolean;
}

export default function ExcelFormatsPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <ExcelFormatsComponent />
    </ProtectedRoute>
  );
}

interface Employee {
  _id: string;
  empId: string;
  name: string;
}

interface User {
  _id: string;
  email: string;
  name?: string;
}

function ExcelFormatsComponent() {
  const { token } = useAuth();
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFormat, setEditingFormat] = useState<ExcelFormat | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [uploadingFormat, setUploadingFormat] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    columns: [] as Column[],
    assignedToType: 'all' as 'employee' | 'user' | 'all',
    assignedTo: [] as string[],
  });

  useEffect(() => {
    fetchFormats();
    fetchEmployees();
    fetchUsers();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoadingEmployees(true);
      const response = await fetch('/api/admin/employees', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        setEmployees(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        setUsers(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchFormats = async () => {
    try {
      const response = await fetch('/api/admin/excel-formats', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        setFormats(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch formats:', err);
    } finally {
      setLoading(false);
    }
  };

  const addColumn = () => {
    setFormData({
      ...formData,
      columns: [...formData.columns, {
        name: '',
        type: 'text',
        required: false,
        order: formData.columns.length,
      }],
    });
  };

  const updateColumn = (index: number, field: string, value: any) => {
    const newColumns = [...formData.columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    setFormData({ ...formData, columns: newColumns });
  };

  const removeColumn = (index: number) => {
    setFormData({
      ...formData,
      columns: formData.columns.filter((_, i) => i !== index).map((col, i) => ({ ...col, order: i })),
    });
  };

  const handleDownloadFormatTemplate = () => {
    try {
      // Create a sample format template
      const sampleData = [
        {
          'Format Name': 'Employee Attendance Format',
          'Description': 'Format for employee attendance tracking',
          'Column Name': 'SNO',
          'Column Type': 'number',
          'Required': 'Yes',
          'Min Value': '1',
          'Max Value': '',
          'Dropdown Options': '',
        },
        {
          'Format Name': '',
          'Description': '',
          'Column Name': 'Name',
          'Column Type': 'text',
          'Required': 'Yes',
          'Min Value': '',
          'Max Value': '',
          'Dropdown Options': '',
        },
        {
          'Format Name': '',
          'Description': '',
          'Column Name': 'Date',
          'Column Type': 'date',
          'Required': 'Yes',
          'Min Value': '',
          'Max Value': '',
          'Dropdown Options': '',
        },
        {
          'Format Name': '',
          'Description': '',
          'Column Name': 'Age',
          'Column Type': 'number',
          'Required': 'Yes',
          'Min Value': '18',
          'Max Value': '65',
          'Dropdown Options': '',
        },
        {
          'Format Name': '',
          'Description': '',
          'Column Name': 'Status',
          'Column Type': 'dropdown',
          'Required': 'Yes',
          'Min Value': '',
          'Max Value': '',
          'Dropdown Options': 'Present, Absent, Leave',
        },
      ];

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Format Template');

      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'excel_format_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Failed to download template: ' + err.message);
    }
  };

  const handleImportFormatFromExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          if (jsonData.length === 0) {
            alert('Excel file is empty');
            return;
          }

          // Parse format from Excel
          // First row should have format name and description
          const firstRow: any = jsonData[0];
          const formatName = firstRow['Format Name'] || firstRow['format name'] || 'Imported Format';
          const formatDescription = firstRow['Description'] || firstRow['description'] || '';

          // Extract columns from all rows
          const columns: Column[] = [];
          const seenColumns = new Set<string>();

          jsonData.forEach((row: any, index: number) => {
            const colName = row['Column Name'] || row['column name'] || row['Column'] || row['column'];
            if (colName && !seenColumns.has(colName)) {
              seenColumns.add(colName);
              const colType = (row['Column Type'] || row['column type'] || row['Type'] || 'text').toLowerCase();
              const required = (row['Required'] || row['required'] || 'No').toString().toLowerCase() === 'yes';
              const min = row['Min Value'] || row['min value'] || row['Min'] || undefined;
              const max = row['Max Value'] || row['max value'] || row['Max'] || undefined;
              const options = row['Dropdown Options'] || row['dropdown options'] || row['Options'] || '';

              columns.push({
                name: colName,
                type: (colType === 'number' ? 'number' : 
                       colType === 'date' ? 'date' : 
                       colType === 'email' ? 'email' : 
                       colType === 'dropdown' ? 'dropdown' : 'text') as any,
                required,
                validation: {
                  ...(min && { min: parseInt(min) }),
                  ...(max && { max: parseInt(max) }),
                  ...(options && { options: options.split(',').map((s: string) => s.trim()).filter((s: string) => s) }),
                },
                order: columns.length,
              });
            }
          });

          if (columns.length === 0) {
            alert('No valid columns found in Excel file. Please check the format.');
            return;
          }

          // Populate form with imported data
          setFormData({
            name: formatName,
            description: formatDescription,
            columns,
            assignedToType: 'all',
            assignedTo: [],
          });
          setShowForm(true);
          alert(`Imported format "${formatName}" with ${columns.length} columns successfully!`);
        } catch (err: any) {
          alert('Failed to import format: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      alert('Failed to read file: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || formData.columns.length === 0) {
      alert('Please provide format name and at least one column');
      return;
    }

    if (formData.assignedToType !== 'all' && formData.assignedTo.length === 0) {
      alert(`Please select at least one ${formData.assignedToType} to assign this format to`);
      return;
    }

    try {
      const url = editingFormat 
        ? `/api/admin/excel-formats/${editingFormat._id}`
        : '/api/admin/excel-formats';
      const method = editingFormat ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (result.success) {
        setShowForm(false);
        setEditingFormat(null);
        setFormData({
          name: '',
          description: '',
          columns: [],
          assignedToType: 'all',
          assignedTo: [],
        });
        fetchFormats();
        alert(editingFormat ? 'Format updated successfully!' : 'Format created successfully!');
      } else {
        alert(result.error || 'Failed to save format');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save format');
    }
  };

  const handleEdit = (format: ExcelFormat) => {
    setEditingFormat(format);
    setFormData({
      name: format.name,
      description: format.description || '',
      columns: format.columns,
      assignedToType: format.assignedToType,
      assignedTo: format.assignedTo.map(id => String(id)), // Ensure IDs are strings
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this format?')) return;

    try {
      const response = await fetch(`/api/admin/excel-formats/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        fetchFormats();
        alert('Format deleted successfully!');
      } else {
        alert(result.error || 'Failed to delete format');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete format');
    }
  };

  const handleDownloadFormat = async (formatId: string, formatName: string) => {
    try {
      const response = await fetch(`/api/admin/excel-formats/${formatId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to download format template');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${formatName.replace(/[^a-z0-9]/gi, '_')}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to download format template');
    }
  };

  const handleUploadFormat = async (formatId: string) => {
    if (!uploadFile) {
      alert('Please select a file to upload');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const response = await fetch(`/api/admin/excel-formats/${formatId}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json();
      setUploadResult(result);

      if (result.success) {
        if (result.data.isValid) {
          alert('File validated successfully!');
        } else {
          alert('File validation completed with errors. Please check the details below.');
        }
      } else {
        alert(result.error || 'Failed to upload and validate file');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to upload file');
    } finally {
      setUploadingFormat(null);
      setUploadFile(null);
    }
  };

  const handleDownloadFormatExcel = (format: ExcelFormat) => {
    try {
      // Create Excel with format structure
      const workbook = XLSX.utils.book_new();
      
      // Create format info sheet
      const infoData = [
        ['Format Name', format.name],
        ['Description', format.description || ''],
        ['Assigned To', format.assignedToType === 'all' ? 'All' : `${format.assignedTo.length} ${format.assignedToType}s`],
        ['Status', format.active ? 'Active' : 'Inactive'],
        [''],
        ['Column Structure:'],
      ];
      const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
      XLSX.utils.book_append_sheet(workbook, infoSheet, 'Format Info');

      // Create columns sheet
      const columnsData = [
        ['Column Name', 'Type', 'Required', 'Min Value', 'Max Value', 'Dropdown Options'],
        ...format.columns.map(col => [
          col.name,
          col.type,
          col.required ? 'Yes' : 'No',
          col.validation?.min || '',
          col.validation?.max || '',
          col.validation?.options?.join(', ') || '',
        ]),
      ];
      const columnsSheet = XLSX.utils.json_to_sheet(
        format.columns.map((col, index) => ({
          'Column Name': col.name,
          'Type': col.type,
          'Required': col.required ? 'Yes' : 'No',
          'Min Value': col.validation?.min || '',
          'Max Value': col.validation?.max || '',
          'Dropdown Options': col.validation?.options?.join(', ') || '',
        }))
      );
      XLSX.utils.book_append_sheet(workbook, columnsSheet, 'Columns');

      // Create sample data sheet with headers
      const sampleHeaders = format.columns.map(col => col.name);
      const sampleData = [sampleHeaders];
      const sampleSheet = XLSX.utils.aoa_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, sampleSheet, 'Sample Data');

      // Generate and download
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${format.name.replace(/\s+/g, '_')}_format.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Failed to download format: ' + err.message);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Excel Format Management</h1>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowForm(!showForm);
                setEditingFormat(null);
                setFormData({
                  name: '',
                  description: '',
                  columns: [],
                  assignedToType: 'all',
                  assignedTo: [],
                });
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              {showForm ? 'Cancel' : '+ Create Format'}
            </button>
          </div>
        </div>

        {/* Upload Excel to Create Format */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Import Format from Excel</h2>
          <p className="text-sm text-gray-600 mb-4">
            Upload an Excel file to automatically create a format. The first row should contain column names.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFormatFromExcel}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
          />
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">
              {editingFormat ? 'Edit Format' : 'Create New Format'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Format Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Employee Attendance Format"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={2}
                  placeholder="Describe this format..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Columns *
                </label>
                <div className="space-y-2 mb-2">
                  {formData.columns.map((col, index) => (
                    <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded border">
                      <div className="flex-1 grid grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => updateColumn(index, 'name', e.target.value)}
                          placeholder="Column Name"
                          className="px-2 py-1 border rounded text-sm"
                          required
                        />
                        <select
                          value={col.type}
                          onChange={(e) => updateColumn(index, 'type', e.target.value)}
                          className="px-2 py-1 border rounded text-sm"
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="email">Email</option>
                          <option value="dropdown">Dropdown</option>
                        </select>
                        <label className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={col.required}
                            onChange={(e) => updateColumn(index, 'required', e.target.checked)}
                            className="mr-1"
                          />
                          Required
                        </label>
                        {col.type === 'dropdown' && (
                          <input
                            type="text"
                            value={col.validation?.options?.join(',') || ''}
                            onChange={(e) => updateColumn(index, 'validation', {
                              ...col.validation,
                              options: e.target.value.split(',').map((s: string) => s.trim()).filter((s: string) => s)
                            })}
                            placeholder="Options (comma-separated)"
                            className="px-2 py-1 border rounded text-sm"
                          />
                        )}
                        {col.type === 'number' && (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={col.validation?.min || ''}
                              onChange={(e) => updateColumn(index, 'validation', {
                                ...col.validation,
                                min: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                              placeholder="Min"
                              className="w-20 px-2 py-1 border rounded text-sm"
                            />
                            <input
                              type="number"
                              value={col.validation?.max || ''}
                              onChange={(e) => updateColumn(index, 'validation', {
                                ...col.validation,
                                max: e.target.value ? parseInt(e.target.value) : undefined
                              })}
                              placeholder="Max"
                              className="w-20 px-2 py-1 border rounded text-sm"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeColumn(index)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addColumn}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                >
                  + Add Column
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To
                </label>
                <select
                  value={formData.assignedToType}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    setFormData({ 
                      ...formData, 
                      assignedToType: newType,
                      assignedTo: newType === 'all' ? [] : formData.assignedTo
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="all">All Employees/Users</option>
                  <option value="employee">Specific Employees</option>
                  <option value="user">Specific Users</option>
                </select>
                
                {formData.assignedToType === 'employee' && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Employees *
                    </label>
                    {loadingEmployees ? (
                      <div className="text-sm text-gray-500">Loading employees...</div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-md p-2 bg-white">
                        {employees.length === 0 ? (
                          <div className="text-sm text-gray-500">No employees found</div>
                        ) : (
                          <>
                            <div className="mb-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    assignedTo: employees.map(emp => emp._id),
                                  });
                                }}
                                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    assignedTo: [],
                                  });
                                }}
                                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                              >
                                Clear All
                              </button>
                            </div>
                            {employees.map((emp) => (
                              <label key={emp._id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer rounded">
                                <input
                                  type="checkbox"
                                  checked={formData.assignedTo.includes(emp._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        assignedTo: [...formData.assignedTo, emp._id],
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        assignedTo: formData.assignedTo.filter(id => id !== emp._id),
                                      });
                                    }
                                  }}
                                  className="mr-2"
                                />
                                <span className="text-sm">
                                  <span className="font-medium">{emp.empId}</span> - {emp.name}
                                </span>
                              </label>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: <strong>{formData.assignedTo.length}</strong> employee(s)
                    </p>
                  </div>
                )}

                {formData.assignedToType === 'user' && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Users *
                    </label>
                    <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-md p-2 bg-white">
                      {users.length === 0 ? (
                        <div className="text-sm text-gray-500">No users found</div>
                      ) : (
                        <>
                          <div className="mb-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  assignedTo: users.map(user => user._id),
                                });
                              }}
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  assignedTo: [],
                                });
                              }}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            >
                              Clear All
                            </button>
                          </div>
                          {users.map((user) => (
                            <label key={user._id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer rounded">
                              <input
                                type="checkbox"
                                checked={formData.assignedTo.includes(user._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      assignedTo: [...formData.assignedTo, user._id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      assignedTo: formData.assignedTo.filter(id => id !== user._id),
                                    });
                                  }
                                }}
                                className="mr-2"
                              />
                              <span className="text-sm">
                                <span className="font-medium">{user.email}</span>
                                {user.name && <span> - {user.name}</span>}
                              </span>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Selected: <strong>{formData.assignedTo.length}</strong> user(s)
                    </p>
                  </div>
                )}

                {formData.assignedToType === 'all' && (
                  <p className="text-xs text-gray-500 mt-1">
                    This format will be available to all employees and users
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editingFormat ? 'Update Format' : 'Create Format'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingFormat(null);
                  }}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold p-6 border-b">Existing Formats</h2>
          {formats.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No formats created yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Columns</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formats.map((format) => (
                    <tr key={format._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{format.name}</div>
                        {format.description && (
                          <div className="text-sm text-gray-500">{format.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 mb-2">
                          {format.columns.length} columns
                        </div>
                        <div className="text-xs text-gray-500 mb-2">
                          {format.columns.sort((a, b) => a.order - b.order).map(c => c.name).join(', ')}
                        </div>
                        {/* Sample format example */}
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Use this format like this:</p>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs border border-gray-300">
                              <thead className="bg-gray-100">
                                <tr>
                                  {format.columns
                                    .sort((a, b) => a.order - b.order)
                                    .map((col) => (
                                      <th key={col.name} className="px-1 py-0.5 border border-gray-300 text-left font-semibold text-[10px]">
                                        {col.name}
                                      </th>
                                    ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Sample row 1 */}
                                <tr className="bg-white">
                                  {format.columns
                                    .sort((a, b) => a.order - b.order)
                                    .map((col) => {
                                      let sampleValue = 'Example';
                                      if (col.type === 'number') sampleValue = '0';
                                      else if (col.type === 'date') sampleValue = '2024-01-01';
                                      else if (col.type === 'email') sampleValue = 'example@email.com';
                                      else if (col.type === 'dropdown' && col.validation?.options?.[0]) {
                                        sampleValue = col.validation.options[0];
                                      }
                                      return (
                                        <td key={col.name} className="px-1 py-0.5 border border-gray-300 text-gray-600 text-[10px]">
                                          {sampleValue}
                                        </td>
                                      );
                                    })}
                                </tr>
                                {/* Sample row 2 */}
                                <tr className="bg-gray-50">
                                  {format.columns
                                    .sort((a, b) => a.order - b.order)
                                    .map((col) => {
                                      let sampleValue = 'Sample';
                                      if (col.type === 'number') sampleValue = '1';
                                      else if (col.type === 'date') sampleValue = '2024-01-02';
                                      else if (col.type === 'email') sampleValue = 'sample@email.com';
                                      else if (col.type === 'dropdown' && col.validation?.options?.[1]) {
                                        sampleValue = col.validation.options[1];
                                      } else if (col.type === 'dropdown' && col.validation?.options?.[0]) {
                                        sampleValue = col.validation.options[0];
                                      }
                                      return (
                                        <td key={col.name} className="px-1 py-0.5 border border-gray-300 text-gray-600 text-[10px]">
                                          {sampleValue}
                                        </td>
                                      );
                                    })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {format.assignedToType === 'all' ? 'All' : `${format.assignedTo.length} ${format.assignedToType}s`}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          format.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {format.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(format)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(format._id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setUploadingFormat(format._id);
                                setUploadResult(null);
                                setUploadFile(null);
                              }}
                              className="text-purple-600 hover:text-purple-900 text-xs"
                            >
                              Upload Excel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

