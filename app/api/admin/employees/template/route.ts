import { NextRequest, NextResponse } from 'next/server';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelJS from 'exceljs';

async function handleDownloadTemplate(req: AuthenticatedRequest) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Employee Template');

    // Define columns with headers
    worksheet.columns = [
      { header: 'Employee ID', key: 'empId', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Site', key: 'site', width: 20 },
      { header: 'Site Type', key: 'siteType', width: 15 },
      { header: 'Role', key: 'role', width: 20 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Password', key: 'password', width: 20 },
      { header: 'Active', key: 'active', width: 10 },
      { header: 'Labour Type', key: 'labourType', width: 15 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add example row with instructions
    worksheet.addRow({
      empId: 'EMP001',
      name: 'John Doe',
      site: 'Business Bay',
      siteType: 'HEAD_OFFICE',
      role: 'Manager',
      department: 'Operations',
      password: 'Employee@123',
      active: 'Yes',
      labourType: 'OUR_LABOUR',
    });

    // Add instructions row
    const instructionRow = worksheet.addRow([
      'INSTRUCTIONS:',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    instructionRow.font = { bold: true, italic: true };
    instructionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE699' },
    };

    worksheet.addRow([
      'Site Type Options:',
      'HEAD_OFFICE, MEP, CIVIL, OTHER, OUTSOURCED, SUPPORT',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    worksheet.addRow([
      'Labour Type Options:',
      'OUR_LABOUR, SUPPLY_LABOUR, SUBCONTRACTOR',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    worksheet.addRow([
      'Active Options:',
      'Yes, No (default: Yes)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    worksheet.addRow([
      'Password:',
      'Required field. Will be hashed automatically.',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);

    // Set column widths and alignment
    worksheet.columns.forEach((column) => {
      if (column.key) {
        const col = worksheet.getColumn(column.key);
        col.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="employee_template.xlsx"',
      },
    });
  } catch (error: any) {
    console.error('Template generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate template' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleDownloadTemplate);

