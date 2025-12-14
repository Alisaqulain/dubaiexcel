import * as XLSX from 'xlsx';
import { AttendanceRow } from './validation';

export interface ColumnMapping {
  empId?: string;
  name?: string;
  role?: string;
  site?: string;
  date?: string;
  time?: string;
  status?: string;
}

// Common column name variations
const COLUMN_VARIANTS: Record<string, string[]> = {
  empId: ['empid', 'employee id', 'employee_id', 'emp id', 'emp_id', 'id', 'employeeid'],
  name: ['name', 'employee name', 'emp name', 'full name', 'employee_name'],
  role: ['role', 'designation', 'position', 'job title', 'job_title'],
  site: ['site', 'location', 'project', 'camp', 'worksite'],
  date: ['date', 'attendance date', 'att_date', 'attendance_date'],
  time: ['time', 'time in', 'time_in', 'check in', 'check_in', 'timein'],
  status: ['status', 'attendance', 'attendance status', 'present/absent', 'present_absent'],
};

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  Object.entries(COLUMN_VARIANTS).forEach(([key, variants]) => {
    const foundIndex = lowerHeaders.findIndex(h => 
      variants.some(v => h.includes(v) || v.includes(h))
    );
    if (foundIndex !== -1) {
      mapping[key as keyof ColumnMapping] = headers[foundIndex];
    }
  });

  return mapping;
}

export function parseExcelFile(buffer: Buffer, mapping?: ColumnMapping): AttendanceRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  if (jsonData.length < 2) {
    throw new Error('Excel file must have at least a header row and one data row');
  }

  // First row is headers
  const headers = (jsonData[0] as string[]).map(h => String(h).trim());
  
  // Auto-detect mapping if not provided
  const columnMapping = mapping || detectColumnMapping(headers);

  // Parse data rows
  const rows: AttendanceRow[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as any[];
    if (!row || row.length === 0) continue;

    const attendanceRow: AttendanceRow & { raw: Record<string, any> } = {
      raw: {},
    };

    // Map columns
    headers.forEach((header, index) => {
      const value = row[index];
      attendanceRow.raw[header] = value;

      // Apply mapping
      Object.entries(columnMapping).forEach(([key, mappedHeader]) => {
        if (mappedHeader === header && value !== undefined && value !== null && value !== '') {
          attendanceRow[key as keyof AttendanceRow] = String(value).trim();
        }
      });
    });

    // Only add row if it has at least empId or name
    if (attendanceRow.empId || attendanceRow.name) {
      rows.push(attendanceRow);
    }
  }

  return rows;
}

export function parseMultipleFiles(files: Array<{ buffer: Buffer; filename: string }>, mapping?: ColumnMapping): Array<{ filename: string; rows: AttendanceRow[] }> {
  return files.map(file => ({
    filename: file.filename,
    rows: parseExcelFile(file.buffer, mapping),
  }));
}

