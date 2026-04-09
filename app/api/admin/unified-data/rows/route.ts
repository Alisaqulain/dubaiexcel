import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { buildUnifiedRowFilter, type ListUnifiedRowsQuery } from '@/lib/unifiedDataQuery';
import { collectDynamicKeys, serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import { resolveActor } from '@/lib/unifiedDataActor';
import { emitRowUpdated } from '@/lib/unifiedDataSocket';

function parseListQuery(req: NextRequest): ListUnifiedRowsQuery & { page: number; limit: number } {
  const { searchParams } = new URL(req.url || '', 'http://localhost');
  const status = (searchParams.get('status') as ListUnifiedRowsQuery['status']) || 'active';
  const picked = (searchParams.get('picked') as ListUnifiedRowsQuery['picked']) || 'all';
  const search = searchParams.get('search') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
  return { status, picked, search, page, limit };
}

async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const q = parseListQuery(req);
    const filter = buildUnifiedRowFilter(
      { status: q.status, picked: q.picked, search: q.search },
      false
    );
    const skip = (q.page - 1) * q.limit;
    const [rows, total] = await Promise.all([
      UnifiedDataRow.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(q.limit)
        .populate('pickedBy', 'name empId')
        .lean(),
      UnifiedDataRow.countDocuments(filter),
    ]);
    const serialized = rows.map((r) => serializeUnifiedRow(r as Record<string, unknown>));
    const totalPages = Math.max(1, Math.ceil(total / q.limit));
    return NextResponse.json({
      success: true,
      data: {
        rows: serialized,
        dynamicKeys: collectDynamicKeys(serialized),
        pagination: { page: q.page, limit: q.limit, total, totalPages },
      },
    });
  } catch (e: any) {
    console.error('admin unified-data list', e);
    return NextResponse.json({ error: e.message || 'Failed to list rows' }, { status: 500 });
  }
}

async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const fields =
      body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)
        ? (body.fields as Record<string, unknown>)
        : {};
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const actor = await resolveActor(req);
    const doc = await UnifiedDataRow.create({
      name,
      fields,
      pickedBy: null,
      status: 'active',
      fileId: null,
      changeHistory: [],
      lastModifiedBy: actor.id,
      lastModifiedByLabel: actor.label,
      lastModifiedAt: new Date(),
    });
    const populated = await UnifiedDataRow.findById(doc._id).populate('pickedBy', 'name empId').lean();
    const row = serializeUnifiedRow(populated as Record<string, unknown>);
    emitRowUpdated(row);
    return NextResponse.json({ success: true, data: { row } });
  } catch (e: any) {
    console.error('admin unified-data create', e);
    return NextResponse.json({ error: e.message || 'Failed to create row' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAdmin((r) => handleGet(r))(req);
}

export async function POST(req: NextRequest) {
  return withAdmin((r) => handlePost(r))(req);
}
