import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import AttendanceRaw from '@/models/AttendanceRaw';
import AttendanceMaster from '@/models/AttendanceMaster';
import Employee from '@/models/Employee';
import { validateAttendanceRow, normalizeDate, normalizeTime } from '@/lib/validation';

async function handleMerge(req: AuthenticatedRequest) {
  try {
    await connectDB();

    // Get all unprocessed attendance raw records
    const rawRecords = await AttendanceRaw.find({ status: 'processed' });

    if (rawRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new records to merge',
        merged: 0,
      });
    }

    let mergedCount = 0;
    let errorCount = 0;

    for (const rawRecord of rawRecords) {
      for (const row of rawRecord.rows) {
        try {
          // Validate row
          const validation = await validateAttendanceRow(row);

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

          // Check if employee exists, create if not
          let employee = await Employee.findOne({ empId });
          if (!employee) {
            // Try to infer siteType from site name
            let siteType: 'HEAD_OFFICE' | 'MEP' | 'CIVIL' | 'OTHER' | 'OUTSOURCED' | 'SUPPORT' = 'OTHER';
            const siteUpper = site.toUpperCase();
            if (siteUpper.includes('HEAD') || siteUpper.includes('OFFICE')) {
              siteType = 'HEAD_OFFICE';
            } else if (siteUpper.includes('MEP')) {
              siteType = 'MEP';
            } else if (siteUpper.includes('CIVIL')) {
              siteType = 'CIVIL';
            } else if (siteUpper.includes('SUPPORT')) {
              siteType = 'SUPPORT';
            } else if (siteUpper.includes('OUTSOURCE')) {
              siteType = 'OUTSOURCED';
            }

            employee = await Employee.create({
              empId,
              name,
              site,
              siteType,
              role,
              active: true,
            });
          }

          // Upsert attendance master record
          await AttendanceMaster.findOneAndUpdate(
            { empId, date },
            {
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
            { upsert: true, new: true }
          );

          mergedCount++;
        } catch (error: any) {
          console.error(`Error merging row:`, error);
          errorCount++;
        }
      }

      // Mark raw record as processed
      await AttendanceRaw.findByIdAndUpdate(rawRecord._id, { status: 'processed' });
    }

    return NextResponse.json({
      success: true,
      message: `Merge completed`,
      merged: mergedCount,
      errors: errorCount,
      processedFiles: rawRecords.length,
    });
  } catch (error: any) {
    console.error('Merge error:', error);
    return NextResponse.json(
      { error: error.message || 'Merge failed' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleMerge);

