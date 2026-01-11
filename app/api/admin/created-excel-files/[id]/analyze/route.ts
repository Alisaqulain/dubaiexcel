import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import * as XLSX from 'xlsx';

/**
 * GET /api/admin/created-excel-files/[id]/analyze
 * Analyze Excel file for attendance data
 */
async function handleAnalyzeExcelFile(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const fileId = params.id;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Get file with fileData
    const file = await CreatedExcelFile.findById(fileId);

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

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

    if (jsonData.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          hasAttendanceColumn: false,
          attendanceStats: null,
        },
      });
    }

    // Get headers from first row
    const headers = Object.keys(jsonData[0] as any);
    
    // Find attendance column (case-insensitive, flexible matching)
    const attendanceColumnIndex = headers.findIndex(h => {
      const hLower = h.toLowerCase().trim();
      return hLower === 'attendance' || 
             hLower === 'attendence' || 
             hLower === 'attend' ||
             hLower === 'status' ||
             hLower.includes('attend');
    });

    const attendanceColumn = attendanceColumnIndex !== -1 ? headers[attendanceColumnIndex] : null;

    if (!attendanceColumn) {
      return NextResponse.json({
        success: true,
        data: {
          hasAttendanceColumn: false,
          attendanceStats: null,
          availableColumns: headers,
        },
      });
    }

    // Analyze attendance data
    let presentCount = 0;
    let absentCount = 0;
    let otherCount = 0;
    const attendanceValues: { [key: string]: number } = {};

    jsonData.forEach((row: any) => {
      const value = String(row[attendanceColumn] || '').trim().toLowerCase();
      
      if (value === 'present' || value === 'p') {
        presentCount++;
      } else if (value === 'absent' || value === 'a' || value === 'ab') {
        absentCount++;
      } else if (value && value !== '') {
        otherCount++;
        attendanceValues[value] = (attendanceValues[value] || 0) + 1;
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        hasAttendanceColumn: true,
        attendanceColumn: attendanceColumn,
        attendanceStats: {
          present: presentCount,
          absent: absentCount,
          other: otherCount,
          total: jsonData.length,
          otherValues: attendanceValues,
        },
      },
    });
  } catch (error: any) {
    console.error('Analyze Excel file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze Excel file' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleAnalyzeExcelFile(authReq, context);
  });
  return handler(req);
}

