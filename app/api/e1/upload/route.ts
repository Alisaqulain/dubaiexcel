import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withUploadPermission, AuthenticatedRequest } from '@/lib/middleware';
import { parseMultipleFiles } from '@/lib/excelParser';
import AttendanceRaw from '@/models/AttendanceRaw';
import Upload from '@/models/Upload';
import UploadLog from '@/models/UploadLog';
import AttendanceMaster from '@/models/AttendanceMaster';
import Employee from '@/models/Employee';
import ExcelFile from '@/models/ExcelFile';
import { validateAttendanceRow, normalizeDate, normalizeTime } from '@/lib/validation';
import { randomUUID } from 'crypto';

// Parse FormData files
async function parseFormData(request: NextRequest): Promise<Array<{ buffer: Buffer; filename: string }>> {
  const formData = await request.formData();
  const files: Array<{ buffer: Buffer; filename: string }> = [];

  // Get all files (can be single or multiple)
  const fileEntries = formData.getAll('files');
  for (const file of fileEntries) {
    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      files.push({
        buffer: Buffer.from(arrayBuffer),
        filename: file.name,
      });
    }
  }

  return files;
}

// Helper function to infer site type
function inferSiteType(site: string): 'HEAD_OFFICE' | 'MEP' | 'CIVIL' | 'OTHER' | 'OUTSOURCED' | 'SUPPORT' {
  const siteUpper = site.toUpperCase();
  if (siteUpper.includes('HEAD') || siteUpper.includes('OFFICE')) {
    return 'HEAD_OFFICE';
  } else if (siteUpper.includes('MEP')) {
    return 'MEP';
  } else if (siteUpper.includes('CIVIL')) {
    return 'CIVIL';
  } else if (siteUpper.includes('SUPPORT')) {
    return 'SUPPORT';
  } else if (siteUpper.includes('OUTSOURCE')) {
    return 'OUTSOURCED';
  }
  return 'OTHER';
}

// Optimized validation without database calls
function validateRowFast(row: any): { status: 'OK' | 'ERROR' | 'WARNING'; message: string } {
  if (!row.empId || row.empId.trim() === '') {
    return { status: 'ERROR', message: 'Employee ID is required' };
  }
  if (!row.date || row.date.trim() === '') {
    return { status: 'ERROR', message: 'Date is required' };
  }
  if (!row.status || row.status.trim() === '') {
    return { status: 'ERROR', message: 'Status is required' };
  }
  return { status: 'OK', message: 'Validation passed' };
}

