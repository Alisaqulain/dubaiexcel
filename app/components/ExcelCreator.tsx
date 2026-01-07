'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

interface ExcelRow {
  [key: string]: string | number;
}

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
  name: string;
  description?: string;
  columns: Column[];
}

interface ExcelCreatorProps {
  labourType: 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR';
  onFileCreated?: (file: File) => void;
  useCustomFormat?: boolean; // If true, use assigned format instead of default
  formatId?: string; // Specific format ID to use (if provided, will fetch that format)
}

export default function ExcelCreator({ labourType, onFileCreated, useCustomFormat = false, formatId }: ExcelCreatorProps) {
  const { token } = useAuth();
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkRowCount, setBulkRowCount] = useState(10);
  const [pasteData, setPasteData] = useState('');
  const [customFormat, setCustomFormat] = useState<ExcelFormat | null>(null);
  const [loadingFormat, setLoadingFormat] = useState(false);
  const [saving, setSaving] = useState(false);

  // Define default columns based on labour type
  const getDefaultColumns = (): Column[] => {
    switch (labourType) {
      case 'OUR_LABOUR':
        return [
          { name: 'Employee ID', type: 'text', required: true, order: 0 },
          { name: 'Name', type: 'text', required: true, order: 1 },
          { name: 'Site', type: 'text', required: true, order: 2 },
          { name: 'Site Type', type: 'text', required: true, order: 3 },
          { name: 'Role', type: 'text', required: true, order: 4 },
          { name: 'Department', type: 'text', required: false, order: 5 },
          { name: 'Active', type: 'text', required: false, order: 6 },
        ];
      case 'SUPPLY_LABOUR':
        return [
          { name: 'Employee ID', type: 'text', required: true, order: 0 },
          { name: 'Name', type: 'text', required: true, order: 1 },
          { name: 'Trade', type: 'text', required: true, order: 2 },
          { name: 'Company Name', type: 'text', required: true, order: 3 },
          { name: 'Status', type: 'text', required: true, order: 4 },
        ];
      case 'SUBCONTRACTOR':
        return [
          { name: 'Company Name', type: 'text', required: true, order: 0 },
          { name: 'Trade', type: 'text', required: true, order: 1 },
          { name: 'Scope of Work', type: 'text', required: true, order: 2 },
          { name: 'Employees Present', type: 'number', required: true, order: 3 },
        ];
      default:
        return [];
    }
  };

  // Fetch custom format if enabled (STRICT MODE - only assigned format)
  useEffect(() => {
    if (useCustomFormat && token) {
      setLoadingFormat(true);
      // If formatId is provided, fetch that specific format, otherwise fetch first assigned format
      const url = formatId 
        ? `/api/employee/excel-formats/${formatId}`
        : '/api/employee/excel-format';
      
      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(result => {
          if (result.success && result.data) {
            setCustomFormat(result.data);
            setMessage(null);
          } else {
            // No format assigned - show error
            setMessage({ 
              type: 'error', 
              text: result.error || 'No format assigned to you. Please contact administrator to assign a format. You cannot create Excel files without an assigned format.' 
            });
            setCustomFormat(null);
          }
          setLoadingFormat(false);
        })
        .catch(err => {
          console.error('Failed to fetch format:', err);
          setMessage({ 
            type: 'error', 
            text: 'Failed to load assigned format. Please refresh the page or contact administrator.' 
          });
          setLoadingFormat(false);
        });
    }
  }, [useCustomFormat, token, formatId]);

  // Get columns to use (STRICT: only assigned format, no defaults)
  const getColumns = (): Column[] => {
    if (useCustomFormat) {
      if (customFormat) {
        return customFormat.columns.sort((a, b) => a.order - b.order);
      }
      // No format assigned - return empty (user cannot create)
      return [];
    }
    // If not using custom format, allow defaults (for admin/super-admin)
    return getDefaultColumns();
  };

  const columns = getColumns();
  const columnNames = columns.map(col => col.name);

  const addRow = () => {
    const newRow: ExcelRow = {};
    columns.forEach(col => {
      newRow[col.name] = '';
    });
    setRows([...rows, newRow]);
  };

  const addBulkRows = () => {
    const newRows: ExcelRow[] = [];
    for (let i = 0; i < bulkRowCount; i++) {
      const newRow: ExcelRow = {};
      columnNames.forEach(colName => {
        newRow[colName] = '';
      });
      newRows.push(newRow);
    }
    setRows([...rows, ...newRows]);
    setShowBulkOptions(false);
    setMessage({ type: 'success', text: `Added ${bulkRowCount} rows successfully!` });
  };

  const handlePasteFromExcel = () => {
    if (!pasteData.trim()) {
      setMessage({ type: 'error', text: 'Please paste data from Excel' });
      return;
    }

    try {
      // Parse pasted data (tab-separated or comma-separated)
      const lines = pasteData.split('\n').filter(line => line.trim());
      const newRows: ExcelRow[] = [];

      lines.forEach((line, lineIndex) => {
        // Try tab-separated first (Excel default), then comma-separated
        const values = line.includes('\t') ? line.split('\t') : line.split(',');
        const newRow: ExcelRow = {};
        
        columnNames.forEach((colName, colIndex) => {
          newRow[colName] = values[colIndex]?.trim() || '';
        });
        
        newRows.push(newRow);
      });

      if (newRows.length > 0) {
        setRows([...rows, ...newRows]);
        setPasteData('');
        setShowBulkOptions(false);
        setMessage({ type: 'success', text: `Imported ${newRows.length} rows from pasted data!` });
      } else {
        setMessage({ type: 'error', text: 'No valid data found. Please check your format.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to parse pasted data' });
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });

        if (jsonData.length === 0) {
          setMessage({ type: 'error', text: 'Excel file is empty' });
          return;
        }

        // Map imported data to our columns
        const newRows: ExcelRow[] = jsonData.map((row: any) => {
          const newRow: ExcelRow = {};
          columnNames.forEach(colName => {
            // Try different possible column name variations
            newRow[colName] = row[colName] || row[colName.toLowerCase()] || row[colName.toUpperCase()] || 
                         row[colName.replace(/\s+/g, '')] || row[colName.replace(/\s+/g, '_')] || '';
          });
          return newRow;
        });

        setRows([...rows, ...newRows]);
        setShowBulkOptions(false);
        setMessage({ type: 'success', text: `Imported ${newRows.length} rows from ${file.name}!` });
        
        // Reset file input
        if (e.target) {
          e.target.value = '';
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Failed to import Excel file' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateCell = (rowIndex: number, column: string, value: string | number) => {
    const newRows = [...rows];
    newRows[rowIndex][column] = value;
    setRows(newRows);
  };

  const createExcel = () => {
    if (rows.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one row of data' });
      return;
    }

    try {
      // Create workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert rows to worksheet
      const worksheet = XLSX.utils.json_to_sheet(rows);
      
      // Set column widths
      const colWidths = columnNames.map(() => ({ wch: 20 }));
      worksheet['!cols'] = colWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Create file
      const filename = `employee_data_${labourType.toLowerCase()}_${Date.now()}.xlsx`;
      const file = new File([blob], filename, { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setMessage({ type: 'success', text: `Excel file "${filename}" created and downloaded successfully!` });
      
      // Callback if provided
      if (onFileCreated) {
        onFileCreated(file);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create Excel file' });
    }
  };

  const clearAll = () => {
    if (confirm('Are you sure you want to clear all data?')) {
      setRows([]);
      setMessage(null);
    }
  };

  const saveExcel = async () => {
    if (rows.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one row of data' });
      return;
    }

    if (!token) {
      setMessage({ type: 'error', text: 'Authentication required to save files' });
      return;
    }

    try {
      setSaving(true);

      // Create workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert rows to worksheet
      const worksheet = XLSX.utils.json_to_sheet(rows);
      
      // Set column widths
      const colWidths = columnNames.map(() => ({ wch: 20 }));
      worksheet['!cols'] = colWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Create file
      const filename = `employee_data_${labourType.toLowerCase()}_${Date.now()}.xlsx`;
      const file = new File([blob], filename, { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      // Save to database
      const formData = new FormData();
      formData.append('file', file);
      formData.append('labourType', labourType);
      formData.append('rowCount', rows.length.toString());

      const response = await fetch('/api/employee/save-excel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: 'Excel file saved successfully! Super admin can now view it.' });
        
        // Also call the onFileCreated callback if provided
        if (onFileCreated) {
          onFileCreated(file);
        }
      } else {
        // Handle validation errors with detailed message
        if (result.validationError) {
          const errorMsg = result.error || 'Format validation failed';
          const missingCols = result.missingColumns || [];
          const formatCols = result.formatColumns || [];
          const example = result.example || [];
          
          let detailedError = `${errorMsg}\n\n`;
          if (missingCols.length > 0) {
            detailedError += `Missing columns: ${missingCols.join(', ')}\n`;
          }
          detailedError += `\nRequired format columns:\n${formatCols.map((col: string, idx: number) => `${idx + 1}. ${col}`).join('\n')}`;
          
          setMessage({ 
            type: 'error', 
            text: detailedError 
          });
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to save Excel file' });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save Excel file' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">Create Excel File Online</h3>
          {useCustomFormat && customFormat && (
            <p className="text-sm text-gray-600 mt-1">
              Using format: <strong>{customFormat.name}</strong>
              {customFormat.description && ` - ${customFormat.description}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
          >
            + Add Row
          </button>
          <button
            type="button"
            onClick={() => setShowBulkOptions(!showBulkOptions)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            📥 Bulk Add
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
            disabled={rows.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      {showBulkOptions && (
        <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <h4 className="font-semibold text-purple-900 mb-3">Bulk Add Options</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Option 1: Add Multiple Empty Rows
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={bulkRowCount}
                  onChange={(e) => setBulkRowCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="px-3 py-2 border border-gray-300 rounded-md w-32"
                />
                <button
                  type="button"
                  onClick={addBulkRows}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Add {bulkRowCount} Rows
                </button>
              </div>
            </div>

            <div className="border-t border-purple-300 pt-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Option 2: Paste from Excel (Copy cells and paste here)
              </label>
              <textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="Paste your Excel data here (tab-separated or comma-separated)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                rows={4}
              />
              <button
                type="button"
                onClick={handlePasteFromExcel}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Import Pasted Data
              </button>
            </div>

            <div className="border-t border-purple-300 pt-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Option 3: Import from Excel/CSV File
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileImport}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
              <p className="text-xs text-gray-500 mt-1">Select an Excel or CSV file to import data</p>
            </div>

            <button
              type="button"
              onClick={() => setShowBulkOptions(false)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-4">No data added yet. Click &quot;Add Row&quot; to start creating your Excel file.</p>
          <button
            type="button"
            onClick={addRow}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add First Row
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full divide-y divide-gray-200 border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  {columns.map((col) => (
                    <th key={col.name} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {col.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-500">{rowIndex + 1}</td>
                    {columns.map((col) => (
                      <td key={col.name} className="px-3 py-2">
                        {col.type === 'dropdown' && col.validation?.options ? (
                          <select
                            value={row[col.name] || ''}
                            onChange={(e) => updateCell(rowIndex, col.name, e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm"
                            required={col.required}
                          >
                            <option value="">Select...</option>
                            {col.validation.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : col.type === 'email' ? 'email' : 'text'}
                            value={row[col.name] || ''}
                            onChange={(e) => updateCell(rowIndex, col.name, e.target.value)}
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder={`Enter ${col.name}${col.type === 'number' && col.validation ? ` (${col.validation.min || 0}-${col.validation.max || '∞'})` : ''}`}
                            required={col.required}
                            min={col.type === 'number' ? col.validation?.min : undefined}
                            max={col.type === 'number' ? col.validation?.max : undefined}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={addRow}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              + Add Another Row
            </button>
            <button
              type="button"
              onClick={saveExcel}
              disabled={saving || !token}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? '💾 Saving...' : '💾 Save Excel'}
            </button>
            <button
              type="button"
              onClick={createExcel}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
            >
              📄 Create & Download Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

