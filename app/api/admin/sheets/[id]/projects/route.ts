import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import SheetRow from '@/models/SheetRow';

/**
 * GET /api/admin/sheets/[id]/projects
 * Distinct project names for a sheet (for dropdowns: worker transfer, merge).
 */
async function handleGet(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const list = await SheetRow.distinct('projectName', { sheetId: params.id });
    const sorted = (list as string[]).filter(Boolean).sort();
    return NextResponse.json({ success: true, data: sorted });
  } catch (error: any) {
    console.error('Sheet projects error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get projects' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAdmin((authReq) => handleGet(authReq, context))(req);
}
