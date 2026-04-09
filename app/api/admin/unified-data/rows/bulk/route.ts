import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { resolveActor } from '@/lib/unifiedDataActor';
import { emitRowsImported } from '@/lib/unifiedDataSocket';

async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const rowsIn = body.rows;
    if (!Array.isArray(rowsIn) || rowsIn.length === 0) {
      return NextResponse.json({ error: 'rows (non-empty array) is required' }, { status: 400 });
    }
    if (rowsIn.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 rows per bulk request' }, { status: 400 });
    }
    const actor = await resolveActor(req);
    const now = new Date();
    const docs = rowsIn.map((item: { name?: string; fields?: Record<string, unknown> }) => {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const fields =
        item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields)
          ? item.fields
          : {};
      if (!name) throw new Error('Each row must have a non-empty name');
      return {
        name,
        fields,
        pickedBy: null,
        status: 'active' as const,
        fileId: null,
        changeHistory: [],
        lastModifiedBy: actor.id,
        lastModifiedByLabel: actor.label,
        lastModifiedAt: now,
      };
    });
    const created = await UnifiedDataRow.insertMany(docs);
    emitRowsImported(created.length);
    return NextResponse.json({
      success: true,
      data: { count: created.length, ids: created.map((c) => String(c._id)) },
    });
  } catch (e: any) {
    console.error('admin unified-data bulk', e);
    return NextResponse.json({ error: e.message || 'Failed to bulk create' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return withAdmin((r) => handlePost(r))(req);
}
