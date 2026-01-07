import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import User from '@/models/User';
import Employee from '@/models/Employee';
import * as XLSX from 'xlsx';

/**
 * POST /api/admin/created-excel-files/merge
 * Merge multiple created Excel files into a single Excel file
 */
async function handleMergeExcelFiles(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'File IDs array is required' },
        { status: 400 }
      );
    }

    // Get all files (don't use lean() to preserve Buffer type)
    const files = await CreatedExcelFile.find({
      _id: { $in: fileIds }
    });

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files found to merge' },
        { status: 404 }
      );
    }

    // Create a new workbook
    const mergedWorkbook = XLSX.utils.book_new();
    const allRows: any[] = [];
    const headers = new Set<string>();

    // Process each file
    for (const file of files) {
      try {
        // Convert fileData to Buffer if needed
        const fileBuffer = Buffer.isBuffer(file.fileData) 
          ? file.fileData 
          : Buffer.from(file.fileData as any);
        
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        // Collect headers
        if (jsonData.length > 0) {
          Object.keys(jsonData[0] as any).forEach(key => headers.add(key));
        }

        // Add all rows
        allRows.push(...jsonData);
      } catch (err: any) {
        console.error(`Error processing file ${file._id}:`, err);
        // Continue with other files even if one fails
      }
    }

    if (allRows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in files to merge' },
        { status: 400 }
      );
    }

    // Create merged worksheet
    const mergedWorksheet = XLSX.utils.json_to_sheet(allRows);
    
    // Set column widths
    const colWidths = Array.from(headers).map(() => ({ wch: 20 }));
    mergedWorksheet['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(mergedWorkbook, mergedWorksheet, 'Merged Data');

    // Generate merged Excel file
    const excelBuffer = XLSX.write(mergedWorkbook, { type: 'array', bookType: 'xlsx' });
    const buffer = Buffer.from(excelBuffer);

    // Get user info for storing
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    let userName: string | undefined;
    let userEmail: string | undefined;

    if (userRole === 'employee') {
      const employee = await Employee.findById(userId).lean();
      if (employee) {
        userName = (employee as any).name;
        userEmail = (employee as any).empId;
      }
    } else {
      const user = await User.findById(userId).lean();
      if (user) {
        userName = (user as any).name || (user as any).email;
        userEmail = (user as any).email;
      }
    }

    // Save merged file to database
    const mergedFilename = `merged_excel_${new Date().toISOString().split('T')[0]}_${Date.now()}.xlsx`;
    const mergedFile = await CreatedExcelFile.create({
      filename: `merged_${Date.now()}_${mergedFilename}`,
      originalFilename: mergedFilename,
      fileData: buffer,
      labourType: files[0].labourType, // Use the first file's labour type
      rowCount: allRows.length,
      createdBy: userId,
      createdByName: userName,
      createdByEmail: userEmail,
      isMerged: true,
      mergedFrom: fileIds.map(id => id as any),
      mergedDate: new Date(),
    });

    // Return success response with file info and also trigger download
    return NextResponse.json({
      success: true,
      message: `Successfully merged ${files.length} files into one Excel file`,
      data: {
        id: mergedFile._id,
        filename: mergedFile.originalFilename,
        rowCount: mergedFile.rowCount,
        mergedDate: mergedFile.mergedDate,
      },
      downloadUrl: `/api/admin/created-excel-files/${mergedFile._id}/download`,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('Merge Excel files error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to merge Excel files' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleMergeExcelFiles);

