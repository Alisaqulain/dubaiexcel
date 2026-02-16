import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import SheetRow from '@/models/SheetRow';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/admin/sheet-rows?sheetId=...&page=1&limit=50&projectName=...
 * Paginated rows for admin (worker transfer, etc.). Optional filter by projectName.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const sheetId = searchParams.get('sheetId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10))
    );
    const projectName = searchParams.get('projectName') || undefined;

    if (!sheetId) {
      return NextResponse.json(
        { error: 'sheetId is required' },
        { status: 400 }
      );
    }

    const filter: Record<string, unknown> = { sheetId };
    if (projectName) filter.projectName = projectName;

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      SheetRow.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      SheetRow.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error: any) {
    console.error('Admin sheet rows error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rows' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return withAdmin(handleGet)(req);
}
