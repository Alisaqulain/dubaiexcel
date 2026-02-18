'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';
import * as XLSX from 'xlsx';

function getColumnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Normalize any date-like value to YYYY-MM-DD for input type="date". Handles Excel serial, ISO, dd/mm/yyyy, etc. */
function toDateInputValue(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '';
  const s = String(val).trim();
  if (!s) return '';
  const num = parseFloat(s);
  if (!isNaN(num) && num > 0 && num < 1000000) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[/\-.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map((p) => parseInt(p.trim(), 10));
    if (!isNaN(a) && !isNaN(b) && !isNaN(c)) {
      let y: number, m: number, d: number;
      if (a > 31) {
        y = a;
        m = b;
        d = c;
      } else if (c > 31) {
        d = a;
        m = b;
        y = c;
      } else {
        d = a;
        m = b;
        y = c;
      }
      if (y < 100) y += 2000;
      const date = new Date(y, m - 1, d);
      if (!isNaN(date.getTime()))
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100)
    return parsed.toISOString().slice(0, 10);
  return s;
}

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
  editingFileName?: string; // Display name when editing a saved file (shows "Edit mode")
  initialPickedTemplateRowIndices?: number[]; // When editing a pick file, which template row indices are in the file (for "Add data from file")
}

export default function ExcelCreator({ labourType, onFileCreated, onSaveAndClose, onSaveSuccess, useCustomFormat = false, formatId, initialData, editingFileId, editingFileName, initialPickedTemplateRowIndices }: ExcelCreatorProps) {
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
  const [tablePage, setTablePage] = useState(1);
  const [rowSearch, setRowSearch] = useState('');
  const debouncedRowSearch = useDebounce(rowSearch, SEARCH_DEBOUNCE_MS);
  // Track current editing file ID - clears after save so next save creates new file
  const [currentEditingFileId, setCurrentEditingFileId] = useState<string | undefined>(editingFileId);
  const [pickedRowIndices, setPickedRowIndices] = useState<Set<number>>(new Set());
  const [showSavePickModal, setShowSavePickModal] = useState(false);
  const [savePickFilename, setSavePickFilename] = useState('');
  const [savingPick, setSavingPick] = useState(false);
  const [pickedByOthers, setPickedByOthers] = useState<Record<number, { empId: string; empName: string }>>({});
  // When editing a pick file: template index per row (null = manual row). Used for "Add data from file" and for saving rowIndices.
  const [editingPickedIndices, setEditingPickedIndices] = useState<(number | null)[]>([]);
  const [showAddFromFileModal, setShowAddFromFileModal] = useState(false);
  const [addFromFileSelected, setAddFromFileSelected] = useState<Set<number>>(new Set());
  const [addFromFileSearch, setAddFromFileSearch] = useState('');
  const addFromFileSearchDebounced = useDebounce(addFromFileSearch, 200);

  // Update currentEditingFileId when editingFileId prop changes
  useEffect(() => {
    setCurrentEditingFileId(editingFileId);
  }, [editingFileId]);

  useEffect(() => {
    if (tablePage < 1) setTablePage(1);
  }, [rows.length, tablePage]);

  // Reset rows when initialData or editingFileId changes (when editing a different file or starting fresh)
  useEffect(() => {
    // Only update if initialData actually changed (not just on every render)
    if (initialData && initialData.length > 0) {
      // If we have initial data (editing a file), use it
      setRows(initialData);
      setCurrentEditingFileId(editingFileId);
      setMessage(null); // Clear any previous messages
      // Sync editingPickedIndices: same length as rows; use initialPickedTemplateRowIndices where available, else null
      if (Array.isArray(initialPickedTemplateRowIndices) && initialPickedTemplateRowIndices.length > 0) {
        const indices: (number | null)[] = initialData.map((_, i) => initialPickedTemplateRowIndices[i] ?? null);
        setEditingPickedIndices(indices);
      } else {
        setEditingPickedIndices(initialData.map(() => null));
      }
    } else if ((editingFileId === undefined || editingFileId === null) && currentEditingFileId !== undefined) {
      // If editing was cleared, reset to template rows or empty
      if (templateRows.length > 0) {
        setRows(templateRows);
      } else {
        setRows([]);
      }
      setCurrentEditingFileId(undefined);
      setEditingPickedIndices([]);
    } else if (editingFileId === undefined && !initialData && templateRows.length > 0 && rows.length === 0) {
      // Initial load: use template rows if available
      setRows(templateRows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, editingFileId, initialPickedTemplateRowIndices]);

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
            
            // Store template rows (API sends max 250 to avoid lag); use for read-only validation
            const loadedRows = result.data.templateRows || [];
            const totalCount = result.data.templateRowCount ?? loadedRows.length;
            if (loadedRows.length > 0) {
              setTemplateRows(loadedRows);
              if (!initialData || initialData.length === 0) {
                setRows(loadedRows);
              }
            } else {
              setTemplateRows([]);
            }
            
            if (totalCount > 250) {
              setMessage({
                type: 'success',
                text: `Template has ${totalCount} rows. Loaded first 250 for quick editing. Use "Download Template" to get the full file, or add more rows as needed.`,
              });
            } else {
              setMessage(null);
            }
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

  useEffect(() => {
    if (!useCustomFormat || !formatId || !token || rows.length === 0) {
      setPickedByOthers({});
      return;
    }
    fetch(`/api/employee/picked-rows?formatId=${encodeURIComponent(formatId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const map: Record<number, { empId: string; empName: string }> = {};
          if (json.data.pickedRows) {
            Object.entries(json.data.pickedRows).forEach(([idx, v]) => {
              const n = parseInt(idx, 10);
              if (!isNaN(n) && v && typeof v === 'object' && 'empId' in v && 'empName' in v) {
                map[n] = { empId: String(v.empId), empName: String(v.empName) };
              }
            });
          }
          setPickedByOthers(map);
          const myPicked = json.data.myPickedRows;
          if (Array.isArray(myPicked) && myPicked.length > 0) {
            setPickedRowIndices(new Set(myPicked.filter((i: number) => typeof i === 'number' && i >= 0)));
          }
        } else {
          setPickedByOthers({});
        }
      })
      .catch(() => setPickedByOthers({}));
  }, [useCustomFormat, formatId, token, rows.length]);

  // Refetch picked-rows when window gains focus (e.g. after admin reassigns a row)
  useEffect(() => {
    if (!useCustomFormat || !formatId || !token || rows.length === 0) return;
    const onFocus = () => {
      fetch(`/api/employee/picked-rows?formatId=${encodeURIComponent(formatId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.success && json.data) {
            const map: Record<number, { empId: string; empName: string }> = {};
            if (json.data.pickedRows) {
              Object.entries(json.data.pickedRows).forEach(([idx, v]: [string, any]) => {
                const n = parseInt(idx, 10);
                if (!isNaN(n) && v && typeof v === 'object' && v.empId != null && v.empName != null) {
                  map[n] = { empId: String(v.empId), empName: String(v.empName) };
                }
              });
            }
            setPickedByOthers(map);
            const myPicked = json.data.myPickedRows;
            if (Array.isArray(myPicked)) {
              setPickedRowIndices(new Set(myPicked.filter((i: number) => typeof i === 'number' && i >= 0)));
            }
          }
        })
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [useCustomFormat, formatId, token, rows.length]);

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
    if (currentEditingFileId) {
      setEditingPickedIndices((prev) => [...prev, null]);
    }
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
    if (currentEditingFileId) {
      setEditingPickedIndices((prev) => [...prev, ...newRows.map(() => null)]);
    }
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
    if (currentEditingFileId) {
      setEditingPickedIndices((prev) => prev.filter((_, i) => i !== index));
    }
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
      setPickedRowIndices(new Set());
      setMessage(null);
    }
  };

  const togglePick = (rowIndex: number) => {
    if (pickedByOthers[rowIndex]) return;
    const wasChecked = pickedRowIndices.has(rowIndex);
    setPickedRowIndices((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
    if (wasChecked && useCustomFormat && formatId && token) {
      fetch('/api/employee/picked-rows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ formatId, rowIndex }),
      }).catch(() => {});
    }
  };
  const selectAllPick = () => setPickedRowIndices(new Set(rows.map((_, i) => i).filter((i) => !pickedByOthers[i])));
  const clearAllPick = () => setPickedRowIndices(new Set());

  const savePickData = async () => {
    const name = (savePickFilename || '').trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Please enter a filename.' });
      return;
    }
    const filename = name.endsWith('.xlsx') ? name : `${name}.xlsx`;
    if (pickedRowIndices.size === 0) {
      setMessage({ type: 'error', text: 'Please pick at least one row (use the Pick column).' });
      return;
    }
    const selectedRows = Array.from(pickedRowIndices)
      .sort((a, b) => a - b)
      .map((i) => rows[i])
      .filter(Boolean)
      .map((row) => {
        const obj: ExcelRow = {};
        columnNames.forEach((col) => {
          obj[col] = row[col] !== undefined && row[col] !== null ? row[col] : '';
        });
        return obj;
      });
    if (selectedRows.length === 0) {
      setMessage({ type: 'error', text: 'No rows to save.' });
      return;
    }
    setSavingPick(true);
    setMessage(null);
    try {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(selectedRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const file = new File([blob], filename, { type: blob.type });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('labourType', labourType);
      formData.append('rowCount', String(selectedRows.length));
      if (useCustomFormat && formatId) {
        formData.append('isPickSave', 'true');
        formData.append('formatId', formatId);
        formData.append('rowIndices', JSON.stringify(Array.from(pickedRowIndices).sort((a, b) => a - b)));
      }
      const res = await fetch('/api/employee/save-excel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      if (result.success) {
        setShowSavePickModal(false);
        setSavePickFilename('');
        setPickedRowIndices(new Set());
        setMessage({ type: 'success', text: `Saved "${filename}". It appears in My Saved Excel Files — you can work with it there (bulk, save, etc.) and it will show in admin.` });
        if (onSaveSuccess) onSaveSuccess();
        if (useCustomFormat && formatId && token) {
          fetch(`/api/employee/picked-rows?formatId=${encodeURIComponent(formatId)}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((json) => {
              if (json.success && json.data?.myPickedRows && Array.isArray(json.data.myPickedRows))
                setPickedRowIndices(new Set(json.data.myPickedRows));
              if (json.success && json.data?.pickedRows && typeof json.data.pickedRows === 'object') {
                const map: Record<number, { empId: string; empName: string }> = {};
                Object.entries(json.data.pickedRows).forEach(([idx, v]) => {
                  const n = parseInt(idx, 10);
                  if (!isNaN(n) && v && typeof v === 'object' && 'empId' in v && 'empName' in v)
                    map[n] = { empId: String((v as any).empId), empName: String((v as any).empName) };
                });
                setPickedByOthers(map);
              }
            })
            .catch(() => {});
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save.' });
    } finally {
      setSavingPick(false);
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
        if (formatId) {
          formData.append('formatId', formatId);
          const indices = editingPickedIndices.filter((x): x is number => x !== null && x >= 0);
          if (indices.length > 0) {
            formData.append('rowIndices', JSON.stringify(indices));
          }
        }
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
        const wasEditing = !!currentEditingFileId;
        const savedRowCount = rows.length;

        if (wasEditing) {
          // Update (PUT): keep editing same file — do not clear form or file id so they can add/remove rows and save again
          let successText = `File updated successfully! (${savedRowCount} rows). You can add more rows, remove rows, or save again.`;
          if (result.data?.updatedMergedFiles && result.data.updatedMergedFiles.length > 0) {
            successText += `\n\n✅ Auto-updated ${result.data.updatedMergedFiles.length} merged file(s).`;
            alert(`✅ File Updated!\n\n📋 Auto-updated ${result.data.updatedMergedFiles.length} merged file(s).`);
          }
          setMessage({ type: 'success', text: successText });
        } else {
          // New file (POST): clear form so next save creates a new file
          setCurrentEditingFileId(undefined);
          let successText = `Excel file saved successfully! (${savedRowCount} rows) File saved and form cleared. You can now add new data.`;
          if (result.data?.updatedMergedFiles && result.data.updatedMergedFiles.length > 0) {
            successText += `\n\n✅ Auto-updated ${result.data.updatedMergedFiles.length} merged file(s):\n${result.data.updatedMergedFiles.map((name: string) => `  • ${name}`).join('\n')}\n\nAdmin will be notified.`;
            alert(`✅ File Saved!\n\n📋 Auto-updated ${result.data.updatedMergedFiles.length} merged file(s).`);
          }
          setRows([]);
          setMessage({ type: 'success', text: successText });
          if (onFileCreated) onFileCreated(file);
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
          {currentEditingFileId && editingFileName && (
            <p className="text-sm font-medium text-blue-700 mt-1 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-blue-100 border border-blue-200">Edit mode</span>
              Editing: <strong>{editingFileName}</strong> — add or remove rows, then Save Excel to update this file.
            </p>
          )}
          {useCustomFormat && customFormat && !currentEditingFileId && (
            <p className="text-sm text-gray-600 mt-1">
              Using format: <strong>{customFormat.name}</strong>
              {customFormat.description && ` - ${customFormat.description}`}
            </p>
          )}
          {useCustomFormat && customFormat && currentEditingFileId && !editingFileName && (
            <p className="text-sm text-gray-600 mt-1">
              Using format: <strong>{customFormat.name}</strong>
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
          <div className="mb-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Search rows</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={rowSearch}
                onChange={(e) => { setRowSearch(e.target.value); setTablePage(1); }}
                placeholder="Search in all columns..."
                className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => { setRowSearch(''); setTablePage(1); }}
                className="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Clear
              </button>
              <span className="text-sm text-gray-600">
                {(() => {
                  const showPickColumn = useCustomFormat && !currentEditingFileId;
                  const pickableCount = showPickColumn ? rows.filter((_, i) => !pickedByOthers[i]).length : rows.length;
                  const lockedCount = showPickColumn ? rows.filter((_, i) => pickedByOthers[i]).length : 0;
                  const searchTrim = debouncedRowSearch.trim();
                  const total = rows.length;
                  const matched = searchTrim
                    ? rows.filter((r) =>
                        columns.some((col) =>
                          String(r[col.name] ?? '').toLowerCase().includes(searchTrim.toLowerCase())
                        )
                      ).length
                    : total;
                  return searchTrim
                    ? `Showing ${matched} of ${total} rows${lockedCount ? ` (${pickableCount} you can pick, ${lockedCount} locked — hover to see who)` : ''}`
                    : `${total} row(s)${lockedCount ? ` — ${pickableCount} you can pick, ${lockedCount} locked (hover to see who)` : ''}`;
                })()}
              </span>
            </div>
          </div>
          <div className="overflow-auto mb-4 border border-gray-300 bg-white max-h-[70vh] shadow-sm" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
            <table className="min-w-full border-collapse" style={{ tableLayout: 'auto' }}>
              <thead className="sticky top-0 z-20 bg-[#217346]">
                <tr>
                  <th className="px-2 py-1.5 text-center text-xs font-semibold text-white border border-gray-400 whitespace-nowrap w-12">#</th>
                  {useCustomFormat && !currentEditingFileId && (
                    <th className="px-2 py-1.5 text-center text-xs font-semibold text-white border border-gray-400 whitespace-nowrap w-24">
                      Pick
                      <div className="flex justify-center gap-1 mt-0.5">
                        <button type="button" onClick={selectAllPick} className="text-[10px] text-gray-200 hover:text-white underline">All</button>
                        <span className="text-gray-400">|</span>
                        <button type="button" onClick={clearAllPick} className="text-[10px] text-gray-200 hover:text-white underline">Clear</button>
                      </div>
                    </th>
                  )}
                  {columns.map((col, colIdx) => {
                    const minWidth = Math.max(100, Math.min(col.name.length * 8 + 40, 260));
                    return (
                      <th
                        key={col.name}
                        className="px-2 py-1.5 text-left text-xs font-semibold text-white border border-gray-400 whitespace-nowrap"
                        style={{ minWidth: `${minWidth}px` }}
                      >
                        <span className="text-[10px] text-gray-200 mr-1">{getColumnLetter(colIdx)}</span>
                        {col.name}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white">
                {(() => {
                  const showPickColumn = useCustomFormat && !currentEditingFileId;
                  const colSpanTotal = columns.length + (showPickColumn ? 2 : 1);
                  const searchTrim = debouncedRowSearch.trim();
                  const visibleEntries = rows.map((row, i) => ({ row, templateIndex: i }));
                  const filteredEntries = searchTrim
                    ? visibleEntries.filter(({ row }) =>
                        columns.some((col) =>
                          String(row[col.name] ?? '').toLowerCase().includes(searchTrim.toLowerCase())
                        )
                      )
                    : visibleEntries;
                  return filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={colSpanTotal} className="px-4 py-6 text-center text-gray-500 border border-gray-300">
                        No rows match the search.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map(({ row, templateIndex: rowIndex }) => {
                      const lockedBy = showPickColumn ? pickedByOthers[rowIndex] : null;
                      return (
                        <tr
                          key={rowIndex}
                          className={lockedBy ? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-[#e8f4ea]'}
                        >
                          <td className="px-2 py-1 text-center text-xs font-medium text-gray-600 border border-gray-300 bg-[#f3f4f6] w-12">{rowIndex + 1}</td>
                          {showPickColumn && (
                            <td
                              className={`px-2 py-1 text-center border border-gray-300 w-24 align-top ${lockedBy ? 'bg-gray-200' : 'bg-white'}`}
                              title={lockedBy ? `Picked by: ${lockedBy.empName} (${lockedBy.empId}) — you cannot pick this row` : undefined}
                            >
                              {lockedBy ? (
                                <span className="inline-flex items-center gap-1 text-gray-500 text-xs" title={`Picked by: ${lockedBy.empName} (${lockedBy.empId})`}>
                                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                  </svg>
                                  <span className="hidden sm:inline">Locked</span>
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={pickedRowIndices.has(rowIndex)}
                                  onChange={() => togglePick(rowIndex)}
                                  title="Pick this row"
                                  className="h-4 w-4 cursor-pointer"
                                />
                              )}
                            </td>
                          )}
                          {columns.map((col) => {
                            const isReadOnly = col.editable === false;
                            const minWidth = Math.max(100, Math.min(col.name.length * 8 + 40, 260));
                            return (
                              <td key={col.name} className={`p-0 align-top ${isReadOnly ? 'bg-gray-50' : ''}`} style={{ minWidth: `${minWidth}px` }}>
                                {col.type === 'dropdown' && col.validation?.options ? (
                                  <select
                                    value={row[col.name] || ''}
                                    onChange={(e) => updateCell(rowIndex, col.name, e.target.value)}
                                    className={`w-full h-full min-h-[28px] px-2 py-1 border-0 border-r border-b border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'}`}
                                    required={col.required}
                                    disabled={isReadOnly}
                                    title={isReadOnly ? 'Read-only' : ''}
                                  >
                                    <option value="">Select...</option>
                                    {col.validation.options.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : col.type === 'email' ? 'email' : 'text'}
                                    value={col.type === 'date' ? toDateInputValue(row[col.name]) : (row[col.name] ?? '')}
                                    onChange={(e) => updateCell(rowIndex, col.name, e.target.value)}
                                    className={`w-full min-h-[28px] px-2 py-1 border-0 border-r border-b border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${isReadOnly ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'}`}
                                    placeholder={col.name}
                                    required={col.required}
                                    disabled={isReadOnly}
                                    readOnly={isReadOnly}
                                    title={isReadOnly ? 'Read-only' : ''}
                                    min={col.type === 'number' ? col.validation?.min : undefined}
                                    max={col.type === 'number' ? col.validation?.max : undefined}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  );
                })()}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {(() => {
              const totalCount = rows.length;
              const searchTrim = debouncedRowSearch.trim();
              const matchedCount = searchTrim
                ? rows.filter((r) => columns.some((col) => String(r[col.name] ?? '').toLowerCase().includes(searchTrim.toLowerCase()))).length
                : totalCount;
              return searchTrim
                ? `Showing ${matchedCount} of ${totalCount} rows — scroll to see all`
                : `${totalCount} row(s) — scroll to see all`;
            })()}
          </p>
          <div
            className={`flex justify-end gap-2 flex-wrap mt-2 pt-2 border-t border-gray-200 bg-white ${currentEditingFileId ? 'sticky bottom-0 z-30 py-3 -mx-1 px-1 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]' : 'relative z-10'}`}
            onClick={(e) => e.stopPropagation()}
            role="toolbar"
            aria-label="Row actions"
          >
            {useCustomFormat && !currentEditingFileId && rows.filter((_, i) => !pickedByOthers[i]).length > 0 && (
              <button
                type="button"
                onClick={() => setShowSavePickModal(true)}
                className="px-4 py-2 bg-[#217346] text-white rounded-md hover:bg-[#1a5c38] cursor-pointer"
              >
                Save my pick
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); addRow(); }}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer select-none pointer-events-auto"
              tabIndex={0}
              aria-label="Add another row"
            >
              + Add Another Row
            </button>
            {currentEditingFileId && formatId && templateRows.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAddFromFileSearch('');
                  setAddFromFileSelected(new Set(editingPickedIndices.filter((x): x is number => x !== null && x >= 0)));
                  setShowAddFromFileModal(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                aria-label="Add rows from main Excel (format)"
              >
                📂 Add data from file
              </button>
            )}
            <button
              type="button"
              onClick={saveExcel}
              disabled={saving || !token}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer"
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
      {showSavePickModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !savingPick && setShowSavePickModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Save my pick</h3>
            <p className="text-sm text-gray-600 mb-3">Enter a filename. Only the rows you picked will be saved. The file will appear in My Saved Excel Files with the same workflow (bulk, save, etc.).</p>
            <input
              type="text"
              value={savePickFilename}
              onChange={(e) => setSavePickFilename(e.target.value)}
              placeholder="e.g. my_work.xlsx"
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => !savingPick && setShowSavePickModal(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300" disabled={savingPick}>Cancel</button>
              <button type="button" onClick={savePickData} disabled={savingPick} className="px-4 py-2 bg-[#217346] text-white rounded-md hover:bg-[#1a5c38] disabled:opacity-60">{savingPick ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {showAddFromFileModal && templateRows.length > 0 && (() => {
        const searchTrim = addFromFileSearchDebounced.trim().toLowerCase();
        const filteredEntries = searchTrim
          ? templateRows
              .map((row, idx) => ({ row, idx }))
              .filter(({ row }) =>
                columns.some((col) => String(row[col.name] ?? '').toLowerCase().includes(searchTrim))
              )
          : templateRows.map((row, idx) => ({ row, idx }));
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddFromFileModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-[95vw] w-full mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Add data from file (main Excel)</h3>
            <p className="text-sm text-gray-600 mb-3">Check rows to include in your file. Uncheck a row to remove it from your file and <strong>free it in the main Excel</strong> so others can pick it. Then click Apply — your file will show only the selected rows. Save Excel to update the saved file.</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Search:</label>
              <input
                type="text"
                value={addFromFileSearch}
                onChange={(e) => setAddFromFileSearch(e.target.value)}
                placeholder="Search in all columns..."
                className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {addFromFileSearch && (
                <button type="button" onClick={() => setAddFromFileSearch('')} className="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                  Clear
                </button>
              )}
              <span className="text-sm text-gray-600">
                {searchTrim ? `Showing ${filteredEntries.length} of ${templateRows.length} rows` : `All ${templateRows.length} rows`}
              </span>
            </div>
            <div className="overflow-auto border border-gray-200 rounded flex-1 min-h-0">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-gray-100 border-b border-gray-300 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold w-12 sticky left-0 bg-gray-100 border-r border-gray-200">Pick</th>
                    {columns.map((col) => (
                      <th key={col.name} className="px-2 py-1.5 text-left font-semibold border-l border-gray-200 whitespace-nowrap min-w-[100px]">{col.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(({ row, idx }) => {
                    const taken = pickedByOthers[idx];
                    const checked = addFromFileSelected.has(idx);
                    return (
                      <tr key={idx} className={taken ? 'bg-gray-50' : ''}>
                        <td className={`px-2 py-1 border border-gray-200 sticky left-0 border-r border-gray-200 z-[1] ${taken ? 'bg-gray-50' : 'bg-white'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!!taken}
                            onChange={() => {
                              if (taken) return;
                              setAddFromFileSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              });
                            }}
                            className="cursor-pointer"
                            title={taken ? `Assigned to ${taken.empName}` : 'Toggle row'}
                          />
                          {taken && <span className="text-xs text-gray-500 ml-1">({taken.empName})</span>}
                        </td>
                        {columns.map((col) => (
                          <td key={col.name} className="px-2 py-1 border border-gray-200 whitespace-nowrap max-w-[180px] truncate" title={String(row[col.name] ?? '')}>
                            {String(row[col.name] ?? '')}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
              <button type="button" onClick={() => setShowAddFromFileModal(false)} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  const sorted = Array.from(addFromFileSelected).sort((a, b) => a - b);
                  const previouslyPicked = editingPickedIndices.filter((x): x is number => x !== null && x >= 0);
                  const indicesToRelease = previouslyPicked.filter((i) => !addFromFileSelected.has(i));
                  if (formatId && token && indicesToRelease.length > 0) {
                    try {
                      await Promise.all(
                        indicesToRelease.map((rowIndex) =>
                          fetch('/api/employee/picked-rows', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ formatId, rowIndex }),
                          })
                        )
                      );
                      if (useCustomFormat && formatId && token) {
                        fetch(`/api/employee/picked-rows?formatId=${encodeURIComponent(formatId)}`, { headers: { Authorization: `Bearer ${token}` } })
                          .then((r) => r.json())
                          .then((json) => {
                            if (json.success && json.data?.pickedRows && typeof json.data.pickedRows === 'object') {
                              const map: Record<number, { empId: string; empName: string }> = {};
                              Object.entries(json.data.pickedRows).forEach(([idx, v]) => {
                                const n = parseInt(idx, 10);
                                if (!isNaN(n) && v && typeof v === 'object' && 'empId' in v && 'empName' in v) {
                                  map[n] = { empId: String((v as any).empId), empName: String((v as any).empName) };
                                }
                              });
                              setPickedByOthers(map);
                            }
                          })
                          .catch(() => {});
                      }
                    } catch (_e) {
                      setMessage({ type: 'error', text: 'Some rows could not be released. They were still removed from your file.' });
                    }
                  }
                  const newRows = sorted.map((i) => {
                    const tr = templateRows[i] || {};
                    const row: ExcelRow = {};
                    columns.forEach((col) => {
                      row[col.name] = tr[col.name] !== undefined && tr[col.name] !== null ? tr[col.name] : '';
                    });
                    return row;
                  });
                  setRows(newRows);
                  setEditingPickedIndices(sorted);
                  setShowAddFromFileModal(false);
                  const releasedText = indicesToRelease.length > 0 ? ` ${indicesToRelease.length} row(s) freed in main Excel.` : '';
                  setMessage({ type: 'success', text: `Updated to ${sorted.length} row(s). Saving file...` });

                  if (currentEditingFileId && token) {
                    try {
                      setSaving(true);
                      const workbook = XLSX.utils.book_new();
                      const worksheet = XLSX.utils.json_to_sheet(newRows);
                      const colWidths = columnNames.map(() => ({ wch: 20 }));
                      worksheet['!cols'] = colWidths;
                      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
                      const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
                      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                      const now = new Date();
                      const dateStr = now.toISOString().split('T')[0];
                      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
                      const filename = `employee_data_${labourType.toLowerCase()}_${dateStr}_${timeStr}.xlsx`;
                      const file = new File([blob], filename, { type: blob.type });
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('labourType', labourType);
                      formData.append('rowCount', String(newRows.length));
                      formData.append('fileId', currentEditingFileId);
                      if (formatId) {
                        formData.append('formatId', formatId);
                        if (sorted.length > 0) formData.append('rowIndices', JSON.stringify(sorted));
                      }
                      const res = await fetch('/api/employee/save-excel', {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}` },
                        body: formData,
                      });
                      const result = await res.json();
                      if (result.success) {
                        setMessage({ type: 'success', text: `File saved with ${sorted.length} row(s).${releasedText}` });
                        if (onSaveSuccess) onSaveSuccess();
                      } else {
                        setMessage({ type: 'error', text: result.error || 'File could not be saved. You can try Save Excel.' });
                      }
                    } catch (err: any) {
                      setMessage({ type: 'error', text: err.message || 'Save failed. Click Save Excel to try again.' });
                    } finally {
                      setSaving(false);
                    }
                  } else {
                    setMessage({ type: 'success', text: `Updated to ${sorted.length} row(s) from main file.${releasedText} Click Save Excel to update your file.` });
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Apply to my file
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

