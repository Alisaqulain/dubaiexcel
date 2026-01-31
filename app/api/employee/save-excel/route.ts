import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import User from '@/models/User';
import Employee from '@/models/Employee';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

/**
 * POST /api/employee/save-excel
 * Save an Excel file created by the user
 */
async function handleSaveExcel(req: AuthenticatedRequest) {
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

    // Get user/employee info based on role
    let userName: string | undefined;
    let userEmail: string | undefined;

    if (userRole === 'employee') {
      // If it's an employee, look up in Employee collection
      const employee = await Employee.findById(userId).lean();
      if (!employee) {
        return NextResponse.json(
          { error: 'Employee not found' },
          { status: 404 }
        );
      }
      userName = (employee as any).name;
      userEmail = (employee as any).empId;
    } else {
      // If it's a regular user, look up in User collection
      const user = await User.findById(userId).lean();
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
      userName = (user as any).name || (user as any).email;
      userEmail = (user as any).email;
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const labourType = formData.get('labourType') as string;
    const rowCount = parseInt(formData.get('rowCount') as string) || 0;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    if (!labourType || !['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'].includes(labourType)) {
      return NextResponse.json(
        { error: 'Valid labour type is required' },
        { status: 400 }
      );
    }

    // Validate format - Get assigned format
    const userIdObj = new mongoose.Types.ObjectId(userId as string);
    let assignedFormat = null;

    if (userRole === 'employee') {
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
      return NextResponse.json(
        { error: 'No format assigned to you. Please contact administrator to assign a format before saving files.' },
        { status: 403 }
      );
    }

    // Validate file against assigned format
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 });

    if (jsonData.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty' },
        { status: 400 }
      );
    }

    const headers = (jsonData[0] as any[]) || [];
    const formatColumns = (assignedFormat as any).columns.sort((a: any, b: any) => a.order - b.order);
    const requiredColumns = formatColumns.filter((col: any) => col.required).map((col: any) => col.name);
    const formatColumnNames = formatColumns.map((col: any) => col.name);

    // Check for missing required columns
    const missingColumns = requiredColumns.filter((colName: string) => !headers.includes(colName));
    if (missingColumns.length > 0) {
      return NextResponse.json({
        error: `Format validation failed. Missing required columns: ${missingColumns.join(', ')}`,
        validationError: true,
        missingColumns,
        formatColumns: formatColumnNames,
        example: formatColumns.map((col: any) => ({
          name: col.name,
          required: col.required,
          type: col.type,
        })),
      }, { status: 400 });
    }

    // Check for extra columns (warning but allow)
    const extraColumns = headers.filter((header: string) => header && !formatColumnNames.includes(header));
    if (extraColumns.length > 0) {
      // Allow but warn
      console.warn(`Extra columns found: ${extraColumns.join(', ')}`);
    }

    // Validate locked columns - check if user tried to edit locked columns
    const templateData = await FormatTemplateData.findOne({ formatId: assignedFormat._id }).lean();
    const lockedColumns = formatColumns.filter((col: any) => col.editable === false);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (lockedColumns.length > 0 && templateData && templateData.rows && templateData.rows.length > 0) {
      // Check each row against template data
      const dataRows = jsonData.slice(1); // Skip header row
      
      for (let rowIndex = 0; rowIndex < Math.min(dataRows.length, templateData.rows.length); rowIndex++) {
        const userRow = dataRows[rowIndex] as any[];
        const templateRow = templateData.rows[rowIndex] as Record<string, any>;
        
        if (!userRow || !templateRow) continue;

        lockedColumns.forEach((col: any) => {
          const colIndex = headers.indexOf(col.name);
          if (colIndex === -1) return;

          const userValue = userRow[colIndex] !== undefined ? String(userRow[colIndex] || '').trim() : '';
          const templateValue = templateRow[col.name] ? String(templateRow[col.name]).trim() : '';

          // If locked column was modified
          if (userValue !== templateValue && templateValue !== '') {
            errors.push(`Row ${rowIndex + 2}: Column "${col.name}" is locked and cannot be edited. Expected: "${templateValue}", Found: "${userValue}"`);
          }
        });
      }
    }

    // If locked columns were edited, reject the file
    if (errors.length > 0) {
      return NextResponse.json({
        error: 'Locked columns cannot be edited',
        validationError: true,
        lockedColumnErrors: errors,
        message: `You cannot edit locked columns. ${errors.length} error(s) found.`,
      }, { status: 400 });
    }

    // File is validated, convert to buffer (reuse arrayBuffer from above)
    const buffer = Buffer.from(arrayBuffer);

    // Check if this is an update (PUT request with fileId)
    const fileId = formData.get('fileId') as string;
    
    if (fileId && req.method === 'PUT') {
      // Update existing file
      const existingFile = await CreatedExcelFile.findById(fileId);
      
      if (!existingFile) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }

      // Verify the file belongs to this user
      if (existingFile.createdBy.toString() !== userId) {
        return NextResponse.json(
          { error: 'Unauthorized: You can only edit your own files' },
          { status: 403 }
        );
      }

      // Update the file
      existingFile.originalFilename = file.name;
      existingFile.fileData = buffer;
      existingFile.rowCount = rowCount;
      await existingFile.save();

      return NextResponse.json({
        success: true,
        message: 'Excel file updated successfully',
        data: {
          id: existingFile._id,
          filename: existingFile.originalFilename,
          labourType: existingFile.labourType,
          rowCount: existingFile.rowCount,
          createdAt: existingFile.createdAt,
          updatedAt: existingFile.updatedAt,
        },
      });
    } else {
      // Create new file
      const createdFile = await CreatedExcelFile.create({
        filename: `excel_${Date.now()}_${file.name}`,
        originalFilename: file.name,
        fileData: buffer,
        labourType: labourType as 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR',
        rowCount,
        createdBy: userId,
        createdByName: userName,
        createdByEmail: userEmail,
      });

      return NextResponse.json({
        success: true,
        message: 'Excel file saved successfully',
        data: {
          id: createdFile._id,
          filename: createdFile.originalFilename,
          labourType: createdFile.labourType,
          rowCount: createdFile.rowCount,
          createdAt: createdFile.createdAt,
        },
      });
    }
  } catch (error: any) {
    console.error('Save Excel error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save Excel file' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleSaveExcel);
export const PUT = withAuth(handleSaveExcel);

