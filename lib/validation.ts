import Role from '@/models/Role';
import Employee from '@/models/Employee';
import AttendanceMaster from '@/models/AttendanceMaster';

export interface ValidationResult {
  status: 'OK' | 'ERROR' | 'WARNING';
  message: string;
}

export interface AttendanceRow {
  empId?: string;
  name?: string;
  role?: string;
  site?: string;
  date?: string;
  time?: string;
  status?: string;
}

export async function validateAttendanceRow(row: AttendanceRow): Promise<ValidationResult> {
  // Check mandatory fields
  if (!row.empId || row.empId.trim() === '') {
    return { status: 'ERROR', message: 'Employee ID is required' };
  }

  if (!row.date || row.date.trim() === '') {
    return { status: 'ERROR', message: 'Date is required' };
  }

  if (!row.status || row.status.trim() === '') {
    return { status: 'ERROR', message: 'Status is required' };
  }

  // Validate date format (accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY)
  const dateRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})$/;
  if (!dateRegex.test(row.date)) {
    return { status: 'WARNING', message: 'Date format may be invalid' };
  }

  // Validate time format if provided
  if (row.time && row.time.trim() !== '') {
    const timeRegex = /^(\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM))?)$/i;
    if (!timeRegex.test(row.time)) {
      return { status: 'WARNING', message: 'Time format may be invalid' };
    }
  }

  // Validate status
  const validStatuses = ['Present', 'Absent', 'Leave', 'Vacation', 'Sick Leave', 'Week Off', 'Visa Medical'];
  const normalizedStatus = row.status.trim();
  if (!validStatuses.some((s: string) => s.toLowerCase() === normalizedStatus.toLowerCase())) {
    return { status: 'WARNING', message: `Status '${row.status}' may not be standard` };
  }

  // Check if role exists (if role is provided)
  if (row.role) {
    const roleExists = await Role.findOne({ name: row.role.toUpperCase() });
    if (!roleExists) {
      return { status: 'WARNING', message: `Role '${row.role}' not found in roles table` };
    }

    // Check if status is allowed for this role
    if (roleExists.allowedStatuses.length > 0) {
      const isAllowed = roleExists.allowedStatuses.some(
        (s: string) => s.toLowerCase() === normalizedStatus.toLowerCase()
      );
      if (!isAllowed) {
        return { status: 'WARNING', message: `Status '${row.status}' may not be allowed for role '${row.role}'` };
      }
    }
  }

  // Check for duplicate (empId + date)
  const existing = await AttendanceMaster.findOne({
    empId: row.empId,
    date: row.date,
  });

  if (existing) {
    return { status: 'WARNING', message: 'Duplicate attendance record found (will be updated)' };
  }

  return { status: 'OK', message: 'Validation passed' };
}

export function normalizeDate(dateStr: string): string {
  // Convert various date formats to YYYY-MM-DD
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY or MM/DD/YYYY - assume DD/MM/YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // Already YYYY-MM-DD
        return dateStr;
      } else {
        // DD-MM-YYYY
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return dateStr;
}

export function normalizeTime(timeStr: string): string {
  if (!timeStr || timeStr.trim() === '') return '';
  // Remove extra spaces and normalize
  return timeStr.trim();
}

