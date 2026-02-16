import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withProjectHead, AuthenticatedRequest } from '@/lib/middleware';
import SheetRow from '@/models/SheetRow';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/project-head/rows?page=1&limit=50&sheetId=...&search=...
 * Returns paginated rows where projectName matches the logged-in project head.
 * Server-side filtering; no full table load.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const projectName = (req.user as any)?.projectName;
    if (!projectName) {
      return NextResponse.json(
        { error: 'Project not found in token' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10))
    );
    const sheetId = searchParams.get('sheetId') || undefined;
    const search = searchParams.get('search') || '';

    const filter: Record<string, unknown> = { projectName };
    if (sheetId) filter.sheetId = sheetId;

    const skip = (page - 1) * limit;

    if (search.trim()) {
      (filter as any).$or = [
        { status: { $regex: search.trim(), $options: 'i' } },
        { notes: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const [rows, total] = await Promise.all([
      SheetRow.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      SheetRow.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error('Project head rows error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rows' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return withProjectHead(handleGet)(req);
}
