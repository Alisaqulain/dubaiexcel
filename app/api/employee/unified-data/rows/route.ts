import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withEmployee, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { buildUnifiedRowFilter } from '@/lib/unifiedDataQuery';
import { collectDynamicKeys, serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';

async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const picked = (searchParams.get('picked') || 'all') as 'yes' | 'no' | 'all';
    const search = searchParams.get('search') || '';
    const skip = (page - 1) * limit;

    const filter = buildUnifiedRowFilter({ status: 'active', picked, search }, true);

    const [rows, total] = await Promise.all([
      UnifiedDataRow.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('pickedBy', 'name empId')
        .lean(),
      UnifiedDataRow.countDocuments(filter),
    ]);

    const serialized = rows.map((r) => serializeUnifiedRow(r as Record<string, unknown>));
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      success: true,
      data: {
        rows: serialized,
        dynamicKeys: collectDynamicKeys(serialized),
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to list rows';
    console.error('employee unified-data list', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withEmployee((r) => handleGet(r))(req);
}
