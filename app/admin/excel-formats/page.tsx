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
  editable: boolean; // true = editable by users, false = read-only
  unique?: boolean; // true = column values must be unique
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
  const [importedRowData, setImportedRowData] = useState<Record<string, any>[]>([]); // Store imported row data
  const [dropdownInputs, setDropdownInputs] = useState<{ [key: number]: string }>({}); // Track raw dropdown input values
  const [viewingFormatId, setViewingFormatId] = useState<string | null>(null);
  const [formatTemplateData, setFormatTemplateData] = useState<any[]>([]);
  const [viewingFormatColumns, setViewingFormatColumns] = useState<Column[]>([]);
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
        editable: true, // Default to editable
        unique: false, // Default to not unique
        order: formData.columns.length,
      }],
    });
  };

  // Helper function to format cell value for display (especially dates)
  const formatCellValueForDisplay = (value: any, columnType: string): string => {
    if (value === undefined || value === null || value === '') return '';
    
    const stringValue = String(value).trim();
    
    // Handle date columns - convert Excel serial dates to readable format
    if (columnType === 'date') {
      // Check if it's an Excel serial date number (e.g., 45117, 45072)
      const excelSerial = parseFloat(stringValue);
      if (!isNaN(excelSerial) && excelSerial > 0 && excelSerial < 1000000) {
        // Excel serial date: days since January 1, 1900
        // Excel epoch starts on 1900-01-01, but Excel incorrectly treats 1900 as a leap year
        const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
        const date = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);
        if (!isNaN(date.getTime())) {
          // Format as DD/MM/YYYY for display
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        }
      }
      
      // If already in YYYY-MM-DD format, convert to DD/MM/YYYY
      if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
        const parts = stringValue.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      
      // Try parsing as date
      const parsedDate = new Date(stringValue);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900 && parsedDate.getFullYear() < 2100) {
        const day = String(parsedDate.getDate()).padStart(2, '0');
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const year = parsedDate.getFullYear();
        return `${day}/${month}/${year}`;
      }
    }
    
    // For other types, return as string
    return stringValue;
  };

  // Helper function to convert value to target type
  const convertValueToType = (value: any, targetType: string, originalType?: string): any => {
    if (!value || value === '') return '';
    
    const stringValue = String(value).trim();
    
    switch (targetType) {
      case 'date':
        // Try to parse various date formats
        if (originalType === 'date') {
          // Already a date, try to preserve it
          // Check if it's in YYYY-MM-DD format (HTML date input format)
          if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
            return stringValue;
          }
        }
        
        // Check if it's an Excel serial date number (e.g., 45117)
        const excelSerial = parseFloat(stringValue);
        if (!isNaN(excelSerial) && excelSerial > 0 && excelSerial < 1000000) {
          // Excel serial date: days since January 1, 1900
          // Excel epoch starts on 1900-01-01, but Excel incorrectly treats 1900 as a leap year
          const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
          const date = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
        }
        
        // Try common date formats
        const dateFormats = [
          /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
          /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
          /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
          /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
          /^\d{1,2}\/\d{1,2}\/\d{4}$/, // M/D/YYYY or MM/DD/YYYY
          /^\d{1,2}-\d{1,2}-\d{4}$/, // M-D-YYYY or MM-DD-YYYY
        ];
        
        // Check if it's already in a valid date format
        for (const format of dateFormats) {
          if (format.test(stringValue)) {
            // Convert to YYYY-MM-DD format for HTML date input
            const parts = stringValue.split(/[\/\-]/);
            if (parts.length === 3) {
              // Determine format based on first part length
              if (parts[0].length === 4) {
                // YYYY-MM-DD or YYYY/MM/DD
                return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
              } else {
                // MM/DD/YYYY or MM-DD-YYYY (assume US format)
                const month = parts[0].padStart(2, '0');
                const day = parts[1].padStart(2, '0');
                const year = parts[2];
                return `${year}-${month}-${day}`;
              }
            }
            return stringValue;
          }
        }
        
        // Try parsing as date (handles various formats)
        const parsedDate = new Date(stringValue);
        if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900 && parsedDate.getFullYear() < 2100) {
          // Valid date, format as YYYY-MM-DD
          const year = parsedDate.getFullYear();
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const day = String(parsedDate.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        
        // If can't parse, preserve original value (don't clear it)
        // User can manually fix if needed, but at least data isn't lost
        console.warn(`Could not convert "${stringValue}" to date format, preserving original value`);
        return stringValue;
        
      case 'number':
        // Try to extract number from string
        if (originalType === 'number') {
          return stringValue;
        }
        // Remove non-numeric characters except decimal point and minus sign
        const cleaned = stringValue.replace(/[^\d.\-]/g, '');
        const numValue = parseFloat(cleaned);
        if (!isNaN(numValue)) {
          return numValue.toString();
        }
        // If can't parse, preserve original value
        console.warn(`Could not convert "${stringValue}" to number, preserving original value`);
        return stringValue;
        
      case 'email':
        // Keep as is, validation will happen later
        return stringValue;
        
      case 'text':
      case 'dropdown':
      default:
        // Text and dropdown keep as string
        return stringValue;
    }
  };

  const updateColumn = (index: number, field: string, value: any) => {
    const newColumns = [...formData.columns];
    const oldColumn = newColumns[index];
    const updatedColumn = { ...oldColumn, [field]: value };
    
    // Ensure unique is always a boolean (not undefined)
    if (field === 'unique') {
      updatedColumn.unique = value === true;
    }
    
    // If type is changing, convert existing data
    if (field === 'type' && value !== oldColumn.type && importedRowData.length > 0) {
      const columnName = oldColumn.name;
      const newType = value;
      const oldType = oldColumn.type;
      
      // Convert all row data for this column
      const convertedRowData = importedRowData.map(row => {
        const newRow = { ...row };
        if (newRow[columnName] !== undefined) {
          newRow[columnName] = convertValueToType(newRow[columnName], newType, oldType);
        }
        return newRow;
      });
      
      setImportedRowData(convertedRowData);
      console.log(`Converted column "${columnName}" from ${oldType} to ${newType}`, convertedRowData);
    }
    
    newColumns[index] = updatedColumn;
    setFormData({ ...formData, columns: newColumns });
    
    // Log for debugging
    if (field === 'unique') {
      console.log(`Column ${index} (${newColumns[index].name}) unique updated to:`, value, 'Type:', typeof value);
    }
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
          const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false, cellText: false });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          
          if (!firstSheet || !firstSheet['!ref']) {
            alert('Excel file appears to be empty or invalid');
            return;
          }

          let headers: string[] = [];

          // Method 1: Read first row directly from worksheet cells (most reliable)
          try {
            const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1:Z1');
            const rowHeaders: string[] = [];
            
            // Read first row (row 0) - extend range to cover more columns if needed
            const maxCol = Math.max(range.e.c, 50); // Check up to column 50 (AZ)
            
            for (let col = range.s.c; col <= maxCol; col++) {
              const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
              const cell = firstSheet[cellAddress];
              
              let cellValue = '';
              if (cell) {
                // Prefer formatted value (w), then raw value (v)
                if (cell.w) {
                  cellValue = String(cell.w).trim();
                } else if (cell.v !== null && cell.v !== undefined) {
                  cellValue = String(cell.v).trim();
                }
              }
              
              // Only add non-empty values that aren't _EMPTY placeholders
              if (cellValue && !cellValue.startsWith('_EMPTY')) {
                rowHeaders.push(cellValue);
              } else if (cellValue === '' && rowHeaders.length > 0) {
                // If we hit an empty cell after finding headers, continue (might have gaps)
                // But if we haven't found any headers yet, keep going
                continue;
              }
            }
            
            // Also check if we need to look beyond the initial range
            if (rowHeaders.length === 0 && range.e.c < 50) {
              for (let col = range.e.c + 1; col <= 50; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
                const cell = firstSheet[cellAddress];
                
                if (cell) {
                  let cellValue = '';
                  if (cell.w) {
                    cellValue = String(cell.w).trim();
                  } else if (cell.v !== null && cell.v !== undefined) {
                    cellValue = String(cell.v).trim();
                  }
                  
                  if (cellValue && !cellValue.startsWith('_EMPTY')) {
                    rowHeaders.push(cellValue);
                  } else if (cellValue === '' && rowHeaders.length > 0) {
                    break; // Stop at empty cell if we have headers
                  }
                } else if (rowHeaders.length > 0) {
                  break; // Stop if no cell and we have headers
                }
              }
            }
            
            if (rowHeaders.length >= 3) {
              headers = rowHeaders;
              console.log('Method 1 succeeded. Found headers:', headers);
            } else {
              console.log('Method 1 found', rowHeaders.length, 'headers, need at least 3');
            }
          } catch (e) {
            console.log('Method 1 (direct cell read) failed, trying method 2...', e);
          }

          // Method 2: Try reading as array and find header row
          if (headers.length === 0) {
            try {
              const allData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false }) as any[][];
              
              if (allData.length === 0) {
                alert('Excel file is empty');
                return;
              }

              // Try to find the header row (first row with at least 3 non-empty cells)
              let headerRowIndex = -1;
              for (let i = 0; i < Math.min(5, allData.length); i++) {
                const row = allData[i] as any[];
                if (!row) continue;
                
                const nonEmptyCells = row
                  .map((cell: any) => {
                    if (cell === null || cell === undefined) return '';
                    if (typeof cell === 'object' && cell.w) return String(cell.w).trim();
                    return String(cell || '').trim();
                  })
                  .filter((cell: string) => {
                    return cell !== '' && !cell.startsWith('_EMPTY');
                  });
                
                if (nonEmptyCells.length >= 3) {
                  headerRowIndex = i;
                  break;
                }
              }

              if (headerRowIndex >= 0) {
                const headerRow = allData[headerRowIndex] as any[];
                headers = headerRow
                  .map((h: any) => {
                    // Handle various data types
                    if (h === null || h === undefined) return '';
                    if (typeof h === 'object' && h.w) return String(h.w).trim(); // Formatted value
                    return String(h).trim();
                  })
                  .filter((h: string) => {
                    const trimmed = h.trim();
                    return trimmed !== '' && 
                           !trimmed.startsWith('_EMPTY') && 
                           trimmed !== 'undefined' &&
                           trimmed !== 'null';
                  });
              }
            } catch (e) {
              console.log('Method 2 failed, trying method 3...');
            }
          }

          // Method 3: Try reading as JSON (fallback - may create _EMPTY keys)
          if (headers.length === 0) {
            try {
              const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
              if (jsonData.length > 0) {
                headers = Object.keys(jsonData[0] as any);
                // Filter out empty headers and _EMPTY placeholders
                headers = headers
                  .map(h => String(h || '').trim())
                  .filter(h => {
                    // Remove empty strings, _EMPTY, and _EMPTY_N patterns
                    const trimmed = h.trim();
                    return trimmed !== '' && 
                           !trimmed.startsWith('_EMPTY') && 
                           trimmed !== 'undefined' &&
                           trimmed !== 'null';
                  });
              }
            } catch (e) {
              console.log('Method 3 failed');
            }
          }

          // Method 2: If Method 1 didn't work, try reading as array and find header row
          if (headers.length === 0) {
            try {
              const allData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false }) as any[][];
              
              if (allData.length === 0) {
                alert('Excel file is empty');
                return;
              }

              // Try to find the header row (first row with at least 3 non-empty cells)
              let headerRowIndex = -1;
              for (let i = 0; i < Math.min(5, allData.length); i++) {
                const row = allData[i] as any[];
                if (!row) continue;
                
                const nonEmptyCells = row
                  .map((cell: any) => String(cell || '').trim())
                  .filter((cell: string) => cell !== '');
                
                if (nonEmptyCells.length >= 3) {
                  headerRowIndex = i;
                  break;
                }
              }

              if (headerRowIndex >= 0) {
                const headerRow = allData[headerRowIndex] as any[];
                headers = headerRow
                  .map((h: any) => {
                    // Handle various data types
                    if (h === null || h === undefined) return '';
                    if (typeof h === 'object' && h.w) return String(h.w).trim(); // Formatted value
                    return String(h).trim();
                  })
                  .filter((h: string) => {
                    const trimmed = h.trim();
                    return trimmed !== '' && 
                           !trimmed.startsWith('_EMPTY') && 
                           trimmed !== 'undefined' &&
                           trimmed !== 'null';
                  });
              }
            } catch (e) {
              console.log('Method 2 failed, trying method 3...');
            }
          }


          // Final check
          if (headers.length === 0) {
            alert('Could not detect column headers in the Excel file. Please ensure:\n' +
                  '1. The first row contains column names\n' +
                  '2. At least 3 columns have headers\n' +
                  '3. The file is not corrupted\n\n' +
                  'You can also try opening and saving the file again in Excel.');
            return;
          }

          // Remove any duplicate headers by appending index if needed
          const uniqueHeaders: string[] = [];
          const seenHeaders = new Set<string>();
          headers.forEach((header, index) => {
            let uniqueHeader = header;
            let counter = 1;
            while (seenHeaders.has(uniqueHeader)) {
              uniqueHeader = `${header}_${counter}`;
              counter++;
            }
            seenHeaders.add(uniqueHeader);
            uniqueHeaders.push(uniqueHeader);
          });

          // Extract all row data
          let rowData: Record<string, any>[] = [];
          try {
            // Read all data rows (skip header row)
            const allData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false }) as any[][];
            
            // Find header row index
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(5, allData.length); i++) {
              const row = allData[i] as any[];
              if (!row) continue;
              const nonEmptyCells = row
                .map((cell: any) => {
                  if (cell === null || cell === undefined) return '';
                  if (typeof cell === 'object' && cell.w) return String(cell.w).trim();
                  return String(cell || '').trim();
                })
                .filter((cell: string) => cell !== '' && !cell.startsWith('_EMPTY'));
              if (nonEmptyCells.length >= 3) {
                headerRowIndex = i;
                break;
              }
            }

            // Extract data rows (after header row)
            const dataStartIndex = headerRowIndex + 1;
            const dataRows = allData.slice(dataStartIndex);

            // Convert data rows to objects using headers
            for (let i = 0; i < dataRows.length; i++) {
              const row = dataRows[i] as any[];
              if (!row || row.length === 0) continue;

              const rowObject: Record<string, any> = {};
              uniqueHeaders.forEach((header, idx) => {
                const cellValue = row[idx];
                if (cellValue !== null && cellValue !== undefined) {
                  // Handle formatted values
                  if (typeof cellValue === 'object' && cellValue.w) {
                    rowObject[header] = String(cellValue.w).trim();
                  } else {
                    rowObject[header] = String(cellValue || '').trim();
                  }
                } else {
                  rowObject[header] = '';
                }
              });

              // Only add row if it has at least one non-empty value
              const hasData = Object.values(rowObject).some(val => val !== '');
              if (hasData) {
                rowData.push(rowObject);
              }
            }
          } catch (err) {
            console.error('Error extracting row data:', err);
            // Continue even if row extraction fails - at least we have headers
          }

          // Create columns - all as text type, all editable by default
          const columns: Column[] = uniqueHeaders.map((header, index) => {
            // Determine if required based on header name
            const headerLower = header.toLowerCase();
            const required = headerLower.includes('emp id') || 
                           headerLower.includes('employee id') || 
                           headerLower.includes('name') ||
                           headerLower.includes('employee name') ||
                           headerLower.includes('s.no') ||
                           headerLower.includes('serial') ||
                           headerLower.includes('s.no');

            return {
              name: header,
              type: 'text' as const, // All columns as text type
              required: required,
              editable: true, // Default to editable (admin can change in form)
              unique: false, // Default to not unique
              validation: {},
              order: index,
            };
          });

          // Generate format name from filename or use default
          const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
          const formatName = fileName || `Imported Format - ${new Date().toLocaleDateString()}`;
          const formatDescription = `Format created from Excel file: ${file.name}`;

          // Store imported row data
          setImportedRowData(rowData);

          // Populate form with imported data
          setFormData({
            name: formatName,
            description: formatDescription,
            columns,
            assignedToType: 'all',
            assignedTo: [],
          });
          setShowForm(true);
          alert(`Imported format "${formatName}" with ${columns.length} columns and ${rowData.length} rows successfully! You can now configure editable/read-only permissions for each column.`);
        } catch (err: any) {
          console.error('Import error:', err);
          alert('Failed to import format: ' + (err.message || 'Unknown error occurred. Please check the console for details.'));
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
        body: JSON.stringify({
          ...formData,
          columns: formData.columns.map(col => ({
            ...col,
            unique: col.unique === true, // Ensure it's always a boolean
          })),
        }),
      });

      const result = await response.json();
      if (result.success) {
        const formatId = result.data._id || result.data.id;
        
        // Log the saved format to verify unique property is saved
        console.log('Format saved successfully:', result.data);
        console.log('Columns with unique property:', result.data.columns?.map((col: any) => ({ 
          name: col.name, 
          unique: col.unique 
        })));
        
        // If we have imported row data and this is a new format, save it
        if (!editingFormat && importedRowData.length > 0 && formatId) {
          try {
            const saveDataResponse = await fetch('/api/admin/excel-formats/save-template-data', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                formatId,
                rows: importedRowData,
              }),
            });
            
            const saveDataResult = await saveDataResponse.json();
            if (!saveDataResult.success) {
              console.error('Failed to save template data:', saveDataResult.error);
            }
          } catch (err) {
            console.error('Error saving template data:', err);
          }
        }
        
        setShowForm(false);
        setDropdownInputs({}); // Clear dropdown inputs
        setEditingFormat(null);
        setImportedRowData([]); // Clear imported data
        setFormData({
          name: '',
          description: '',
          columns: [],
          assignedToType: 'all',
          assignedTo: [],
        });
        fetchFormats();
        alert(editingFormat ? 'Format updated successfully!' : `Format created successfully with ${importedRowData.length} rows!`);
      } else {
        alert(result.error || 'Failed to save format');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save format');
    }
  };

  const handleEdit = (format: ExcelFormat) => {
    setEditingFormat(format);
    // Initialize dropdown inputs from format columns
    const dropdownInputsMap: { [key: number]: string } = {};
    format.columns.forEach((col, index) => {
      if (col.type === 'dropdown' && col.validation?.options) {
        dropdownInputsMap[index] = col.validation.options.join(', ');
      }
    });
    setDropdownInputs(dropdownInputsMap);
    setImportedRowData([]); // Clear imported data when editing
    
    // Log the format being edited to debug
    console.log('Editing format:', format);
    console.log('Format columns:', format.columns.map((col: any) => ({ 
      name: col.name, 
      unique: col.unique,
      uniqueType: typeof col.unique 
    })));
    
    setFormData({
      name: format.name,
      description: format.description || '',
      columns: format.columns.map(col => ({
        ...col,
        editable: col.editable !== undefined ? col.editable : true, // Ensure editable property exists
        unique: col.unique === true ? true : false, // Explicitly set to false if not true (handles undefined, null, false)
      })),
      assignedToType: format.assignedToType,
      assignedTo: format.assignedTo.map(id => String(id)), // Ensure IDs are strings
    });
    
    // Log the form data after setting
    console.log('Form data columns:', formData.columns.map((col: any) => ({ 
      name: col.name, 
      unique: col.unique 
    })));
    
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

  const handleViewFormat = async (formatId: string) => {
    try {
      const response = await fetch(`/api/admin/excel-formats/${formatId}/view`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFormatTemplateData(result.data.rows || []);
        setViewingFormatColumns(result.data.columns || []);
        setViewingFormatId(formatId);
      } else {
        alert(result.error || 'Failed to load format data');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load format data');
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
              onClick={handleDownloadFormatTemplate}

              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              📥 Download Format Template
            </button>
            <button
              onClick={() => {
                setShowForm(!showForm);
                setEditingFormat(null);
                setDropdownInputs({}); // Clear dropdown inputs
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
            All columns will be set as <strong>text type</strong>. You can configure editable/read-only permissions for each column after import.
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
                      <div className="flex-1 grid grid-cols-6 gap-2">
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
                        <label className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={col.editable !== undefined ? col.editable : true}
                            onChange={(e) => updateColumn(index, 'editable', e.target.checked)}
                            className="mr-1"
                          />
                          <span className={col.editable === false ? 'text-red-600 font-semibold' : 'text-green-600'}>
                            {col.editable === false ? 'Read Only' : 'Editable'}
                          </span>
                        </label>
                        <label className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={col.unique === true}
                            onChange={(e) => {
                              console.log(`Updating column ${index} unique from ${col.unique} to ${e.target.checked}`);
                              updateColumn(index, 'unique', e.target.checked);
                            }}
                            className="mr-1"
                          />
                          <span className="text-blue-600 font-semibold">
                            Unique
                          </span>
                        </label>
                        {col.type === 'dropdown' && (
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              value={dropdownInputs[index] !== undefined ? dropdownInputs[index] : (col.validation?.options?.join(', ') || '')}
                              onChange={(e) => {
                                const inputValue = e.target.value;
                                // Store raw input value to allow commas while typing
                                setDropdownInputs(prev => ({
                                  ...prev,
                                  [index]: inputValue
                                }));
                                
                                // Parse and update options in real-time (but keep raw input)
                                const options = inputValue
                                  .split(',')
                                  .map((s: string) => s.trim())
                                  .filter((s: string) => s.length > 0);
                                
                                // Update validation with current options
                                updateColumn(index, 'validation', {
                                  ...col.validation,
                                  options: options
                                });
                              }}
                              onBlur={(e) => {
                                // On blur, clean up and finalize options
                                const inputValue = e.target.value.trim();
                                const options = inputValue
                                  .split(',')
                                  .map((s: string) => s.trim())
                                  .filter((s: string) => s.length > 0);
                                
                                // Update both the input display and validation
                                setDropdownInputs(prev => ({
                                  ...prev,
                                  [index]: options.join(', ')
                                }));
                                
                                updateColumn(index, 'validation', {
                                  ...col.validation,
                                  options: options
                                });
                              }}
                              placeholder="Options (comma-separated, e.g., a, b, c)"
                              className="px-2 py-1 border rounded text-sm w-full"
                            />
                            {col.validation?.options && col.validation.options.length > 0 && (
                              <div className="text-xs text-gray-500">
                                {col.validation.options.length} option(s): {col.validation.options.join(', ')}
                              </div>
                            )}
                          </div>
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
        setDropdownInputs({}); // Clear dropdown inputs
                    setEditingFormat(null);
                    setImportedRowData([]);
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
                        <div className="text-sm text-gray-900">
                          {format.columns.length} columns
                        </div>
                        <div className="text-xs text-gray-500">
                          {format.columns.map(c => c.name).join(', ')}
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
                            onClick={() => handleViewFormat(format._id)}
                            className="text-green-600 hover:text-green-900"
                            title="View Format Template Data"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadFormatExcel(format)}
                            className="text-green-600 hover:text-green-900"
                            title="Download Format as Excel"
                          >
                            📥 Download
                          </button>
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
                              onClick={() => handleDownloadFormat(format._id, format.name)}
                              className="text-green-600 hover:text-green-900 text-xs"
                            >
                              Download Template
                            </button>
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

        {/* View Format Template Data Modal */}
        {viewingFormatId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-2xl font-bold">Format Template Data</h2>
                <button
                  onClick={() => {
                    setViewingFormatId(null);
                    setFormatTemplateData([]);
                    setViewingFormatColumns([]);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              <div className="p-6 overflow-auto flex-1">
                {formatTemplateData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No template data available for this format.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase border border-gray-300 bg-gray-100">
                            #
                          </th>
                          {viewingFormatColumns
                            .sort((a, b) => a.order - b.order)
                            .map((col) => (
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
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {formatTemplateData.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-500 border border-gray-300">
                              {rowIndex + 1}
                            </td>
                            {viewingFormatColumns
                              .sort((a, b) => a.order - b.order)
                              .map((col) => (
                                <td
                                  key={col.name}
                                  className={`px-4 py-3 text-sm border border-gray-300 ${
                                    col.editable === false ? 'bg-gray-50' : ''
                                  }`}
                                >
                                  {formatCellValueForDisplay(row[col.name], col.type)}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="p-6 border-t flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Total Rows: <strong>{formatTemplateData.length}</strong> | Total Columns: <strong>{viewingFormatColumns.length}</strong>
                </div>
                <button
                  onClick={() => {
                    setViewingFormatId(null);
                    setFormatTemplateData([]);
                    setViewingFormatColumns([]);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

