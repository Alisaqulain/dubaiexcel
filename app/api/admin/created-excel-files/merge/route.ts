import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import ExcelFormat from '@/models/ExcelFormat';
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

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 1) {
      return NextResponse.json(
        { error: 'At least 1 file ID is required' },
        { status: 400 }
      );
    }

    // Get file records (allow any files, including already merged ones)
    // Explicitly select fileData to ensure it's included
    const files = await CreatedExcelFile.find({
      _id: { $in: fileIds },
    }).select('+fileData'); // Explicitly include fileData

    if (files.length < 1) {
      return NextResponse.json(
        { error: 'At least 1 valid file is required for merging' },
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

    // Check for unique column constraints - get all active formats and find unique columns
    const activeFormats = await ExcelFormat.find({ active: true }).lean();
    const uniqueColumns: string[] = [];
    
    // Find columns that are marked as unique in any active format
    activeFormats.forEach((format: any) => {
      if (format.columns && Array.isArray(format.columns)) {
        format.columns.forEach((col: any) => {
          if (col.unique === true && unifiedHeaders.includes(col.name)) {
            if (!uniqueColumns.includes(col.name)) {
              uniqueColumns.push(col.name);
            }
          }
        });
      }
    });

    // Handle unique columns - remove duplicates instead of failing
    if (uniqueColumns.length > 0) {
      const removedDuplicates: { [colName: string]: number } = {};
      const seenValues: { [colName: string]: Set<string> } = {};
      
      // Initialize seen values sets for each unique column
      uniqueColumns.forEach((colName: string) => {
        seenValues[colName] = new Set<string>();
        removedDuplicates[colName] = 0;
      });
      
      // Filter out duplicate rows based on unique columns
      // Keep first occurrence, remove subsequent duplicates
      const deduplicatedRows: any[] = [];
      
      allRows.forEach((row: any, rowIndex: number) => {
        let isDuplicate = false;
        const duplicateColumns: string[] = [];
        
        // Check each unique column
        uniqueColumns.forEach((colName: string) => {
          // Normalize column name for matching
          const colNameNormalized = colName.trim();
          
          // Try to find the column by exact match first, then case-insensitive
          let value = row[colName];
          if (value === undefined) {
            const matchingKey = Object.keys(row).find(key => 
              key.trim().toLowerCase() === colNameNormalized.toLowerCase()
            );
            value = matchingKey ? row[matchingKey] : undefined;
          }
          
          const stringValue = value !== undefined && value !== null ? String(value).trim() : '';
          
          // Check all non-empty values (case-insensitive)
          if (stringValue !== '') {
            const normalizedValue = stringValue.toLowerCase();
            
            if (seenValues[colName].has(normalizedValue)) {
              // This is a duplicate in this column
              isDuplicate = true;
              duplicateColumns.push(colName);
              removedDuplicates[colName]++;
            } else {
              // First time seeing this value - add it to seen set
              seenValues[colName].add(normalizedValue);
            }
          }
        });
        
        // Only add row if it's not a duplicate in any unique column
        if (!isDuplicate) {
          deduplicatedRows.push(row);
        } else {
          // Log which columns had duplicates for this row
          console.log(`Removed duplicate row ${rowIndex + 2}: duplicate values in columns: ${duplicateColumns.join(', ')}`);
        }
      });
      
      // Log removed duplicates
      const totalRemoved = Object.values(removedDuplicates).reduce((sum, count) => sum + count, 0);
      if (totalRemoved > 0) {
        console.log(`⚠️ Removed ${totalRemoved} duplicate row(s) from unique columns during merge:`, removedDuplicates);
        // Update allRows to use deduplicated rows
        allRows.length = 0;
        allRows.push(...deduplicatedRows);
      } else {
        console.log('✅ No duplicates found in unique columns');
      }
    }

    // Validate dropdown columns - check if values match allowed options
    const dropdownColumns: Array<{ name: string; options: string[]; optionsLower: string[] }> = [];
    
    // Find dropdown columns from active formats
    activeFormats.forEach((format: any) => {
      if (format.columns && Array.isArray(format.columns)) {
        format.columns.forEach((col: any) => {
          if (col.type === 'dropdown' && col.validation?.options && col.validation.options.length > 0) {
            if (unifiedHeaders.includes(col.name)) {
              // Check if we already have this column
              const existingCol = dropdownColumns.find(dc => dc.name.toLowerCase() === col.name.toLowerCase());
              if (!existingCol) {
                dropdownColumns.push({
                  name: col.name,
                  options: col.validation.options.map((opt: string) => String(opt).trim()),
                  optionsLower: col.validation.options.map((opt: string) => String(opt).trim().toLowerCase())
                });
              }
            }
          }
        });
      }
    });

    if (dropdownColumns.length > 0) {
      console.log('Checking dropdown columns:', dropdownColumns);
      const dropdownErrors: string[] = [];
      
      allRows.forEach((row: any, rowIndex: number) => {
        dropdownColumns.forEach((col: any) => {
          // Normalize column name for matching
          const colNameNormalized = col.name.trim();
          
          // Try to find the column by exact match first, then case-insensitive
          let value = row[col.name];
          let columnKey = col.name;
          if (value === undefined) {
            const matchingKey = Object.keys(row).find(key => 
              key.trim().toLowerCase() === colNameNormalized.toLowerCase()
            );
            if (matchingKey) {
              value = row[matchingKey];
              columnKey = matchingKey;
            }
          }
          
          const stringValue = value !== undefined && value !== null ? String(value).trim() : '';
          
          // Only validate non-empty values
          if (stringValue !== '') {
            const normalizedValue = stringValue.toLowerCase();
            const optionIndex = col.optionsLower.indexOf(normalizedValue);
            
            if (optionIndex === -1) {
              // Value doesn't match any option (case-insensitive)
              // Find original options for display (case-sensitive)
              const originalFormat = activeFormats.find((f: any) => 
                f.columns?.some((c: any) => 
                  c.type === 'dropdown' && 
                  c.name.toLowerCase() === col.name.toLowerCase() &&
                  c.validation?.options
                )
              );
              const originalOptions = originalFormat?.columns?.find((c: any) => 
                c.name.toLowerCase() === col.name.toLowerCase()
              )?.validation?.options || col.options;
              
              dropdownErrors.push(
                `Row ${rowIndex + 2}: Column "${col.name}" must be one of: ${originalOptions.join(', ')}. Found: "${stringValue}"`
              );
              console.error(`DROPDOWN VALIDATION FAILED: Column "${col.name}", Value "${stringValue}", Allowed: ${originalOptions.join(', ')}`);
            } else {
              // Value matches (case-insensitive) - normalize to exact case of defined option
              const correctCaseValue = col.options[optionIndex];
              if (stringValue !== correctCaseValue) {
                // Update the row value to match the exact case of the option
                row[columnKey] = correctCaseValue;
                console.log(`Normalized dropdown value: "${stringValue}" -> "${correctCaseValue}" in column "${col.name}", row ${rowIndex + 2}`);
              }
            }
          }
        });
      });
      
      if (dropdownErrors.length > 0) {
        // Log for debugging
        console.error('=== DROPDOWN VALIDATION FAILED ===');
        console.error('Dropdown errors:', dropdownErrors);
        console.error('Dropdown columns checked:', dropdownColumns);
        
        // Return error - merge will NOT proceed
        return NextResponse.json({
          success: false,
          error: `Cannot merge files: Invalid dropdown values found. Merge was NOT completed.`,
          validationError: true,
          dropdownErrors,
          message: `Found ${dropdownErrors.length} invalid dropdown value(s). Please fix the values and try again.`,
        }, { status: 400 });
      } else {
        console.log('✅ Dropdown validation passed - all values match allowed options');
      }
    }

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

    // Increment merge count for all source files
    const sourceFileIds = files.map(f => f._id);
    await CreatedExcelFile.updateMany(
      { _id: { $in: sourceFileIds } },
      { $inc: { mergeCount: 1 } }
    );

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
      mergedFrom: sourceFileIds,
      mergedDate: new Date(),
      mergeCount: 0, // New merged file starts with 0 (will increment when used in future merges)
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

    // Calculate how many duplicates were removed
    const originalRowCount = fileDataArray.reduce((sum, file) => sum + file.rows.length, 0);
    const finalRowCount = allRows.length;
    const duplicatesRemoved = originalRowCount - finalRowCount;
    
    const fileCount = files.length;
    let successMessage = fileCount === 1 
      ? `Successfully created merged file from ${fileCount} file with ${allRows.length} rows`
      : `Successfully merged ${fileCount} files into one file with ${allRows.length} rows`;
    if (duplicatesRemoved > 0) {
      successMessage += `. Removed ${duplicatesRemoved} duplicate row(s) from unique columns.`;
    }
    if (attendanceStats) {
      successMessage += ` Present: ${attendanceStats.present}, Absent: ${attendanceStats.absent}`;
    }
    
    return NextResponse.json({
      success: true,
      message: successMessage,
      data: {
        mergedFile: {
          id: mergedFile._id,
          filename: mergedFile.originalFilename,
          rowCount: mergedFile.rowCount,
          labourType: mergedFile.labourType,
        },
        mergedCount: files.length,
        originalRowCount,
        finalRowCount,
        duplicatesRemoved,
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
