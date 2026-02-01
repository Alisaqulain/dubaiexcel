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
    const originalArrayBuffer = await file.arrayBuffer();
    let arrayBuffer: ArrayBuffer | Buffer = originalArrayBuffer;
    const workbook = XLSX.read(originalArrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 }) as any[][];

    if (jsonData.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty' },
        { status: 400 }
      );
    }

    const headers = ((jsonData[0] as any[]) || []).map((h: any) => String(h || '').trim());
    const formatColumns = (assignedFormat as any).columns.sort((a: any, b: any) => a.order - b.order);
    const requiredColumns = formatColumns.filter((col: any) => col.required).map((col: any) => col.name.trim());
    const formatColumnNames = formatColumns.map((col: any) => col.name.trim());

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

    // Check for duplicate values in unique columns
    const uniqueColumns = formatColumns.filter((col: any) => col.unique === true);
    console.log('Checking unique columns:', uniqueColumns.map((c: any) => ({ name: c.name, unique: c.unique })));
    console.log('File headers:', headers);
    
    if (uniqueColumns.length > 0) {
      const dataRows = jsonData.slice(1) as any[][]; // Skip header row
      const duplicateErrors: string[] = [];
      
      uniqueColumns.forEach((col: any) => {
        // Normalize column name for matching (case-insensitive, trim whitespace)
        const colNameNormalized = col.name.trim();
        const colIndex = headers.findIndex((h: string) => {
          const headerNormalized = String(h || '').trim().toLowerCase();
          return headerNormalized === colNameNormalized.toLowerCase();
        });
        
        console.log(`Looking for column "${col.name}" (normalized: "${colNameNormalized}") - found at index: ${colIndex}`);
        
        if (colIndex === -1) {
          console.warn(`Unique column "${col.name}" not found in file headers. Available headers:`, headers);
          console.warn(`Tried to match: "${colNameNormalized.toLowerCase()}"`);
          return; // Column not found in file
        }
        
        const valueMap = new Map<string, number[]>(); // Map normalized value -> array of row indices
        
        dataRows.forEach((row: any[], rowIndex: number) => {
          const rawValue = row[colIndex];
          const value = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';
          
          // Check all non-empty values (case-insensitive)
          if (value !== '') {
            const normalizedValue = value.toLowerCase(); // Case-insensitive comparison
            if (!valueMap.has(normalizedValue)) {
              valueMap.set(normalizedValue, []);
            }
            valueMap.get(normalizedValue)!.push(rowIndex + 2); // +2 because Excel rows start at 1 and we skip header
          }
        });
        
        console.log(`Column "${col.name}" value map:`, Array.from(valueMap.entries()));
        
        // Find duplicates
        valueMap.forEach((rowIndices, normalizedValue) => {
          if (rowIndices.length > 1) {
            // Find the original case value for display
            const originalValue = dataRows[rowIndices[0] - 2]?.[colIndex] ? String(dataRows[rowIndices[0] - 2][colIndex]).trim() : normalizedValue;
            duplicateErrors.push(
              `Column "${col.name}" must be unique. Duplicate value "${originalValue}" found in rows: ${rowIndices.join(', ')}`
            );
            console.error(`DUPLICATE FOUND: Column "${col.name}", Value "${originalValue}", Rows: ${rowIndices.join(', ')}`);
          }
        });
      });
      
      if (duplicateErrors.length > 0) {
        // Log for debugging
        console.error('=== DUPLICATE VALIDATION FAILED ===');
        console.error('Duplicate errors:', duplicateErrors);
        console.error('Unique columns checked:', uniqueColumns.map((c: any) => c.name));
        console.error('Headers in file:', headers);
        console.error('Format columns:', formatColumns.map((c: any) => ({ name: c.name, unique: c.unique })));
        
        // Return error - file will NOT be saved
        return NextResponse.json({
          success: false,
          error: `Cannot save file: Duplicate values found in unique columns. File was NOT saved.`,
          validationError: true,
          duplicateErrors,
          message: `Found ${duplicateErrors.length} duplicate value(s) in unique columns. Please remove duplicates and try again.`,
        }, { status: 400 });
      } else {
        console.log('✅ Unique validation passed - no duplicates found');
      }
    }

    // Validate dropdown columns - check if values match allowed options
    const dropdownColumns = formatColumns.filter((col: any) => col.type === 'dropdown' && col.validation?.options && col.validation.options.length > 0);
    console.log('Checking dropdown columns:', dropdownColumns.map((c: any) => ({ name: c.name, options: c.validation?.options })));
    
    if (dropdownColumns.length > 0) {
      const dataRows = jsonData.slice(1) as any[][]; // Skip header row
      const dropdownErrors: string[] = [];
      
      dropdownColumns.forEach((col: any) => {
        // Normalize column name for matching (case-insensitive, trim whitespace)
        const colNameNormalized = col.name.trim();
        const colIndex = headers.findIndex((h: string) => {
          const headerNormalized = String(h || '').trim().toLowerCase();
          return headerNormalized === colNameNormalized.toLowerCase();
        });
        
        if (colIndex === -1) {
          console.warn(`Dropdown column "${col.name}" not found in file headers. Available headers:`, headers);
          return; // Column not found in file
        }
        
        const allowedOptions = col.validation?.options || [];
        const allowedOptionsLower = allowedOptions.map((opt: string) => String(opt).trim().toLowerCase());
        
        dataRows.forEach((row: any[], rowIndex: number) => {
          const rawValue = row[colIndex];
          const value = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';
          
          // Only validate non-empty values
          if (value !== '') {
            const normalizedValue = value.toLowerCase();
            const optionIndex = allowedOptionsLower.indexOf(normalizedValue);
            
            if (optionIndex === -1) {
              // Value doesn't match any option (case-insensitive)
              dropdownErrors.push(
                `Row ${rowIndex + 2}: Column "${col.name}" must be one of: ${allowedOptions.join(', ')}. Found: "${value}"`
              );
              console.error(`DROPDOWN VALIDATION FAILED: Column "${col.name}", Value "${value}", Allowed: ${allowedOptions.join(', ')}`);
            } else {
              // Value matches (case-insensitive) - normalize to exact case of defined option
              const correctCaseValue = allowedOptions[optionIndex];
              if (value !== correctCaseValue) {
                // Update the row value to match the exact case of the option
                row[colIndex] = correctCaseValue;
                console.log(`Normalized dropdown value: "${value}" -> "${correctCaseValue}" in column "${col.name}", row ${rowIndex + 2}`);
              }
            }
          }
        });
      });
      
      if (dropdownErrors.length > 0) {
        // Log for debugging
        console.error('=== DROPDOWN VALIDATION FAILED ===');
        console.error('Dropdown errors:', dropdownErrors);
        console.error('Dropdown columns checked:', dropdownColumns.map((c: any) => ({ name: c.name, options: c.validation?.options })));
        
        // Return error - file will NOT be saved
        return NextResponse.json({
          success: false,
          error: `Cannot save file: Invalid dropdown values found. File was NOT saved.`,
          validationError: true,
          dropdownErrors,
          message: `Found ${dropdownErrors.length} invalid dropdown value(s). Please use only allowed options and try again.`,
        }, { status: 400 });
      } else {
        console.log('✅ Dropdown validation passed - all values match allowed options');
        
        // If we normalized any dropdown values, regenerate the Excel buffer with updated data
        if (dropdownColumns.length > 0) {
          // Check if any values were normalized (we modified jsonData)
          // Regenerate workbook with normalized values
          const updatedWorkbook = XLSX.utils.book_new();
          const updatedWorksheet = XLSX.utils.aoa_to_sheet(jsonData); // Use array of arrays format
          XLSX.utils.book_append_sheet(updatedWorkbook, updatedWorksheet, 'Data');
          const updatedBuffer = XLSX.write(updatedWorkbook, { type: 'buffer', bookType: 'xlsx' });
          // Use updated buffer instead of original (convert Buffer to ArrayBuffer for consistency)
          arrayBuffer = updatedBuffer;
        }
      }
    }

    // File is validated, convert to buffer (reuse arrayBuffer from above, which may have been updated)
    const buffer = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer as ArrayBuffer);

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
      const userIdObj = new mongoose.Types.ObjectId(userId as string);
      existingFile.lastEditedAt = new Date();
      existingFile.lastEditedBy = userIdObj;
      existingFile.lastEditedByName = userName;
      await existingFile.save();

      // Find all merged files that include this file in their mergedFrom array
      const mergedFiles = await CreatedExcelFile.find({
        isMerged: true,
        mergedFrom: { $in: [fileId] }
      }).select('+fileData').lean();

      const updatedMergedFiles: string[] = [];

      // Regenerate each merged file that includes this edited file
      if (mergedFiles.length > 0) {
        const ExcelFormat = (await import('@/models/ExcelFormat')).default;
        
        for (const mergedFile of mergedFiles) {
          try {
            // Get all source files for this merged file
            const sourceFileIds = (mergedFile.mergedFrom || []).map((id: any) => id.toString());
            const sourceFiles = await CreatedExcelFile.find({
              _id: { $in: sourceFileIds }
            }).select('+fileData').lean();

            if (sourceFiles.length === 0) continue;

            // Reuse merge logic to regenerate the merged file
            const allHeadersSet = new Set<string>();
            const fileDataArray: Array<{ filename: string; rows: any[]; headers: string[] }> = [];

            // Process each source file
            for (const sourceFile of sourceFiles) {
              const fileBuffer = Buffer.isBuffer(sourceFile.fileData) 
                ? sourceFile.fileData 
                : Buffer.from(sourceFile.fileData as any);
              
              const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

              if (jsonData.length > 0) {
                const fileHeaders = Object.keys(jsonData[0] as any);
                fileHeaders.forEach(h => allHeadersSet.add(h));
                fileDataArray.push({
                  filename: sourceFile.originalFilename,
                  rows: jsonData,
                  headers: fileHeaders,
                });
              }
            }

            if (fileDataArray.length === 0) continue;

            // Create unified headers
            const unifiedHeaders = Array.from(allHeadersSet).sort();
            
            // Normalize all rows
            const allRows: any[] = [];
            fileDataArray.forEach(({ rows }) => {
              rows.forEach((row: any) => {
                const normalizedRow: any = {};
                unifiedHeaders.forEach(header => {
                  normalizedRow[header] = row[header] !== undefined && row[header] !== null 
                    ? String(row[header]).trim() 
                    : '';
                });
                allRows.push(normalizedRow);
              });
            });

            // Handle unique columns (remove duplicates)
            const activeFormats = await ExcelFormat.find({ active: true }).lean();
            const uniqueColumns: string[] = [];
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

            if (uniqueColumns.length > 0) {
              const seenValues: { [colName: string]: Set<string> } = {};
              uniqueColumns.forEach((colName: string) => {
                seenValues[colName] = new Set<string>();
              });
              
              const deduplicatedRows: any[] = [];
              allRows.forEach((row: any) => {
                let isDuplicate = false;
                uniqueColumns.forEach((colName: string) => {
                  const value = String(row[colName] || '').trim().toLowerCase();
                  if (value !== '' && seenValues[colName].has(value)) {
                    isDuplicate = true;
                  } else if (value !== '') {
                    seenValues[colName].add(value);
                  }
                });
                if (!isDuplicate) {
                  deduplicatedRows.push(row);
                }
              });
              
              allRows.length = 0;
              allRows.push(...deduplicatedRows);
            }

            // Create merged workbook
            const mergedWorkbook = XLSX.utils.book_new();
            const mergedWorksheet = XLSX.utils.json_to_sheet(allRows);
            const colWidths = unifiedHeaders.map(() => ({ wch: 20 }));
            mergedWorksheet['!cols'] = colWidths;
            XLSX.utils.book_append_sheet(mergedWorkbook, mergedWorksheet, 'Merged Data');

            // Generate Excel buffer
            const mergedBuffer = Buffer.from(
              XLSX.write(mergedWorkbook, { type: 'array', bookType: 'xlsx' })
            );

            // Update the merged file
            await CreatedExcelFile.updateOne(
              { _id: mergedFile._id },
              {
                fileData: mergedBuffer,
                rowCount: allRows.length,
                lastEditedAt: new Date(),
                lastEditedBy: userIdObj,
                lastEditedByName: userName || 'User',
              }
            );

            updatedMergedFiles.push(mergedFile.originalFilename);
            console.log(`Auto-updated merged file: ${mergedFile.originalFilename} after editing source file: ${existingFile.originalFilename}`);
          } catch (error: any) {
            console.error(`Failed to auto-update merged file ${mergedFile._id}:`, error);
          }
        }
      }

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
          lastEditedAt: existingFile.lastEditedAt,
          lastEditedBy: existingFile.lastEditedBy,
          lastEditedByName: existingFile.lastEditedByName,
        },
        updatedMergedFiles: updatedMergedFiles.length > 0 ? updatedMergedFiles : undefined,
        mergedFilesUpdated: updatedMergedFiles.length,
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

