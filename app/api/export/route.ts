import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import connectDB from '@/lib/mongodb';
import Employee from '@/models/Employee';

export async function GET() {
  try {
    await connectDB();

    const employees = await Employee.find().lean();

    // Transform data for Excel export
    const exportData = employees.flatMap((emp) => {
      if (emp.attendance && emp.attendance.length > 0) {
        return emp.attendance.map((att: any) => ({
          employee_id: emp.employee_id,
          name: emp.name,
          role: emp.role,
          date: att.date,
          time_in: att.time_in,
          status: att.status,
        }));
      } else {
        return [{
          employee_id: emp.employee_id,
          name: emp.name,
          role: emp.role,
          date: '',
          time_in: '',
          status: '',
        }];
      }
    });

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Merged Data');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="merged_data_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export data' },
      { status: 500 }
    );
  }
}

