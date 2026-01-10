import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import SupplyLabour from '@/models/SupplyLabour';
import Subcontractor from '@/models/Subcontractor';
import ExcelUpload from '@/models/ExcelUpload';
import AttendanceMaster from '@/models/AttendanceMaster';
import AttendanceRaw from '@/models/AttendanceRaw';
import { logActivity } from '@/lib/activityLogger';

/**
 * POST /api/admin/clear-data
 * Clear data based on type (Admin & Super Admin only)
 * Super Admin can clear all data, Admin has limitations
 */
async function handleClearData(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { dataType, projectId, confirm } = body;

    if (!confirm) {
      return NextResponse.json(
        { error: 'Confirmation required. Set confirm: true' },
        { status: 400 }
      );
    }

    const userRole = req.user?.role;
    const isSuperAdmin = userRole === 'super-admin';

    let result: any = {};

    switch (dataType) {
      case 'EMPLOYEES':
        if (projectId && !isSuperAdmin) {
          // Admin can only clear employees from specific projects
          result.deleted = await Employee.deleteMany({ projectId });
        } else if (isSuperAdmin) {
          // Super Admin can clear all
          result.deleted = await Employee.deleteMany({});
        } else {
          return NextResponse.json(
            { error: 'Admin can only clear project-specific data' },
            { status: 403 }
          );
        }
        break;

      case 'SUPPLY_LABOUR':
        if (projectId && !isSuperAdmin) {
          result.deleted = await SupplyLabour.deleteMany({ projectId });
        } else if (isSuperAdmin) {
          result.deleted = await SupplyLabour.deleteMany({});
        } else {
          return NextResponse.json(
            { error: 'Admin can only clear project-specific data' },
            { status: 403 }
          );
        }
        break;

      case 'SUBCONTRACTOR':
        if (projectId && !isSuperAdmin) {
          result.deleted = await Subcontractor.deleteMany({ projectId });
        } else if (isSuperAdmin) {
          result.deleted = await Subcontractor.deleteMany({});
        } else {
          return NextResponse.json(
            { error: 'Admin can only clear project-specific data' },
            { status: 403 }
          );
        }
        break;

      case 'ATTENDANCE':
        if (projectId && !isSuperAdmin) {
          result.deleted = await AttendanceMaster.deleteMany({});
          result.rawDeleted = await AttendanceRaw.deleteMany({});
        } else if (isSuperAdmin) {
          result.deleted = await AttendanceMaster.deleteMany({});
          result.rawDeleted = await AttendanceRaw.deleteMany({});
        } else {
          return NextResponse.json(
            { error: 'Admin can only clear project-specific data' },
            { status: 403 }
          );
        }
        break;

      case 'UPLOADS':
        if (projectId && !isSuperAdmin) {
          result.deleted = await ExcelUpload.deleteMany({ projectId });
        } else if (isSuperAdmin) {
          result.deleted = await ExcelUpload.deleteMany({});
        } else {
          return NextResponse.json(
            { error: 'Admin can only clear project-specific data' },
            { status: 403 }
          );
        }
        break;

      case 'ALL':
        if (!isSuperAdmin) {
          return NextResponse.json(
            { error: 'Only Super Admin can clear all data' },
            { status: 403 }
          );
        }
        result.employees = await Employee.deleteMany({});
        result.supplyLabour = await SupplyLabour.deleteMany({});
        result.subcontractor = await Subcontractor.deleteMany({});
        result.attendance = await AttendanceMaster.deleteMany({});
        result.attendanceRaw = await AttendanceRaw.deleteMany({});
        result.uploads = await ExcelUpload.deleteMany({});
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid data type' },
          { status: 400 }
        );
    }

    // Log activity
    await logActivity({
      userId: req.user?.userId || '',
      userEmail: req.user?.email || '',
      action: 'DELETE',
      entityType: 'EXCEL',
      description: `Cleared data: ${dataType}${projectId ? ` (Project: ${projectId})` : ''}`,
      projectId,
      metadata: { dataType, result },
    });

    return NextResponse.json({
      success: true,
      message: `Data cleared successfully`,
      data: result,
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






