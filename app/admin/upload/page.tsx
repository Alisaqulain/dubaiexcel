'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

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

  useEffect(() => {
    fetchFormats();
  }, []);

  useEffect(() => {
    if (selectedFormat) {
      fetchFormatData(selectedFormat._id);
    }
  }, [selectedFormat]);

  const fetchFormats = async () => {
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
        setMessage({ type: 'error', text: result.error || 'Failed to fetch formats' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch formats' });
    } finally {
      setLoading(false);
    }
  };

  const fetchFormatData = async (formatId: string) => {
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
        setMessage({ type: 'error', text: result.error || 'Failed to fetch format data' });
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
        setMessage({ type: 'error', text: result.error || 'Failed to save data' });
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
              <div className="p-6 border-b flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">{selectedFormat.name}</h2>
                  {selectedFormat.description && (
                    <p className="text-sm text-gray-600 mt-1">{selectedFormat.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
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
        </div>
      </div>
    </ProtectedRoute>
  );
}
