import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import * as XLSX from 'xlsx';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';

/**
 * POST /api/admin/excel-formats/dummy-data
 * Upload dummy data Excel file and create Excel format only (no data insertion)
 * All columns are set as 'text' type
 */
async function handleUploadDummyData(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const formatName = formData.get('formatName') as string;
    const formatDescription = formData.get('formatDescription') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!formatName || formatName.trim() === '') {
      return NextResponse.json(
        { error: 'Format name is required' },
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
    
    // Try multiple methods to get headers
    let headers: string[] = [];
    
    // Method 1: Read as array with header: 1
    const allData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
    
    if (allData.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty' },
        { status: 400 }
      );
    }

    // Try to find header row (first non-empty row)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, allData.length); i++) {
      const row = allData[i] as any[];
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (nonEmptyCells.length > 3) { // At least 3 non-empty cells suggests it's a header row
        headerRowIndex = i;
        break;
      }
    }

    // Get headers from the identified header row
    const headerRow = allData[headerRowIndex] as any[];
    headers = headerRow.map((h: any) => {
      const str = String(h || '').trim();
      // Handle empty cells - try to get from cell reference
      if (!str && headerRowIndex === 0) {
        // Try to read from worksheet directly
        const colIndex = headerRow.indexOf(h);
        if (colIndex >= 0) {
          const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex });
          const cell = worksheet[cellRef];
          if (cell && cell.v) {
            return String(cell.v).trim();
          }
        }
      }
      return str;
    }).filter(h => h !== ''); // Remove empty headers

    // If headers are still empty, try reading from worksheet range
    if (headers.length === 0 || headers.every(h => h === '')) {
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:Z1');
      headers = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: C });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          headers.push(String(cell.v).trim());
        } else {
          headers.push('');
        }
      }
      headers = headers.filter(h => h !== '');
    }

    // If still no headers, try reading as JSON with header row
    if (headers.length === 0 || headers.every(h => h === '')) {
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
      if (jsonData.length > 0) {
        headers = Object.keys(jsonData[0] as any);
      }
    }

    // Final check - if headers are still empty, return error
    if (headers.length === 0 || headers.every(h => h === '')) {
      return NextResponse.json(
        { 
          error: 'Could not read headers from Excel file. Please ensure the first row contains column names.',
          debug: {
            headerRowIndex,
            firstRow: allData[0],
            firstRowLength: allData[0]?.length,
            worksheetRange: worksheet['!ref']
          }
        },
        { status: 400 }
      );
    }

    // Get data rows (not needed for type detection, but kept for reference)
    const dataStartIndex = headerRowIndex + 1;
    const dataRows = allData.slice(dataStartIndex);

    // Create format columns - all as text type, all editable by default
    const formatColumns = headers.map((header, index) => {
      // Determine if required based on header name
      const headerLower = header.toLowerCase();
      const required = headerLower.includes('emp id') || 
                       headerLower.includes('employee id') || 
                       headerLower.includes('name') ||
                       headerLower.includes('employee name');

      return {
        name: header,
        type: 'text' as const, // All columns as text type
        required: required,
        editable: true, // Default to editable (admin can change later)
        validation: undefined,
        order: index,
      };
    });

    // Parse all data rows into objects
    const templateRows: Record<string, any>[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] as any[];
      if (!row || row.length === 0) continue;

      // Create row object with all column values
      const rowData: Record<string, any> = {};
      headers.forEach((header, idx) => {
        rowData[header] = row[idx] !== undefined ? String(row[idx] || '').trim() : '';
      });

      // Skip empty rows (all values empty)
      const hasData = Object.values(rowData).some(val => val !== '');
      if (hasData) {
        templateRows.push(rowData);
      }
    }

    // Create Excel Format
    const excelFormat = await ExcelFormat.create({
      name: formatName.trim(),
      description: formatDescription?.trim() || `Format created from dummy data upload on ${new Date().toLocaleString()}`,
      columns: formatColumns,
      assignedToType: 'all',
      assignedTo: [],
      createdBy: req.user?.userId,
      active: true,
    });

    // Save all template rows
    await FormatTemplateData.findOneAndUpdate(
      { formatId: excelFormat._id },
      {
        formatId: excelFormat._id,
        rows: templateRows,
        uploadedBy: req.user?.userId,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      data: {
        format: {
          id: excelFormat._id,
          name: excelFormat.name,
          description: excelFormat.description,
          columnsCount: formatColumns.length,
          columns: formatColumns,
        },
        headers: headers,
        totalRows: dataRows.length,
        savedRows: templateRows.length,
      },
      message: `Successfully created Excel format "${formatName}" with ${formatColumns.length} columns and ${templateRows.length} data rows.`,
    });
  } catch (error: any) {
    console.error('Upload dummy data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process dummy data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleUploadDummyData(authReq);
  });
  return handler(req);
}
