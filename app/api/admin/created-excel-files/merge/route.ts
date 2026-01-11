import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
// COMMENTED OUT - Activity logging (not useable for now)
// import { logActivity } from '@/lib/activityLogger';
import * as XLSX from 'xlsx';

/**
 * POST /api/admin/created-excel-files/merge
 * Merges multiple created Excel files into one file
 */
async function handleMergeCreatedExcelFiles(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 file IDs are required' },
        { status: 400 }
      );
    }

    // Get file records (only non-merged files)
    const files = await CreatedExcelFile.find({
      _id: { $in: fileIds },
      isMerged: { $ne: true },
    });

    if (files.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 valid files are required for merging' },
        { status: 400 }
      );
    }

    // Check if all files have the same labour type
    const labourTypes = Array.from(new Set(files.map(f => f.labourType)));
    if (labourTypes.length > 1) {
      return NextResponse.json(
        { error: 'All files must have the same labour type' },
        { status: 400 }
      );
    }

    const labourType = labourTypes[0];

    // Merge Excel files
    let allRows: any[] = [];
    let headers: string[] = [];

    for (const file of files) {
      try {
        // Ensure fileData is a Buffer
        const fileBuffer = Buffer.isBuffer(file.fileData) 
          ? file.fileData 
          : Buffer.from(file.fileData as any);

        // Read Excel file
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (jsonData.length > 0) {
          // Get headers from first file
          if (headers.length === 0) {
            headers = Object.keys(jsonData[0] as any);
          }

          // Add all rows
          allRows = allRows.concat(jsonData);
        }
      } catch (err: any) {
        console.error(`Error processing file ${file._id}:`, err);
        return NextResponse.json(
          { error: `Failed to process file ${file.originalFilename}: ${err.message}` },
          { status: 500 }
        );
      }
    }

    if (allRows.length === 0) {
      return NextResponse.json(
        { error: 'No data to merge' },
        { status: 400 }
      );
    }

    // Create merged workbook
    const mergedWorkbook = XLSX.utils.book_new();
    const mergedWorksheet = XLSX.utils.json_to_sheet(allRows);
    
    // Set column widths
    const colWidths = headers.map(() => ({ wch: 20 }));
    mergedWorksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(mergedWorkbook, mergedWorksheet, 'Data');
    
    // Generate Excel buffer
    const mergedBuffer = Buffer.from(
      XLSX.write(mergedWorkbook, { type: 'array', bookType: 'xlsx' })
    );

    // Create merged file record
    const timestamp = Date.now();
    const mergedFilename = `merged_${timestamp}_${files.length}_files.xlsx`;
    const mergedOriginalFilename = `merged_${files.map(f => f.originalFilename.replace(/\.[^/.]+$/, '')).join('_')}_${timestamp}.xlsx`;

    const mergedFile = await CreatedExcelFile.create({
      filename: mergedFilename,
      originalFilename: mergedOriginalFilename,
      fileData: mergedBuffer,
      labourType: labourType as 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR',
      rowCount: allRows.length,
      createdBy: req.user?.userId || files[0].createdBy,
      createdByName: 'Admin',
      createdByEmail: req.user?.email || 'admin',
      isMerged: true,
      mergedFrom: files.map(f => f._id),
      mergedDate: new Date(),
    });

    // Mark original files as merged
    await CreatedExcelFile.updateMany(
      { _id: { $in: fileIds } },
      { 
        isMerged: true,
        mergedDate: new Date(),
      }
    );

    // COMMENTED OUT - Activity logging (not useable for now)
    // await logActivity({
    //   userId: req.user?.userId || '',
    //   userEmail: req.user?.email || '',
    //   action: 'MERGE',
    //   entityType: 'CREATED_EXCEL_FILE',
    //   description: `Merged ${files.length} created Excel files into ${mergedOriginalFilename}`,
    //   metadata: { 
    //     fileIds, 
    //     mergedFileId: mergedFile._id,
    //     rowCount: allRows.length,
    //     count: files.length 
    //   },
    // });

    return NextResponse.json({
      success: true,
      message: `Successfully merged ${files.length} files into one file with ${allRows.length} rows`,
      data: {
        mergedFile: {
          id: mergedFile._id,
          filename: mergedFile.originalFilename,
          rowCount: mergedFile.rowCount,
          labourType: mergedFile.labourType,
        },
        mergedCount: files.length,
      },
    });
  } catch (error: any) {
    console.error('Merge created Excel files error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to merge Excel files' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleMergeCreatedExcelFiles);
