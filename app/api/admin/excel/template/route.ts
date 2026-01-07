import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import * as XLSX from 'xlsx';

/**
 * GET /api/admin/excel/template
 * Downloads Excel template based on labour type
 */
async function handleGetTemplate(req: AuthenticatedRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const labourType = searchParams.get('type') || 'OUR_LABOUR';

    let headers: string[] = [];
    let sampleData: any[] = [];

    switch (labourType) {
      case 'OUR_LABOUR':
        headers = ['Employee ID', 'Name', 'Site', 'Site Type', 'Role', 'Department', 'Active'];
        sampleData = [
          {
            'Employee ID': 'EMP001',
            'Name': 'John Doe',
            'Site': 'Site A',
            'Site Type': 'MEP',
            'Role': 'Engineer',
            'Department': 'Engineering',
            'Active': 'Yes'
          }
        ];
        break;

      case 'SUPPLY_LABOUR':
        headers = ['Employee ID', 'Name', 'Trade', 'Company Name', 'Status'];
        sampleData = [
          {
            'Employee ID': 'SL001',
            'Name': 'Ahmed Ali',
            'Trade': 'Electrician',
            'Company Name': 'ABC Supply Co.',
            'Status': 'Present'
          }
        ];
        break;

      case 'SUBCONTRACTOR':
        headers = ['Company Name', 'Trade', 'Scope of Work', 'Employees Present'];
        sampleData = [
          {
            'Company Name': 'XYZ Contractors',
            'Trade': 'Civil Works',
            'Scope of Work': 'Foundation & Structure',
            'Employees Present': 25
          }
        ];
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid labour type' },
          { status: 400 }
        );
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    
    // Set column widths
    const colWidths = headers.map(() => ({ wch: 20 }));
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="employee_template_${labourType.toLowerCase()}.xlsx"`,
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

export const GET = withAuth(handleGetTemplate);
