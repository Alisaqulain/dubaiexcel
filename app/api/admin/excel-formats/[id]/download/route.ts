import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import * as XLSX from 'xlsx';

type Column = {
  name: string;
  type: 'text' | 'number' | 'date' | 'email' | 'dropdown';
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
  order: number;
};

/**
 * GET /api/admin/excel-formats/:id/download
 * Download Excel template for a specific format
 */
async function handleDownloadFormatTemplate(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const format = await ExcelFormat.findById(params.id).lean();

    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    // Create workbook - ONLY column headers and one dummy row, NO metadata
    const workbook = XLSX.utils.book_new();

    // Get sorted columns - ONLY the format columns, nothing else
    const sortedColumns = format.columns
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order);

    // Create headers row - ONLY column names from format
    const headers = sortedColumns.map((col: { name: string }) => col.name);

    // Create one dummy row with example data based on column type
    const dummyRow = sortedColumns.map((col: { type: string; validation?: { min?: number; options?: string[] } }) => {
      switch (col.type) {
        case 'number':
          return col.validation?.min || 0;
        case 'date':
          return '2024-01-01';
        case 'email':
          return 'example@email.com';
        case 'dropdown':
          return col.validation?.options?.[0] || 'Example';
        default:
          return 'Example';
      }
    });

    // Create worksheet with ONLY headers and one dummy row - NO other data
    const data = [headers, dummyRow];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Set column widths
    const colWidths = headers.map(() => ({ wch: 20 }));
    worksheet['!cols'] = colWidths;
    
    // Add only this one sheet - no other sheets
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = `${format.name.replace(/[^a-z0-9]/gi, '_')}_template.xlsx`;

    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Download format template error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download format template' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleDownloadFormatTemplate(authReq, context);
  });
  return handler(req);
}
