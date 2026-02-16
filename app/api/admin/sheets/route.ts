import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UploadedSheet from '@/models/UploadedSheet';

/**
 * GET /api/admin/sheets
 * List all uploaded sheets (workforce sheets).
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const list = await UploadedSheet.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      success: true,
      data: list.map((s: any) => ({
        id: s._id.toString(),
        name: s.name,
        loginColumnName: s.loginColumnName,
        headers: s.headers,
        rowCount: s.rowCount,
        formatId: s.formatId?.toString() || null,
        createdAt: s.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('List sheets error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list sheets' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return withAdmin(handleGet)(req);
}