// Optimized auto-merge function with batch processing
async function autoMerge(rawRecord: any) {
  try {
    let mergedCount = 0;
    let errorCount = 0;

    // Collect all unique employee IDs and roles from rows
    const empIds = new Set<string>();
    const rows = rawRecord.rows || [];
    
    for (const row of rows) {
      const empId = row.empId?.trim();
      if (empId) {
        empIds.add(empId);
      }
    }

    // Batch load all employees at once
    const existingEmployees = await Employee.find({ 
      empId: { $in: Array.from(empIds) } 
    }).lean();
    
    const employeeMap = new Map(
      existingEmployees.map((emp: any) => [emp.empId, emp])
    );

    // Collect employees to create
    const employeesToCreate: any[] = [];
    const employeesToUpdate: any[] = [];
    const attendanceRecords: any[] = [];

    // Process all rows in memory first
    for (const row of rows) {
      try {
        // Fast validation (no database calls)
        const validation = validateRowFast(row);

        // Normalize data
        const empId = row.empId?.trim();
        const name = row.name?.trim() || 'Unknown';
        const role = row.role?.trim() || 'Unknown';
        const site = row.site?.trim() || 'Unknown';
        const date = normalizeDate(row.date || '');
        const time = normalizeTime(row.time || '');
        const status = row.status?.trim() || 'Unknown';

        if (!empId || !date) {
          errorCount++;
          continue;
        }

        let employee = employeeMap.get(empId);
        
        // If employee doesn't exist, prepare for creation
        if (!employee) {
          const siteType = inferSiteType(site);
          const newEmployee = {
            empId,
            name,
            site,
            siteType,
            role,
            active: true,
          };
          employeesToCreate.push(newEmployee);
          employeeMap.set(empId, newEmployee as any);
          employee = newEmployee;
        } else {
          // Update employee info if needed
          const needsUpdate = 
            employee.name !== name ||
            employee.role !== role ||
            employee.site !== site;
          
          if (needsUpdate) {
            employeesToUpdate.push({
              empId,
              name,
              role,
              site,
            });
          }
        }

        // Prepare attendance record for bulk upsert
        attendanceRecords.push({
          updateOne: {
            filter: { empId, date },
            update: {
              $set: {
                empId,
                name: employee.name,
                role: employee.role,
                site: employee.site,
                date,
                time,
                status,
                validation: validation.status,
                validationMessage: validation.message,
                sourceFileId: rawRecord.fileId,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        });

        mergedCount++;
      } catch (error: any) {
        console.error(`Error processing row:`, error);
        errorCount++;
      }
    }

    // Batch create new employees
    if (employeesToCreate.length > 0) {
      await Employee.insertMany(employeesToCreate, { ordered: false }).catch((err: any) => {
        // Ignore duplicate key errors
        if (err.code !== 11000) {
          console.error('Error creating employees:', err);
        }
      });
    }

    // Batch update existing employees
    if (employeesToUpdate.length > 0) {
      const updatePromises = employeesToUpdate.map(emp =>
        Employee.updateOne(
          { empId: emp.empId },
          { $set: { name: emp.name, role: emp.role, site: emp.site } }
        )
      );
      await Promise.all(updatePromises);
    }

    // Bulk upsert attendance records (process in batches of 1000 for better performance)
    // Using bulkWrite instead of individual findOneAndUpdate reduces database round trips
    const BATCH_SIZE = 1000;
    for (let i = 0; i < attendanceRecords.length; i += BATCH_SIZE) {
      const batch = attendanceRecords.slice(i, i + BATCH_SIZE);
      await AttendanceMaster.bulkWrite(batch, { ordered: false }).catch((err: any) => {
        console.error('Error in bulk write:', err);
      });
    }

    return { mergedCount, errorCount };
  } catch (error: any) {
    console.error('Auto-merge error:', error);
    throw error;
  }
}

async function handleUpload(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse uploaded files
    const files = await parseFormData(req);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }

    const uploadResults = [];

    for (const file of files) {
      const fileId = randomUUID();
      let uploadLog: any = null;
      
      try {
        // Create upload log
        uploadLog = await UploadLog.create({
          userId: req.user.userId as any,
          fileName: file.filename,
          rowsCount: 0,
          uploadTime: new Date(),
          status: 'processing',
          fileId,
        });

        // Parse Excel file
        const parsedData = parseMultipleFiles([file]);
        const rows = parsedData[0]?.rows || [];

        // Create upload record
        const upload = await Upload.create({
          fileId,
          filename: file.filename,
          uploaderId: req.user.userId as any,
          parsedRowsCount: rows.length,
          status: 'parsed',
        });

        // Create attendance raw record
        const attendanceRaw = await AttendanceRaw.create({
          fileId,
          uploaderId: req.user.userId as any,
          filename: file.filename,
          rows: rows.map(row => ({
            ...row,
            raw: (row as any).raw || {},
          })),
          parsedRowsCount: rows.length,
          status: 'processed',
        });

        // Update upload log with row count
        uploadLog.rowsCount = rows.length;

        // Save to ExcelFile for admin viewing
        await ExcelFile.create({
          fileId,
          filename: file.filename,
          createdBy: req.user.userId as any,
          fileType: 'uploaded',
          fileSize: file.buffer.length,
          rowCount: rows.length,
          status: 'active',
        });

        // Auto-merge immediately
        const mergeResult = await autoMerge(attendanceRaw);
        uploadLog.status = 'success';
        await uploadLog.save();

        uploadResults.push({
          fileId,
          filename: file.filename,
          rowsCount: rows.length,
          mergedCount: mergeResult.mergedCount,
          errorCount: mergeResult.errorCount,
          status: 'success',
        });
      } catch (error: any) {
        console.error(`Error processing ${file.filename}:`, error);
        
        // Update upload log with error
        if (uploadLog) {
          uploadLog.status = 'failed';
          uploadLog.errorMessage = error.message;
          await uploadLog.save();
        } else {
          // Create error log if upload log wasn't created
          await UploadLog.create({
            userId: req.user.userId as any,
            fileName: file.filename,
            rowsCount: 0,
            uploadTime: new Date(),
            status: 'failed',
            errorMessage: error.message,
            fileId,
          });
        }

        // Create error record
        await Upload.create({
          fileId: randomUUID(),
          filename: file.filename,
          uploaderId: req.user.userId as any,
          parsedRowsCount: 0,
          status: 'error',
          errorMessage: error.message,
        });

        uploadResults.push({
          filename: file.filename,
          status: 'error',
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${uploadResults.length} file(s)`,
      results: uploadResults,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

export const POST = withUploadPermission(handleUpload);

