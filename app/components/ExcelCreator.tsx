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
  editable?: boolean; // true = editable by users, false = read-only
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
  onSaveAndClose?: () => void; // Callback when Save and Close is clicked
  onSaveSuccess?: () => void; // Callback when save is successful (to refresh saved files list)
  useCustomFormat?: boolean; // If true, use assigned format instead of default
  formatId?: string; // Specific format ID to use (if provided, will fetch that format)
  initialData?: ExcelRow[]; // Initial data for editing existing file
  editingFileId?: string; // ID of file being edited
}

export default function ExcelCreator({ labourType, onFileCreated, onSaveAndClose, onSaveSuccess, useCustomFormat = false, formatId, initialData, editingFileId }: ExcelCreatorProps) {
  const { token } = useAuth();
  const [rows, setRows] = useState<ExcelRow[]>(initialData || []);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBulkOptions, setShowBulkOptions] = useState(false);
  const [bulkRowCount, setBulkRowCount] = useState(10);
  const [pasteData, setPasteData] = useState('');
  const [customFormat, setCustomFormat] = useState<ExcelFormat | null>(null);
  const [templateRows, setTemplateRows] = useState<Record<string, any>[]>([]); // Store template rows for read-only column validation
  const [loadingFormat, setLoadingFormat] = useState(false);
  const [saving, setSaving] = useState(false);
  // Track current editing file ID - clears after save so next save creates new file
  const [currentEditingFileId, setCurrentEditingFileId] = useState<string | undefined>(editingFileId);
  
  // Update currentEditingFileId when editingFileId prop changes
  useEffect(() => {
    setCurrentEditingFileId(editingFileId);
  }, [editingFileId]);

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
            
            // Store template rows for read-only column validation
            if (result.data.templateRows && result.data.templateRows.length > 0) {
              setTemplateRows(result.data.templateRows);
              // If no initial data, populate with template rows
              if (!initialData || initialData.length === 0) {
                setRows(result.data.templateRows);
              }
            } else {
              setTemplateRows([]);
            }
            
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
    const rowIndex = rows.length;
    columns.forEach(col => {
      // If column is read-only and template data exists, use template value
      if (col.editable === false && templateRows.length > rowIndex && templateRows[rowIndex][col.name]) {
        newRow[col.name] = templateRows[rowIndex][col.name];
      } else {
        newRow[col.name] = '';
      }
    });
    setRows([...rows, newRow]);
  };

  const addBulkRows = () => {
    const newRows: ExcelRow[] = [];
    for (let i = 0; i < bulkRowCount; i++) {
      const newRow: ExcelRow = {};
      const rowIndex = rows.length + i;
      columnNames.forEach(colName => {
        const col = columns.find(c => c.name === colName);
        // If column is read-only and template data exists, use template value
        if (col && col.editable === false && templateRows.length > rowIndex && templateRows[rowIndex][colName]) {
          newRow[colName] = templateRows[rowIndex][colName];
        } else {
          newRow[colName] = '';
        }
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
      const currentColumns = getColumns();
      const readOnlyColumns = currentColumns.filter(col => col.editable === false).map(col => col.name);
      
      // Parse pasted data (tab-separated or comma-separated)
      const lines = pasteData.split('\n').filter(line => line.trim());
      const newRows: ExcelRow[] = [];

      lines.forEach((line, lineIndex) => {
        // Try tab-separated first (Excel default), then comma-separated
        const values = line.includes('\t') ? line.split('\t') : line.split(',');
        const newRow: ExcelRow = {};
        
        columnNames.forEach((colName, colIndex) => {
          // If column is read-only, preserve value from template or existing row
          if (readOnlyColumns.includes(colName)) {
            // Try to get from template row if available
            const templateRowIndex = rows.length + lineIndex;
            if (templateRows.length > templateRowIndex && templateRows[templateRowIndex][colName]) {
              newRow[colName] = templateRows[templateRowIndex][colName];
            } else if (rows.length > 0 && rows[rows.length - 1][colName]) {
              // Or use value from last row
              newRow[colName] = rows[rows.length - 1][colName];
            } else {
              newRow[colName] = '';
            }
          } else {
            // Editable column - use pasted value
            newRow[colName] = values[colIndex]?.trim() || '';
          }
        });
        
        newRows.push(newRow);
      });

      if (newRows.length > 0) {
        setRows([...rows, ...newRows]);
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
    if (!file) return;

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
        
        // Create a mapping function to find Excel column index for each expected column
        const getExcelColumnIndex = (expectedColName: string): number => {
          // Try exact match first
          let index = excelHeaders.findIndex(h => h === expectedColName);
          if (index !== -1) return index;
          
          // Try case-insensitive match
          index = excelHeaders.findIndex(h => h.toLowerCase() === expectedColName.toLowerCase());
          if (index !== -1) return index;
          
          // Try with spaces removed
          const expectedNoSpaces = expectedColName.replace(/\s+/g, '');
          index = excelHeaders.findIndex(h => h.replace(/\s+/g, '') === expectedNoSpaces);
          if (index !== -1) return index;
          
          // Try with underscores
          const expectedUnderscore = expectedColName.replace(/\s+/g, '_');
          index = excelHeaders.findIndex(h => h.replace(/\s+/g, '_').toLowerCase() === expectedUnderscore.toLowerCase());
          if (index !== -1) return index;
          
          return -1;
        };

        // Create column mapping
        const columnMapping: { [key: string]: number } = {};
        columnNames.forEach(colName => {
          const index = getExcelColumnIndex(colName);
          if (index !== -1) {
            columnMapping[colName] = index;
          }
        });

        // Get read-only columns
        const currentColumns = getColumns();
        const readOnlyColumns = currentColumns.filter(col => col.editable === false).map(col => col.name);
        
        // Map imported data to our columns using the mapping
        const newRows: ExcelRow[] = allData.slice(1)
          .filter(row => row && row.length > 0 && row.some((cell: any) => cell !== '' && cell !== null && cell !== undefined)) // Filter empty rows
          .map((row: any[], rowIndex) => {
            const newRow: ExcelRow = {};
            columnNames.forEach(colName => {
              // If column is read-only, preserve value from template
              if (readOnlyColumns.includes(colName)) {
                // Try to get from template row if available
                if (templateRows.length > rowIndex && templateRows[rowIndex][colName]) {
                  newRow[colName] = templateRows[rowIndex][colName];
                } else {
                  // Keep empty or use existing value
                  newRow[colName] = '';
                }
              } else {
                // Editable column - use imported value
                const excelIndex = columnMapping[colName];
                if (excelIndex !== undefined && excelIndex !== -1 && row[excelIndex] !== undefined && row[excelIndex] !== null && row[excelIndex] !== '') {
                  const importedValue = String(row[excelIndex]).trim();
                  
                  // Check if this column is a dropdown type
                  const columnDef = currentColumns.find(col => col.name === colName);
                  if (columnDef && columnDef.type === 'dropdown' && columnDef.validation?.options && columnDef.validation.options.length > 0) {
                    // For dropdown columns, match case-insensitively and use exact option value
                    const optionsLower = columnDef.validation.options.map((opt: string) => String(opt).trim().toLowerCase());
                    const importedValueLower = importedValue.toLowerCase();
                    const optionIndex = optionsLower.indexOf(importedValueLower);
                    
                    if (optionIndex !== -1) {
                      // Match found - use exact case from options
                      newRow[colName] = columnDef.validation.options[optionIndex];
                      console.log(`Matched dropdown value: "${importedValue}" -> "${columnDef.validation.options[optionIndex]}" for column "${colName}"`);
                    } else {
                      // No match - leave empty (will show "Select..." in dropdown)
                      newRow[colName] = '';
                      console.log(`No dropdown match found for "${importedValue}" in column "${colName}". Available options: ${columnDef.validation.options.join(', ')}`);
                    }
                  } else {
                    // Not a dropdown or no options - use imported value as-is
                    newRow[colName] = importedValue;
                  }
                } else {
                  newRow[colName] = '';
                }
              }
            });
            return newRow;
          });

        if (newRows.length === 0) {
          setMessage({ type: 'error', text: `No data rows found. Expected columns: ${columnNames.join(', ')}. Excel headers: ${excelHeaders.join(', ')}` });
          return;
        }

        // Validate that read-only columns weren't changed
        const readOnlyErrors: string[] = [];
        newRows.forEach((newRow, rowIndex) => {
          readOnlyColumns.forEach(colName => {
            if (templateRows.length > rowIndex && templateRows[rowIndex][colName]) {
              const templateValue = String(templateRows[rowIndex][colName] || '').trim();
              const importedValue = String(newRow[colName] || '').trim();
              // Check if user tried to change read-only column (if it exists in Excel)
              const excelIndex = columnMapping[colName];
              if (excelIndex !== undefined && excelIndex !== -1) {
                const excelValue = allData.slice(1)[rowIndex]?.[excelIndex];
                if (excelValue !== undefined && excelValue !== null && String(excelValue).trim() !== '') {
                  const userValue = String(excelValue).trim();
                  if (userValue !== templateValue && templateValue !== '') {
                    readOnlyErrors.push(`Row ${rowIndex + 1}: Column "${colName}" is read-only and cannot be changed. Value restored from template.`);
                  }
                }
              }
            }
          });
        });

        setRows([...rows, ...newRows]);
        setShowBulkOptions(false);
        
        if (readOnlyErrors.length > 0) {
          setMessage({ 
            type: 'error', 
            text: `Imported ${newRows.length} rows from ${file.name}, but read-only columns were restored:\n${readOnlyErrors.slice(0, 5).join('\n')}${readOnlyErrors.length > 5 ? `\n...and ${readOnlyErrors.length - 5} more` : ''}` 
          });
        } else {
          setMessage({ type: 'success', text: `Imported ${newRows.length} rows from ${file.name}!` });
        }
        
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
    // Check if column is read-only
    const currentColumns = getColumns();
    const col = currentColumns.find(c => c.name === column);
    if (col && col.editable === false) {
      setMessage({ type: 'error', text: `Column "${column}" is read-only and cannot be edited` });
      return;
    }
    
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
      
      // Create file with date and time in filename
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      const filename = `employee_data_${labourType.toLowerCase()}_${dateStr}_${timeStr}.xlsx`;
      const file = new File([blob], filename, { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      // Save to database
      const formData = new FormData();
      formData.append('file', file);
      formData.append('labourType', labourType);
      formData.append('rowCount', rows.length.toString());
      if (currentEditingFileId) {
        formData.append('fileId', currentEditingFileId); // For updating existing file
      }

      const response = await fetch('/api/employee/save-excel', {
        method: currentEditingFileId ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      
      // Check HTTP status code - 400 means validation failed
      if (!response.ok || !result.success) {
        // Handle validation errors with detailed message
        if (result.validationError || response.status === 400) {
          const errorMsg = result.error || 'Validation failed';
          const duplicateErrors = result.duplicateErrors || [];
          const lockedColumnErrors = result.lockedColumnErrors || [];
          const dropdownErrors = result.dropdownErrors || [];
          const missingCols = result.missingColumns || [];
          
          let detailedError = `❌ FILE NOT SAVED - VALIDATION FAILED\n\n`;
          detailedError += `Reason: ${errorMsg}\n\n`;
          
          // Show duplicate errors prominently with alert
          if (duplicateErrors.length > 0) {
            detailedError += `🚫 DUPLICATE VALUES FOUND IN UNIQUE COLUMNS:\n`;
            duplicateErrors.forEach((err: string) => {
              detailedError += `  • ${err}\n`;
            });
            detailedError += `\n⚠️ ACTION REQUIRED: Remove duplicate values before saving.\n\n`;
            
            // Show alert popup for duplicates
            alert(`❌ DUPLICATE VALUES DETECTED!\n\n${duplicateErrors.map((err: string) => `• ${err}`).join('\n')}\n\nFile was NOT saved. Please fix duplicates and try again.`);
          }
          
          // Show dropdown errors prominently with alert
          if (dropdownErrors.length > 0) {
            detailedError += `📋 INVALID DROPDOWN VALUES:\n`;
            dropdownErrors.forEach((err: string) => {
              detailedError += `  • ${err}\n`;
            });
            detailedError += `\n⚠️ ACTION REQUIRED: Use only allowed dropdown options.\n\n`;
            
            // Show alert popup for dropdown errors
            alert(`❌ INVALID DROPDOWN VALUES DETECTED!\n\n${dropdownErrors.map((err: string) => `• ${err}`).join('\n')}\n\nFile was NOT saved. Please use only allowed options and try again.`);
          }
          
          // Show locked column errors
          if (lockedColumnErrors && lockedColumnErrors.length > 0) {
            detailedError += `🔒 LOCKED COLUMN ERRORS:\n`;
            lockedColumnErrors.forEach((err: string) => {
              detailedError += `  • ${err}\n`;
            });
            detailedError += `\n`;
          }
          
          if (missingCols.length > 0) {
            detailedError += `Missing columns: ${missingCols.join(', ')}\n`;
          }
          
          setMessage({ 
            type: 'error', 
            text: detailedError 
          });
          setSaving(false);
          return; // Stop here - don't save the file
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to save Excel file' });
          setSaving(false);
          return;
        }
      }

      if (result.success) {
        // Clear currentEditingFileId after successful save so next save creates a new file
        const wasEditing = !!currentEditingFileId;
        setCurrentEditingFileId(undefined);
        
        // Save row count before clearing
        const savedRowCount = rows.length;
        
        // Clear all rows after successful save
        setRows([]);
        
        setMessage({ 
          type: 'success', 
          text: wasEditing 
            ? `Excel file updated successfully! (${savedRowCount} rows) File saved and form cleared. You can now add new data.` 
            : `Excel file saved successfully! (${savedRowCount} rows) File saved and form cleared. You can now add new data.` 
        });
        
        // Also call the onFileCreated callback if provided
        if (onFileCreated) {
          onFileCreated(file);
        }
        
        // Call onSaveSuccess to refresh saved files list
        if (onSaveSuccess) {
          onSaveSuccess();
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
          <div className="overflow-x-auto mb-4 shadow-sm rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'auto' }}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[50px]">#</th>
                  {columns.map((col) => {
                    // Calculate minimum width based on column name length - more generous sizing
                    const minWidth = Math.max(180, Math.min(col.name.length * 12 + 60, 300));
                    return (
                      <th 
                        key={col.name} 
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"
                        style={{ minWidth: `${minWidth}px`, maxWidth: '400px' }}
                      >
                        <div className="break-words">{col.name}</div>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">{rowIndex + 1}</td>
                    {columns.map((col) => {
                      const isReadOnly = col.editable === false;
                      const minWidth = Math.max(180, Math.min(col.name.length * 12 + 60, 300));
                      return (
                        <td key={col.name} className={`px-4 py-3 ${isReadOnly ? 'bg-gray-50' : ''}`} style={{ minWidth: `${minWidth}px`, maxWidth: '400px' }}>
                          {col.type === 'dropdown' && col.validation?.options ? (
                            <select
                              value={row[col.name] || ''}
                              onChange={(e) => updateCell(rowIndex, col.name, e.target.value)}
                              className={`w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all ${isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white hover:border-gray-400'}`}
                              required={col.required}
                              disabled={isReadOnly}
                              title={isReadOnly ? 'This column is read-only' : ''}
                              style={{ minWidth: '120px' }}
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
                              className={`w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all ${isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white hover:border-gray-400'}`}
                              placeholder={`Enter ${col.name}${col.type === 'number' && col.validation ? ` (${col.validation.min || 0}-${col.validation.max || '∞'})` : ''}`}
                              required={col.required}
                              disabled={isReadOnly}
                              readOnly={isReadOnly}
                              title={isReadOnly ? 'This column is read-only' : ''}
                              min={col.type === 'number' ? col.validation?.min : undefined}
                              max={col.type === 'number' ? col.validation?.max : undefined}
                              style={{ 
                                minWidth: col.type === 'text' || col.type === 'email' ? '180px' : col.type === 'date' ? '160px' : '120px',
                                fontSize: '14px'
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
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
            {onSaveAndClose && (
              <button
                type="button"
                onClick={async () => {
                  if (rows.length === 0) {
                    setMessage({ type: 'error', text: 'Please add at least one row of data' });
                    return;
                  }
                  
                  // Save first, then close
                  try {
                    setSaving(true);
                    // Create workbook
                    const workbook = XLSX.utils.book_new();
                    const worksheet = XLSX.utils.json_to_sheet(rows);
                    const colWidths = columnNames.map(() => ({ wch: 20 }));
                    worksheet['!cols'] = colWidths;
                    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
                    const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
                    const blob = new Blob([excelBuffer], { 
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                    });
                    const now = new Date();
                    const dateStr = now.toISOString().split('T')[0];
                    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
                    const filename = `employee_data_${labourType.toLowerCase()}_${dateStr}_${timeStr}.xlsx`;
                    const file = new File([blob], filename, { 
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                    });
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('labourType', labourType);
                    formData.append('rowCount', rows.length.toString());
                    if (currentEditingFileId) {
                        formData.append('fileId', currentEditingFileId);
                    }
                    const response = await fetch('/api/employee/save-excel', {
                        method: currentEditingFileId ? 'PUT' : 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData,
                    });
                    const result = await response.json();
                    
                    // Check HTTP status code - 400 means validation failed
                    if (!response.ok || !result.success) {
                        if (result.validationError || response.status === 400) {
                            const duplicateErrors = result.duplicateErrors || [];
                            const errorMsg = result.error || 'Validation failed';
                            
                            if (duplicateErrors.length > 0) {
                                alert(`❌ DUPLICATE VALUES DETECTED!\n\n${duplicateErrors.map((err: string) => `• ${err}`).join('\n')}\n\nFile was NOT saved. Please fix duplicates and try again.`);
                            } else {
                                alert(`❌ VALIDATION FAILED\n\n${errorMsg}\n\nFile was NOT saved.`);
                            }
                            setSaving(false);
                            return;
                        }
                        alert(`❌ ERROR\n\n${result.error || 'Failed to save file'}\n\nFile was NOT saved.`);
                        setSaving(false);
                        return;
                    }
                    
                    if (result.success) {
                        const wasEditing = !!currentEditingFileId;
                        setCurrentEditingFileId(undefined); // Clear so next save creates new file
                        const savedRowCount = rows.length;
                        setRows([]); // Clear rows after save
                        setMessage({ type: 'success', text: wasEditing ? 'File updated successfully!' : 'File saved successfully!' });
                        if (onFileCreated) onFileCreated(file);
                        if (onSaveSuccess) onSaveSuccess(); // Refresh saved files list
                        // Close after successful save
                        setTimeout(() => {
                            if (onSaveAndClose) onSaveAndClose();
                        }, 300);
                    } else {
                        setMessage({ type: 'error', text: result.error || 'Failed to save file' });
                    }
                  } catch (err: any) {
                    setMessage({ type: 'error', text: err.message || 'Failed to save file' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving || !token || rows.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? '💾 Saving...' : '💾 Save and Close'}
              </button>
            )}
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

