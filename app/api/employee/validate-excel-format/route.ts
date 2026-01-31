import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import Employee from '@/models/Employee';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

/**
 * POST /api/employee/validate-excel-format
 * Validate an Excel file against the assigned format
 */
async function handleValidateExcelFormat(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get assigned format for the user/employee
    let assignedFormat = null;
    const userIdObj = new mongoose.Types.ObjectId(userId as string);

    if (userRole === 'employee') {
      // For employees, check if format is assigned to them
      assignedFormat = await ExcelFormat.findOne({
        active: true,
        $or: [
          { assignedToType: 'all' },
          {
            assignedToType: 'employee',
            assignedTo: userIdObj,
          },
        ],
      }).lean();
    } else {
      // For users, check user assignments
      assignedFormat = await ExcelFormat.findOne({
        active: true,
        $or: [
          { assignedToType: 'all' },
          {
            assignedToType: 'user',
            assignedTo: userIdObj,
          },
        ],
      }).lean();
    }

    if (!assignedFormat) {
      return NextResponse.json({
        success: false,
        error: 'No format assigned to you. Please contact administrator.',
        hasFormat: false,
      });
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 });

    if (jsonData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Excel file is empty',
        hasFormat: true,
        format: assignedFormat,
      });
    }

    // Get headers (first row)
    const headers = (jsonData[0] as any[]) || [];
    const formatColumns = (assignedFormat as any).columns.sort((a: any, b: any) => a.order - b.order);
    const requiredColumns = formatColumns.filter((col: any) => col.required).map((col: any) => col.name);
    const formatColumnNames = formatColumns.map((col: any) => col.name);

    // Validation errors
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingColumns: string[] = [];
    const extraColumns: string[] = [];

    // Check for missing required columns
    requiredColumns.forEach((colName: string) => {
      if (!headers.includes(colName)) {
        missingColumns.push(colName);
        errors.push(`Missing required column: "${colName}"`);
      }
    });

    // Check for extra columns (not in format)
    headers.forEach((header: string) => {
      if (header && !formatColumnNames.includes(header)) {
        extraColumns.push(header);
        warnings.push(`Extra column found: "${header}" (not in assigned format)`);
      }
    });

    // Check column order (warning only)
    formatColumns.forEach((formatCol: any, index: number) => {
      const headerIndex = headers.indexOf(formatCol.name);
      if (headerIndex !== -1 && headerIndex !== index) {
        warnings.push(`Column "${formatCol.name}" is at position ${headerIndex + 1}, expected at position ${index + 1}`);
      }
    });

    // Validate data rows
    const dataRows = jsonData.slice(1) as any[][];
    const dataErrors: string[] = [];

    dataRows.forEach((row: any[], rowIndex: number) => {
      formatColumns.forEach((formatCol: any) => {
        const colIndex = headers.indexOf(formatCol.name);
        if (colIndex !== -1) {
          const cellValue = row[colIndex];
          
          // Check required fields
          if (formatCol.required && (!cellValue || String(cellValue).trim() === '')) {
            dataErrors.push(`Row ${rowIndex + 2}: "${formatCol.name}" is required but empty`);
          }

          // Type validation
          if (cellValue && String(cellValue).trim() !== '') {
            if (formatCol.type === 'number' && isNaN(Number(cellValue))) {
              dataErrors.push(`Row ${rowIndex + 2}: "${formatCol.name}" must be a number, got "${cellValue}"`);
            }
            if (formatCol.type === 'email' && !String(cellValue).includes('@')) {
              dataErrors.push(`Row ${rowIndex + 2}: "${formatCol.name}" must be a valid email, got "${cellValue}"`);
            }
            if (formatCol.validation?.options && !formatCol.validation.options.includes(String(cellValue))) {
              dataErrors.push(`Row ${rowIndex + 2}: "${formatCol.name}" must be one of: ${formatCol.validation.options.join(', ')}, got "${cellValue}"`);
            }
            if (formatCol.validation?.min && Number(cellValue) < formatCol.validation.min) {
              dataErrors.push(`Row ${rowIndex + 2}: "${formatCol.name}" must be >= ${formatCol.validation.min}, got "${cellValue}"`);
            }
            if (formatCol.validation?.max && Number(cellValue) > formatCol.validation.max) {
              dataErrors.push(`Row ${rowIndex + 2}: "${formatCol.name}" must be <= ${formatCol.validation.max}, got "${cellValue}"`);
            }
          }
        }
      });
    });

    // Combine all errors
    const allErrors = [...errors, ...dataErrors];

    // Create example format
    const exampleRow: any = {};
    formatColumns.forEach((col: any) => {
      if (col.type === 'number') {
        exampleRow[col.name] = col.validation?.min || 0;
      } else if (col.type === 'date') {
        exampleRow[col.name] = '2024-01-01';
      } else if (col.type === 'email') {
        exampleRow[col.name] = 'example@email.com';
      } else if (col.validation?.options && col.validation.options.length > 0) {
        exampleRow[col.name] = col.validation.options[0];
      } else {
        exampleRow[col.name] = `Example ${col.name}`;
      }
    });

    return NextResponse.json({
      success: allErrors.length === 0,
      hasFormat: true,
      format: assignedFormat,
      validation: {
        isValid: allErrors.length === 0,
        errors: allErrors,
        warnings: warnings,
        missingColumns,
        extraColumns,
        totalRows: dataRows.length,
        validRows: dataRows.length - dataErrors.length,
        invalidRows: dataErrors.length,
      },
      example: {
        columns: formatColumns.map((col: any) => col.name),
        sampleRow: exampleRow,
      },
    });
  } catch (error: any) {
    console.error('Validate Excel format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to validate Excel format' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleValidateExcelFormat);


















