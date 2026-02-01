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
  editable?: boolean;
  unique?: boolean;
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
  active: boolean;
}

interface FormatRow {
  [key: string]: any;
}

export default function AdminUploadPage() {
  const { token } = useAuth();
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<ExcelFormat | null>(null);
  const [formatRows, setFormatRows] = useState<FormatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colName: string } | null>(null);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkRowCount, setBulkRowCount] = useState(10);
  const [pasteData, setPasteData] = useState('');

  useEffect(() => {
    if (token) {
      fetchFormats();
    } else {
      setLoading(false);
      setMessage({ type: 'error', text: 'Please login to access this page' });
    }
  }, [token]);

  useEffect(() => {
    if (selectedFormat && token) {
      fetchFormatData(selectedFormat._id);
    }
  }, [selectedFormat, token]);

  const fetchFormats = async () => {
    if (!token) {
      setMessage({ type: 'error', text: 'Authentication required. Please login again.' });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/admin/excel-formats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFormats(result.data.filter((f: ExcelFormat) => f.active));
      } else {
        if (response.status === 401) {
          setMessage({ type: 'error', text: 'Session expired. Please login again.' });
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to fetch formats' });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch formats' });
    } finally {
      setLoading(false);
    }
  };

  const fetchFormatData = async (formatId: string) => {
    if (!token) {
      setMessage({ type: 'error', text: 'Authentication required. Please login again.' });
      return;
    }

    try {
      const response = await fetch(`/api/admin/excel-formats/${formatId}/view`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFormatRows(result.data.rows || []);
      } else {
        if (response.status === 401) {
          setMessage({ type: 'error', text: 'Session expired. Please login again.' });
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to fetch format data' });
        }
        setFormatRows([]);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch format data' });
      setFormatRows([]);
    }
  };

  const handleAddRow = () => {
    if (!selectedFormat) return;
    
    const newRow: FormatRow = {};
    selectedFormat.columns
      .sort((a, b) => a.order - b.order)
      .forEach((col) => {
        newRow[col.name] = '';
      });
    setFormatRows([...formatRows, newRow]);
    setEditingRowIndex(formatRows.length);
  };

  const handleAddBulkRows = () => {
    if (!selectedFormat) return;
    
    const newRows: FormatRow[] = [];
    const sortedColumns = selectedFormat.columns.sort((a, b) => a.order - b.order);
    
    for (let i = 0; i < bulkRowCount; i++) {
      const newRow: FormatRow = {};
      sortedColumns.forEach((col) => {
        newRow[col.name] = '';
      });
      newRows.push(newRow);
    }
    
    setFormatRows([...formatRows, ...newRows]);
    setShowBulkOptions(false);
    setMessage({ type: 'success', text: `Added ${bulkRowCount} rows successfully!` });
  };

  const handlePasteFromExcel = () => {
    if (!selectedFormat || !pasteData.trim()) {
      setMessage({ type: 'error', text: 'Please paste data from Excel' });
      return;
    }

    try {
      const sortedColumns = selectedFormat.columns.sort((a, b) => a.order - b.order);
      const readOnlyColumns = sortedColumns.filter(col => col.editable === false).map(col => col.name);
      
      // Parse pasted data (tab-separated or comma-separated)
      const lines = pasteData.split('\n').filter(line => line.trim());
      const newRows: FormatRow[] = [];

      lines.forEach((line, lineIndex) => {
        // Try tab-separated first (Excel default), then comma-separated
        const values = line.includes('\t') ? line.split('\t') : line.split(',');
        const newRow: FormatRow = {};
        
        sortedColumns.forEach((col, colIndex) => {
          // If column is read-only, preserve value from template or existing row
          if (readOnlyColumns.includes(col.name)) {
            // Try to get from existing row if available
            const existingRowIndex = formatRows.length + lineIndex - 1;
            if (formatRows.length > 0 && formatRows[existingRowIndex]?.[col.name]) {
              newRow[col.name] = formatRows[existingRowIndex][col.name];
            } else if (formatRows.length > 0 && formatRows[formatRows.length - 1]?.[col.name]) {
              // Or use value from last row
              newRow[col.name] = formatRows[formatRows.length - 1][col.name];
            } else {
              newRow[col.name] = '';
            }
          } else {
            // Editable column - use pasted value
            newRow[col.name] = values[colIndex]?.trim() || '';
          }
        });
        
        newRows.push(newRow);
      });

      if (newRows.length > 0) {
        setFormatRows([...formatRows, ...newRows]);
        setPasteData('');
        setShowBulkOptions(false);
        setMessage({ type: 'success', text: `Imported ${newRows.length} rows from pasted data! Read-only columns preserved.` });
      } else {
        setMessage({ type: 'error', text: 'No valid data found. Please check your format.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to parse pasted data' });
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFormat) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Read as array first to get headers for better mapping
        const allData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
        
        if (allData.length < 2) {
          setMessage({ type: 'error', text: 'Excel file must have at least a header row and one data row' });
          return;
        }

        // Get headers from first row
        const excelHeaders = (allData[0] as string[]).map((h: any) => String(h).trim());
        const sortedColumns = selectedFormat.columns.sort((a, b) => a.order - b.order);
        const readOnlyColumns = sortedColumns.filter(col => col.editable === false).map(col => col.name);
        
        // Create column mapping
        const columnMapping: { [key: string]: number } = {};
        sortedColumns.forEach((col) => {
          const index = excelHeaders.findIndex(h => 
            h.toLowerCase() === col.name.toLowerCase() || 
            h.replace(/\s+/g, '').toLowerCase() === col.name.replace(/\s+/g, '').toLowerCase()
          );
          if (index !== -1) {
            columnMapping[col.name] = index;
          }
        });

        // Map imported data
        const newRows: FormatRow[] = allData.slice(1)
          .filter(row => row && row.length > 0 && row.some((cell: any) => cell !== '' && cell !== null && cell !== undefined))
          .map((row: any[], rowIndex) => {
            const newRow: FormatRow = {};
            sortedColumns.forEach((col) => {
              if (readOnlyColumns.includes(col.name)) {
                // Preserve read-only values from existing rows
                const existingRowIndex = formatRows.length + rowIndex - 1;
                if (formatRows.length > 0 && formatRows[existingRowIndex]?.[col.name]) {
                  newRow[col.name] = formatRows[existingRowIndex][col.name];
                } else {
                  newRow[col.name] = '';
                }
              } else {
                // Editable column - use imported value
                const excelIndex = columnMapping[col.name];
                if (excelIndex !== undefined && excelIndex !== -1 && row[excelIndex] !== undefined && row[excelIndex] !== null && row[excelIndex] !== '') {
                  const importedValue = String(row[excelIndex]).trim();
                  
                  // Handle dropdown columns
                  if (col.type === 'dropdown' && col.validation?.options && col.validation.options.length > 0) {
                    const optionsLower = col.validation.options.map((opt: string) => String(opt).trim().toLowerCase());
                    const importedValueLower = importedValue.toLowerCase();
                    const optionIndex = optionsLower.indexOf(importedValueLower);
                    
                    if (optionIndex !== -1) {
                      newRow[col.name] = col.validation.options[optionIndex];
                    } else {
                      newRow[col.name] = '';
                    }
                  } else {
                    newRow[col.name] = importedValue;
                  }
                } else {
                  newRow[col.name] = '';
                }
              }
            });
            return newRow;
          });

        if (newRows.length === 0) {
          setMessage({ type: 'error', text: `No data rows found. Expected columns: ${sortedColumns.map(c => c.name).join(', ')}. Excel headers: ${excelHeaders.join(', ')}` });
          return;
        }

        setFormatRows([...formatRows, ...newRows]);
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

  const handleUpdateCell = (rowIndex: number, colName: string, value: any) => {
    const updatedRows = [...formatRows];
    updatedRows[rowIndex] = {
      ...updatedRows[rowIndex],
      [colName]: value,
    };
    setFormatRows(updatedRows);
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!confirm('Are you sure you want to delete this row?')) return;
    const updatedRows = formatRows.filter((_, i) => i !== rowIndex);
    setFormatRows(updatedRows);
  };

  const handleSaveData = async () => {
    if (!selectedFormat) return;
    if (!token) {
      setMessage({ type: 'error', text: 'Authentication required. Please login again.' });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/admin/excel-formats/save-template-data', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formatId: selectedFormat._id,
          rows: formatRows,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: `Successfully saved ${formatRows.length} row(s)` });
        setEditingRowIndex(null);
        setEditingCell(null);
      } else {
        if (response.status === 401) {
          setMessage({ type: 'error', text: 'Session expired. Please login again.' });
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to save data' });
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save data' });
    } finally {
      setSaving(false);
    }
  };

  const columns = selectedFormat
    ? selectedFormat.columns.sort((a, b) => a.order - b.order)
    : [];

  return (
    <ProtectedRoute>
      <Navigation />
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Format Data Management</h1>

          {message && (
            <div className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* Format Selection */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Format
            </label>
            <select
              value={selectedFormat?._id || ''}
              onChange={(e) => {
                const format = formats.find(f => f._id === e.target.value);
                setSelectedFormat(format || null);
                setFormatRows([]);
                setMessage(null);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select a format --</option>
              {formats.map((format) => (
                <option key={format._id} value={format._id}>
                  {format.name} ({format.columns.length} columns)
                </option>
              ))}
            </select>
          </div>

          {selectedFormat && (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedFormat.name}</h2>
                    {selectedFormat.description && (
                      <p className="text-sm text-gray-600 mt-1">{selectedFormat.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowBulkOptions(!showBulkOptions)}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                    >
                      {showBulkOptions ? '✕ Close' : '⚡ Bulk Add'}
                    </button>
                    <button
                      onClick={handleAddRow}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      + Add Row
                    </button>
                    <button
                      onClick={handleSaveData}
                      disabled={saving}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : '💾 Save Data'}
                    </button>
                  </div>
                </div>

                {/* Bulk Add Options */}
                {showBulkOptions && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
                    <h3 className="font-semibold text-purple-900 mb-3">⚡ Bulk Add Options</h3>
                    
                    <div className="space-y-3">
                      <div className="border-t border-purple-300 pt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Option 1: Add Multiple Empty Rows
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={bulkRowCount}
                            onChange={(e) => setBulkRowCount(parseInt(e.target.value) || 10)}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                          <button
                            type="button"
                            onClick={handleAddBulkRows}
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
                    </div>
                  </div>
                )}
              </div>

              {formatRows.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="mb-4">No data available for this format.</p>
                  <button
                    onClick={handleAddRow}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add First Row
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto p-6">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-300 bg-gray-100 w-16">
                          #
                        </th>
                        {columns.map((col) => (
                          <th
                            key={col.name}
                            className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-300 bg-gray-100 whitespace-nowrap"
                          >
                            {col.name}
                            {col.required && <span className="text-red-500 ml-1">*</span>}
                            <div className="text-xs font-normal text-gray-500 mt-1">
                              {col.type}
                              {col.editable === false && <span className="text-red-600 ml-1">(Read-only)</span>}
                              {col.unique && <span className="text-blue-600 ml-1">(Unique)</span>}
                            </div>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-300 bg-gray-100 w-24">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {formatRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-500 border border-gray-300 text-center">
                            {rowIndex + 1}
                          </td>
                          {columns.map((col) => {
                            const isReadOnly = col.editable === false;
                            const cellValue = row[col.name] !== undefined && row[col.name] !== null
                              ? String(row[col.name])
                              : '';

                            return (
                              <td
                                key={col.name}
                                className={`px-4 py-3 text-sm border border-gray-300 ${
                                  isReadOnly ? 'bg-gray-50' : ''
                                }`}
                              >
                                {col.type === 'dropdown' && col.validation?.options ? (
                                  <select
                                    value={cellValue}
                                    onChange={(e) => handleUpdateCell(rowIndex, col.name, e.target.value)}
                                    disabled={isReadOnly}
                                    className={`w-full px-2 py-1 border rounded text-sm ${
                                      isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  >
                                    <option value="">Select...</option>
                                    {col.validation.options.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : col.type === 'date' ? (
                                  <input
                                    type="date"
                                    value={cellValue}
                                    onChange={(e) => handleUpdateCell(rowIndex, col.name, e.target.value)}
                                    disabled={isReadOnly}
                                    className={`w-full px-2 py-1 border rounded text-sm ${
                                      isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  />
                                ) : col.type === 'number' ? (
                                  <input
                                    type="number"
                                    value={cellValue}
                                    onChange={(e) => handleUpdateCell(rowIndex, col.name, e.target.value)}
                                    disabled={isReadOnly}
                                    min={col.validation?.min}
                                    max={col.validation?.max}
                                    className={`w-full px-2 py-1 border rounded text-sm ${
                                      isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={cellValue}
                                    onChange={(e) => handleUpdateCell(rowIndex, col.name, e.target.value)}
                                    disabled={isReadOnly}
                                    placeholder={`Enter ${col.name}`}
                                    className={`w-full px-2 py-1 border rounded text-sm ${
                                      isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'
                                    }`}
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-sm border border-gray-300">
                            <button
                              onClick={() => handleDeleteRow(rowIndex)}
                              className="text-red-600 hover:text-red-800"
                              title="Delete row"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-gray-500">Loading formats...</div>
          )}

          {!token && !loading && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <p className="text-yellow-800 mb-4">Authentication required. Please login to access this page.</p>
              <a
                href="/login"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
              >
                Go to Login
              </a>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
