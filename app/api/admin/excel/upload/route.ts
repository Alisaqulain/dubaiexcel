import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withUploadPermission, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import SupplyLabour from '@/models/SupplyLabour';
import Subcontractor from '@/models/Subcontractor';
import ExcelUpload from '@/models/ExcelUpload';
import { logActivity } from '@/lib/activityLogger';
import * as XLSX from 'xlsx';

/**
 * POST /api/admin/excel/upload
 * Uploads and processes Excel file
 */
async function handleUploadExcel(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const labourType = formData.get('labourType') as string || 'OUR_LABOUR';
    const projectId = formData.get('projectId') as string || undefined;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate labour type
    if (!['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'].includes(labourType)) {
      return NextResponse.json(
        { error: 'Invalid labour type' },
        { status: 400 }
      );
    }

    // Check user permissions
    const userRole = req.user?.role;
    if (userRole === 'user' && !projectId) {
      return NextResponse.json(
        { error: 'Project ID required for user role' },
        { status: 400 }
      );
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

    if (jsonData.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `upload_${timestamp}_${file.name}`;

    // Create upload record
    const uploadRecord = await ExcelUpload.create({
      filename,
      originalFilename: file.name,
      uploadedBy: req.user?.userId,
      projectId,
      labourType: labourType as any,
      status: 'PENDING',
      rowCount: jsonData.length,
    });

    const results = {
      created: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process data based on labour type
    for (let i = 0; i < jsonData.length; i++) {
      const row: any = jsonData[i];
      try {
        switch (labourType) {
          case 'OUR_LABOUR':
            await processOurLabour(row, req.user?.userId, projectId);
            results.created++;
            break;

          case 'SUPPLY_LABOUR':
            await processSupplyLabour(row, req.user?.userId, projectId);
            results.created++;
            break;

          case 'SUBCONTRACTOR':
            await processSubcontractor(row, req.user?.userId, projectId);
            results.created++;
            break;
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    // Update upload record
    uploadRecord.status = results.failed === 0 ? 'PROCESSED' : 'ERROR';
    uploadRecord.processedCount = results.created;
    uploadRecord.errorCount = results.failed;
    uploadRecord.errorMessages = results.errors;
    await uploadRecord.save();

    // Log activity
    await logActivity({
      userId: req.user?.userId || '',
      userEmail: req.user?.email || '',
      action: 'UPLOAD',
      entityType: 'EXCEL',
      entityId: uploadRecord._id.toString(),
      description: `Uploaded Excel file: ${file.name} (${labourType})`,
      projectId,
      metadata: { filename: file.name, rowCount: jsonData.length, results },
    });

    return NextResponse.json({
      success: true,
      data: {
        uploadId: uploadRecord._id,
        created: results.created,
        failed: results.failed,
        errors: results.errors.slice(0, 10), // Return first 10 errors
      },
      message: `Processed ${results.created} records, ${results.failed} failed`,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload Excel' },
      { status: 500 }
    );
  }
}

// Helper functions to process different labour types
async function processOurLabour(row: any, uploadedBy: string | undefined, projectId?: string) {
  const empId = String(row['Employee ID'] || row['empId'] || '').trim();
  const name = String(row['Name'] || row['name'] || '').trim();
  const site = String(row['Site'] || row['site'] || '').trim();
  const siteType = String(row['Site Type'] || row['siteType'] || 'OTHER').trim().toUpperCase();
  const role = String(row['Role'] || row['role'] || '').trim();
  const department = String(row['Department'] || row['department'] || '').trim();
  const active = String(row['Active'] || row['active'] || 'Yes').trim().toLowerCase() === 'yes';

  if (!empId || !name || !site || !role) {
    throw new Error('Missing required fields: Employee ID, Name, Site, Role');
  }

  // Check if employee exists
  const existing = await Employee.findOne({ empId });
  if (existing) {
    // Update existing
    existing.name = name;
    existing.site = site;
    existing.siteType = siteType as any;
    existing.role = role;
    existing.department = department;
    existing.active = active;
    existing.projectId = projectId;
    existing.uploadedBy = uploadedBy as any;
    await existing.save();
  } else {
    // Create new
    await Employee.create({
      empId,
      name,
      site,
      siteType: siteType as any,
      role,
      department,
      active,
      labourType: 'OUR_LABOUR',
      projectId,
      uploadedBy: uploadedBy as any,
    });
  }
}

async function processSupplyLabour(row: any, uploadedBy: string | undefined, projectId?: string) {
  const empId = String(row['Employee ID'] || row['empId'] || '').trim();
  const name = String(row['Name'] || row['name'] || '').trim();
  const trade = String(row['Trade'] || row['trade'] || '').trim();
  const companyName = String(row['Company Name'] || row['companyName'] || '').trim();
  const status = String(row['Status'] || row['status'] || 'Present').trim().toUpperCase() === 'PRESENT' ? 'PRESENT' : 'ABSENT';

  if (!empId || !name || !trade || !companyName) {
    throw new Error('Missing required fields: Employee ID, Name, Trade, Company Name');
  }

  await SupplyLabour.findOneAndUpdate(
    { empId, companyName },
    {
      empId,
      name,
      trade,
      companyName,
      status,
      projectId,
      uploadedBy: uploadedBy as any,
    },
    { upsert: true, new: true }
  );
}

async function processSubcontractor(row: any, uploadedBy: string | undefined, projectId?: string) {
  const companyName = String(row['Company Name'] || row['companyName'] || '').trim();
  const trade = String(row['Trade'] || row['trade'] || '').trim();
  const scopeOfWork = String(row['Scope of Work'] || row['scopeOfWork'] || '').trim();
  const employeesPresent = parseInt(row['Employees Present'] || row['employeesPresent'] || '0', 10);

  if (!companyName || !trade || !scopeOfWork) {
    throw new Error('Missing required fields: Company Name, Trade, Scope of Work');
  }

  await Subcontractor.findOneAndUpdate(
    { companyName, projectId },
    {
      companyName,
      trade,
      scopeOfWork,
      employeesPresent,
      projectId,
      uploadedBy: uploadedBy as any,
    },
    { upsert: true, new: true }
  );
}

export const POST = withUploadPermission(handleUploadExcel);

