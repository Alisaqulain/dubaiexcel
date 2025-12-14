import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFile from '@/models/ExcelFile';
import * as XLSX from 'xlsx';

async function handleMergeFiles(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { fileIds } = body; // Optional: specific file IDs to merge, or merge all active files

    // Get files to merge
    const query: any = { status: 'active' };
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      query.fileId = { $in: fileIds };
    }

    const files = await ExcelFile.find(query).lean();

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files found to merge' },
        { status: 400 }
      );
    }

    // Create a new workbook for merged data
    const mergedWorkbook = XLSX.utils.book_new();

    // Process each file
    for (const file of files) {
      if (!file.fileData) continue;

      try {
        // Read the Excel file
        const workbook = XLSX.read(file.fileData as Buffer, { type: 'buffer' });

        // Add each sheet from the file to merged workbook with file name prefix
        workbook.SheetNames.forEach((sheetName, index) => {
          const worksheet = workbook.Sheets[sheetName];
          // Use filename as sheet name prefix to avoid conflicts
          const safeFileName = file.filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\.xlsx?$/i, '');
          const newSheetName = `${safeFileName}_${sheetName}`.substring(0, 31); // Excel sheet name limit
          XLSX.utils.book_append_sheet(mergedWorkbook, worksheet, newSheetName);
        });
      } catch (error: any) {
        console.error(`Error processing file ${file.filename}:`, error);
        // Continue with other files
      }
    }

    // If no sheets were added, create a summary sheet
    if (mergedWorkbook.SheetNames.length === 0) {
      const summaryData = [
        ['File ID', 'Filename', 'File Type', 'File Size', 'Row Count', 'Uploaded At'],
        ...files.map((f: any) => [
          f.fileId,
          f.filename,
          f.fileType,
          f.fileSize,
          f.rowCount || 0,
          new Date(f.uploadedAt).toLocaleString(),
        ]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(mergedWorkbook, summarySheet, 'Summary');
    }

    // Generate buffer
    const buffer = XLSX.write(mergedWorkbook, { type: 'buffer', bookType: 'xlsx' });

    // Return file as download
    const timestamp = new Date().toISOString().split('T')[0];
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="MERGED_FILES_${timestamp}.xlsx"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Merge files error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to merge files' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleMergeFiles);


