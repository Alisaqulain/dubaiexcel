import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import SheetRow from '@/models/SheetRow';
import UploadedSheet from '@/models/UploadedSheet';

/**
 * POST /api/admin/sheets/merge-projects
 * Merge projects: all rows with projectName in sourceValues get projectName = targetProject.
 * Body: { sheetId, targetProject, sourceValues: string[] }
 * Also updates data[loginColumnName] for each row.
 */
async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const sheetId = body.sheetId;
    const targetProject = body.targetProject != null ? String(body.targetProject).trim() : '';
    const sourceValues = Array.isArray(body.sourceValues) ? body.sourceValues.map(String) : [];

    if (!sheetId || !targetProject) {
      return NextResponse.json(
        { error: 'sheetId and targetProject are required' },
        { status: 400 }
      );
    }

    const sheet = await UploadedSheet.findById(sheetId).lean();
    if (!sheet) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }

    const loginColumnName = (sheet as any).loginColumnName;
    if (sourceValues.length === 0) {
      return NextResponse.json(
        { error: 'sourceValues must be a non-empty array' },
        { status: 400 }
      );
    }
    const updatePayload: Record<string, unknown> = {
      projectName: targetProject,
      [`data.${loginColumnName}`]: targetProject,
    };
    const result = await SheetRow.updateMany(
      { sheetId, projectName: { $in: sourceValues } },
      { $set: updatePayload }
    );

    return NextResponse.json({
      success: true,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error: any) {
    console.error('Merge projects error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to merge projects' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return withAdmin(handlePost)(req);
}
