import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import * as XLSX from 'xlsx';

interface FormatColumn {
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
}

/**
 * POST /api/admin/excel-formats/:id/upload
 * Upload and validate Excel file against a format
 */
async function handleUploadFormatFile(
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

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

    if (jsonData.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          isValid: false,
          errors: ['Excel file is empty'],
          rowCount: 0,
          validRows: 0,
        },
      });
    }

    // Sort format columns by order
    const formatColumns = (format.columns as FormatColumn[]).sort((a, b) => a.order - b.order);
    const columnNames = formatColumns.map((col) => col.name);

    // Get headers from first row
    const firstRow: any = jsonData[0];
    const fileHeaders = Object.keys(firstRow);

    // Validate headers match format
    const errors: string[] = [];
    const missingColumns: string[] = [];
    const extraColumns: string[] = [];

    formatColumns.forEach((formatCol) => {
      if (formatCol.required) {
        const found = fileHeaders.some(header => 
          header.toLowerCase().trim() === formatCol.name.toLowerCase().trim()
        );
        if (!found) {
          missingColumns.push(formatCol.name);
        }
      }
    });

    if (missingColumns.length > 0) {
      errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // Validate each row
    let validRows = 0;
    jsonData.forEach((row: any, index: number) => {
      let rowValid = true;
      const rowErrors: string[] = [];

      formatColumns.forEach((formatCol) => {
        const headerKey = fileHeaders.find(h => 
          h.toLowerCase().trim() === formatCol.name.toLowerCase().trim()
        );
        const value = headerKey ? String(row[headerKey] || '').trim() : '';

        // Check required
        if (formatCol.required && !value) {
          rowValid = false;
          rowErrors.push(`Row ${index + 2}: ${formatCol.name} is required`);
        }

        // Validate type
        if (value) {
          if (formatCol.type === 'number') {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
              rowValid = false;
              rowErrors.push(`Row ${index + 2}: ${formatCol.name} must be a number`);
            } else {
              if (formatCol.validation?.min !== undefined && numValue < formatCol.validation.min) {
                rowValid = false;
                rowErrors.push(`Row ${index + 2}: ${formatCol.name} must be >= ${formatCol.validation.min}`);
              }
              if (formatCol.validation?.max !== undefined && numValue > formatCol.validation.max) {
                rowValid = false;
                rowErrors.push(`Row ${index + 2}: ${formatCol.name} must be <= ${formatCol.validation.max}`);
              }
            }
          } else if (formatCol.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              rowValid = false;
              rowErrors.push(`Row ${index + 2}: ${formatCol.name} must be a valid email`);
            }
          } else if (formatCol.type === 'date') {
            const dateValue = new Date(value);
            if (isNaN(dateValue.getTime())) {
              rowValid = false;
              rowErrors.push(`Row ${index + 2}: ${formatCol.name} must be a valid date`);
            }
          } else if (formatCol.type === 'dropdown') {
            if (formatCol.validation?.options && formatCol.validation.options.length > 0) {
              if (!formatCol.validation.options.includes(value)) {
                rowValid = false;
                rowErrors.push(`Row ${index + 2}: ${formatCol.name} must be one of: ${formatCol.validation.options.join(', ')}`);
              }
            }
          }
        }
      });

      if (rowValid) {
        validRows++;
      } else {
        errors.push(...rowErrors);
      }
    });

    const isValid = errors.length === 0 && missingColumns.length === 0;

    return NextResponse.json({
      success: true,
      data: {
        isValid,
        errors: errors.slice(0, 50), // Limit to 50 errors
        rowCount: jsonData.length,
        validRows,
        invalidRows: jsonData.length - validRows,
      },
    });
  } catch (error: any) {
    console.error('Upload format file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to validate file' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleUploadFormatFile(authReq, context);
  });
  return handler(req);
}
