import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import AttendanceMaster from '@/models/AttendanceMaster';
import AttendanceRaw from '@/models/AttendanceRaw';
import Employee from '@/models/Employee';
import Upload from '@/models/Upload';
import UploadLog from '@/models/UploadLog';

async function handleClearData(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Clear all static data collections
    const results = {
      attendanceMaster: 0,
      attendanceRaw: 0,
      employees: 0,
      uploads: 0,
      uploadLogs: 0,
    };

    // Delete all records from each collection
    const attendanceMasterResult = await AttendanceMaster.deleteMany({});
    results.attendanceMaster = attendanceMasterResult.deletedCount || 0;

    const attendanceRawResult = await AttendanceRaw.deleteMany({});
    results.attendanceRaw = attendanceRawResult.deletedCount || 0;

    const employeesResult = await Employee.deleteMany({});
    results.employees = employeesResult.deletedCount || 0;

    const uploadsResult = await Upload.deleteMany({});
    results.uploads = uploadsResult.deletedCount || 0;

    const uploadLogsResult = await UploadLog.deleteMany({});
    results.uploadLogs = uploadLogsResult.deletedCount || 0;

    const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);

    return NextResponse.json({
      success: true,
      message: `Successfully cleared all static data`,
      deleted: results,
      totalDeleted,
    });
  } catch (error: any) {
    console.error('Clear data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear data' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleClearData);


