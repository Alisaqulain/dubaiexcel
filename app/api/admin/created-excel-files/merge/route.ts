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
    const { fileIds, mergedFilename } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 file IDs are required' },
        { status: 400 }
      );
    }

    // Get file records (allow any files, including already merged ones)
    // Explicitly select fileData to ensure it's included
    const files = await CreatedExcelFile.find({
      _id: { $in: fileIds },
    }).select('+fileData'); // Explicitly include fileData

    if (files.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 valid files are required for merging' },
        { status: 400 }
      );
    }

    // Verify all files have fileData
    const filesWithoutData = files.filter(f => !f.fileData || f.fileData.length === 0);
    if (filesWithoutData.length > 0) {
      return NextResponse.json(
        { error: `Some files are missing data: ${filesWithoutData.map(f => f.originalFilename).join(', ')}` },
        { status: 400 }
      );
    }

    // Get labour types (allow different types, use first one or 'OUR_LABOUR' as default)
    const labourTypes = Array.from(new Set(files.map(f => f.labourType)));
    const labourType = labourTypes[0] || 'OUR_LABOUR';
    
    // Log warning if different labour types (but allow merge)
    if (labourTypes.length > 1) {
      console.warn(`Merging files with different labour types: ${labourTypes.join(', ')}. Using: ${labourType}`);
    }

    // Merge Excel files - collect all headers first to normalize columns
    let allHeadersSet = new Set<string>();
    const fileDataArray: Array<{ filename: string; rows: any[]; headers: string[] }> = [];

    // First pass: collect all headers from all files
    for (const file of files) {
      try {
        // Ensure fileData is a Buffer
        let fileBuffer: Buffer;
        
        if (Buffer.isBuffer(file.fileData)) {
          fileBuffer = file.fileData;
        } else if (file.fileData instanceof Uint8Array) {
          fileBuffer = Buffer.from(file.fileData);
        } else if (typeof file.fileData === 'string') {
          fileBuffer = Buffer.from(file.fileData, 'base64');
        } else if (file.fileData && typeof file.fileData === 'object') {
          fileBuffer = Buffer.from(file.fileData as any);
        } else {
          throw new Error(`Invalid fileData format for file ${file.originalFilename}`);
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          throw new Error(`Empty fileData for file ${file.originalFilename}`);
        }

        // Read Excel file
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error(`No sheets found in file ${file.originalFilename}`);
        }
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        if (!worksheet) {
          throw new Error(`Sheet "${firstSheetName}" not found in file ${file.originalFilename}`);
        }
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (jsonData.length > 0) {
          const fileHeaders = Object.keys(jsonData[0] as any);
          fileHeaders.forEach(h => allHeadersSet.add(h));
          
          fileDataArray.push({
            filename: file.originalFilename,
            rows: jsonData,
            headers: fileHeaders,
          });
        } else {
          console.warn(`File ${file.originalFilename} has no data rows`);
        }
      } catch (err: any) {
        console.error(`Error processing file ${file._id} (${file.originalFilename}):`, err);
        return NextResponse.json(
          { error: `Failed to process file "${file.originalFilename}": ${err.message}` },
          { status: 500 }
        );
      }
    }

    if (fileDataArray.length === 0) {
      return NextResponse.json(
        { error: 'No data to merge' },
        { status: 400 }
      );
    }

    // Create unified header list (sorted for consistency)
    const unifiedHeaders = Array.from(allHeadersSet).sort();
    
    // Normalize all rows to use unified headers
    const allRows: any[] = [];
    fileDataArray.forEach(({ rows, filename }) => {
      rows.forEach((row: any, rowIndex: number) => {
        const normalizedRow: any = {};
        unifiedHeaders.forEach(header => {
          // Use value from row if exists, otherwise empty string
          normalizedRow[header] = row[header] !== undefined && row[header] !== null 
            ? String(row[header]).trim() 
            : '';
        });
        allRows.push(normalizedRow);
      });
    });

    // Calculate attendance analysis
    const attendanceColumn = unifiedHeaders.find(h => {
      const hLower = h.toLowerCase().trim();
      return hLower === 'attendance' || 
             hLower === 'attendence' || 
             hLower === 'attend' ||
             hLower.includes('attend');
    });

    let attendanceStats: any = null;
    if (attendanceColumn) {
      let presentCount = 0;
      let absentCount = 0;
      let otherCount = 0;
      const attendanceValues: { [key: string]: number } = {};

      allRows.forEach((row: any) => {
        const value = String(row[attendanceColumn] || '').trim().toLowerCase();
        
        if (value === 'present' || value === 'p') {
          presentCount++;
        } else if (value === 'absent' || value === 'a' || value === 'ab' || value === 'abs') {
          absentCount++;
        } else if (value && value !== '') {
          otherCount++;
          attendanceValues[value] = (attendanceValues[value] || 0) + 1;
        }
      });

      attendanceStats = {
        present: presentCount,
        absent: absentCount,
        other: otherCount,
        total: allRows.length,
        otherValues: attendanceValues,
      };
    }

    // Create merged workbook
    const mergedWorkbook = XLSX.utils.book_new();
    
    // Create data worksheet with normalized headers
    const mergedWorksheet = XLSX.utils.json_to_sheet(allRows);
    
    // Set column widths - auto-size based on content
    const colWidths = unifiedHeaders.map((header, idx) => {
      let maxWidth = Math.max(header.length, 15);
      allRows.forEach(row => {
        const cellValue = row[header] ? String(row[header]) : '';
        maxWidth = Math.max(maxWidth, Math.min(cellValue.length, 50));
      });
      return { wch: Math.min(maxWidth + 2, 50) };
    });
    mergedWorksheet['!cols'] = colWidths;
    
    // Add data worksheet
    XLSX.utils.book_append_sheet(mergedWorkbook, mergedWorksheet, 'Merged Data');
    
    // Add attendance analysis sheet if attendance column exists
    if (attendanceStats) {
      const analysisData = [
        ['Attendance Analysis'],
        [''],
        ['Total Rows', attendanceStats.total],
        ['Present', attendanceStats.present],
        ['Absent', attendanceStats.absent],
        ['Other', attendanceStats.other],
        [''],
        ['Present Percentage', attendanceStats.total > 0 ? ((attendanceStats.present / attendanceStats.total) * 100).toFixed(2) + '%' : '0%'],
        ['Absent Percentage', attendanceStats.total > 0 ? ((attendanceStats.absent / attendanceStats.total) * 100).toFixed(2) + '%' : '0%'],
        [''],
        ['Other Attendance Values:'],
      ];
      
      if (attendanceStats.otherValues && Object.keys(attendanceStats.otherValues).length > 0) {
        analysisData.push(['Value', 'Count']);
        Object.entries(attendanceStats.otherValues).forEach(([value, count]) => {
          analysisData.push([value, count]);
        });
      }
      
      const analysisSheet = XLSX.utils.aoa_to_sheet(analysisData);
      analysisSheet['!cols'] = [{ wch: 30 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(mergedWorkbook, analysisSheet, 'Attendance Analysis');
    }
    
    // Generate Excel buffer
    const mergedBuffer = Buffer.from(
      XLSX.write(mergedWorkbook, { type: 'array', bookType: 'xlsx' })
    );

    // Create merged file record
    const timestamp = Date.now();
    const systemFilename = `merged_${timestamp}_${files.length}_files.xlsx`;
    
    // Use custom filename if provided, otherwise generate default
    const customFilename = mergedFilename?.trim() || `merged_${files.map(f => f.originalFilename.replace(/\.[^/.]+$/, '')).join('_')}_${timestamp}.xlsx`;
    // Ensure filename has .xlsx extension
    const finalFilename = customFilename.endsWith('.xlsx') ? customFilename : `${customFilename}.xlsx`;

    const mergedFile = await CreatedExcelFile.create({
      filename: systemFilename,
      originalFilename: finalFilename,
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

    // DO NOT mark original files as merged - keep them visible
    // Original files remain in the list alongside the merged file

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
      message: `Successfully merged ${files.length} files into one file with ${allRows.length} rows${attendanceStats ? `. Present: ${attendanceStats.present}, Absent: ${attendanceStats.absent}` : ''}`,
      data: {
        mergedFile: {
          id: mergedFile._id,
          filename: mergedFile.originalFilename,
          rowCount: mergedFile.rowCount,
          labourType: mergedFile.labourType,
        },
        mergedCount: files.length,
        attendanceAnalysis: attendanceStats,
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
