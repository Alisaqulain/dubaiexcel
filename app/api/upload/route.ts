import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import connectDB from '@/lib/mongodb';
import Employee from '@/models/Employee';

// Accepted roles
const ACCEPTED_ROLES = ['admin', 'e1', 'civil', '10'];

interface ExcelRow {
  [key: string]: any;
}

interface ValidationError {
  file: string;
  errors: string[];
}

interface ProcessedData {
  employee_id: string;
  name: string;
  role: string;
  date?: string;
  time_in?: string;
  status?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const mainFile = formData.get('mainFile') as File | null;
    const e1File = formData.get('e1File') as File | null;

    if (!mainFile && !e1File) {
      return NextResponse.json(
        { error: 'At least one Excel file is required' },
        { status: 400 }
      );
    }

    const validationErrors: ValidationError[] = [];
    const processedData: ProcessedData[] = [];

    // Process Main Excel
    if (mainFile) {
      const mainBuffer = await mainFile.arrayBuffer();
      const mainWorkbook = XLSX.read(mainBuffer, { type: 'buffer' });
      const mainSheetName = mainWorkbook.SheetNames[0];
      const mainSheet = mainWorkbook.Sheets[mainSheetName];
      const mainData: ExcelRow[] = XLSX.utils.sheet_to_json(mainSheet);

      // Validate Main Excel
      const mainErrors: string[] = [];
      const requiredColumns = ['employee_id', 'name', 'role'];

      if (mainData.length === 0) {
        mainErrors.push('Main Excel file is empty');
      } else {
        const firstRow = mainData[0];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));

        if (missingColumns.length > 0) {
          mainErrors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        // Validate each row
        mainData.forEach((row, index) => {
          const rowNum = index + 2; // +2 because Excel rows start at 1 and we skip header

          if (!row.employee_id) {
            mainErrors.push(`Row ${rowNum}: Missing employee_id`);
          }

          if (!row.name) {
            mainErrors.push(`Row ${rowNum}: Missing name`);
          }

          if (!row.role) {
            mainErrors.push(`Row ${rowNum}: Missing role`);
          } else if (!ACCEPTED_ROLES.includes(String(row.role).toLowerCase())) {
            mainErrors.push(`Row ${rowNum}: Invalid role "${row.role}". Accepted roles: ${ACCEPTED_ROLES.join(', ')}`);
          }
        });
      }

      if (mainErrors.length > 0) {
        validationErrors.push({
          file: mainFile.name,
          errors: mainErrors,
        });
      } else {
        // Process valid main data
        mainData.forEach((row) => {
          processedData.push({
            employee_id: String(row.employee_id),
            name: String(row.name),
            role: String(row.role).toLowerCase(),
          });
        });
      }
    }

    // Process E1 Excel (Attendance)
    if (e1File) {
      const e1Buffer = await e1File.arrayBuffer();
      const e1Workbook = XLSX.read(e1Buffer, { type: 'buffer' });
      const e1SheetName = e1Workbook.SheetNames[0];
      const e1Sheet = e1Workbook.Sheets[e1SheetName];
      const e1Data: ExcelRow[] = XLSX.utils.sheet_to_json(e1Sheet);

      // Validate E1 Excel
      const e1Errors: string[] = [];
      const requiredColumns = ['employee_id', 'date', 'time_in', 'status'];

      if (e1Data.length === 0) {
        e1Errors.push('E1 Excel file is empty');
      } else {
        const firstRow = e1Data[0];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));

        if (missingColumns.length > 0) {
          e1Errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        // Validate each row
        e1Data.forEach((row, index) => {
          const rowNum = index + 2;

          if (!row.employee_id) {
            e1Errors.push(`Row ${rowNum}: Missing employee_id`);
          }

          if (!row.date) {
            e1Errors.push(`Row ${rowNum}: Missing date`);
          }

          if (!row.time_in) {
            e1Errors.push(`Row ${rowNum}: Missing time_in`);
          }

          if (!row.status) {
            e1Errors.push(`Row ${rowNum}: Missing status`);
          } else {
            const status = String(row.status).toLowerCase();
            if (status !== 'present' && status !== 'absent') {
              e1Errors.push(`Row ${rowNum}: Invalid status "${row.status}". Must be "Present" or "Absent"`);
            }
          }
        });
      }

      if (e1Errors.length > 0) {
        validationErrors.push({
          file: e1File.name,
          errors: e1Errors,
        });
      } else {
        // Merge attendance data with main data
        e1Data.forEach((row) => {
          const employeeId = String(row.employee_id);
          const existingEmployee = processedData.find(emp => emp.employee_id === employeeId);

          if (existingEmployee) {
            // Add attendance to existing employee (will be grouped later)
            processedData.push({
              employee_id: employeeId,
              name: existingEmployee.name,
              role: existingEmployee.role,
              date: String(row.date),
              time_in: String(row.time_in),
              status: String(row.status),
            });
          } else {
            // Create new entry if employee not in main file
            processedData.push({
              employee_id: employeeId,
              name: String(row.name || 'Unknown'),
              role: String(row.role || 'e1').toLowerCase(),
              date: String(row.date),
              time_in: String(row.time_in),
              status: String(row.status),
            });
          }
        });
      }
    }

    // If validation errors exist, return them
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          validationErrors,
        },
        { status: 400 }
      );
    }

    // Connect to MongoDB and save data
    await connectDB();

    // Group attendance by employee_id
    const employeeMap = new Map<string, {
      employee_id: string;
      name: string;
      role: string;
      attendance: Array<{ date: string; time_in: string; status: string }>;
    }>();

    processedData.forEach((data) => {
      const empId = data.employee_id;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employee_id: data.employee_id,
          name: data.name,
          role: data.role,
          attendance: [],
        });
      }

      const employee = employeeMap.get(empId)!;

      // Only add attendance if date, time_in, and status are present
      if (data.date && data.time_in && data.status) {
        // Check if this attendance record already exists (avoid duplicates)
        const exists = employee.attendance.some(
          (att) => att.date === data.date && att.time_in === data.time_in
        );
        if (!exists) {
          employee.attendance.push({
            date: data.date,
            time_in: data.time_in,
            status: data.status,
          });
        }
      }
    });

    // Save to MongoDB
    const savedEmployees = [];
    const entries = Array.from(employeeMap.entries());
    for (const [empId, employee] of entries) {
      const saved = await Employee.findOneAndUpdate(
        { employee_id: empId },
        {
          employee_id: employee.employee_id,
          name: employee.name,
          role: employee.role,
          $push: { attendance: { $each: employee.attendance } },
        },
        { upsert: true, new: true }
      );
      savedEmployees.push(saved);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed and saved ${savedEmployees.length} employees`,
      count: savedEmployees.length,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process Excel files' },
      { status: 500 }
    );
  }
}

