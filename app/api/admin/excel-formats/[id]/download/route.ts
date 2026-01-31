import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import * as XLSX from 'xlsx';

type Column = {
  name: string;
  type: 'text' | 'number' | 'date' | 'email' | 'dropdown';
  required: boolean;
  editable?: boolean;
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

    // Get template data if exists
    const templateData = await FormatTemplateData.findOne({ formatId: format._id }).lean();
    
    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Get sorted columns
    const sortedColumns = (format.columns as Column[])
      .sort((a, b) => a.order - b.order);

    // Create headers row
    const headers = sortedColumns.map((col) => col.name);

    // Create data rows - include ALL data from template
    let dataRows: any[][] = [];
    
    if (templateData && templateData.rows && templateData.rows.length > 0) {
      // Include all rows with all data (both editable and read-only columns)
      dataRows = templateData.rows.map((row: Record<string, any>) => {
        return sortedColumns.map((col) => {
          // Include all data from template, regardless of editable status
          return row[col.name] !== undefined && row[col.name] !== null ? String(row[col.name]) : '';
        });
      });
    } else {
      // No template data - create one empty row
      dataRows = [sortedColumns.map(() => '')];
    }

    // Create worksheet with headers and data rows
    const data = [headers, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Protect locked columns (make them read-only in Excel)
    // Note: XLSX doesn't support cell protection directly, but we can add comments/formatting
    // For actual protection, users would need to set it in Excel after download
    
    // Set column widths - auto-size based on content
    const colWidths = headers.map((header, idx) => {
      // Calculate width based on header length
      let maxWidth = Math.max(header.length, 15);
      
      // Check data rows for this column to find max content length
      if (dataRows.length > 0) {
        dataRows.forEach(row => {
          const cellValue = row[idx] ? String(row[idx]) : '';
          maxWidth = Math.max(maxWidth, Math.min(cellValue.length, 50)); // Cap at 50 chars
        });
      }
      
      return { wch: Math.min(maxWidth + 2, 50) }; // Add padding, max 50
    });
    worksheet['!cols'] = colWidths;
    
    // Add sheet
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
