import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withEmployee, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { collectDynamicKeys, serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import mongoose from 'mongoose';

/** Alias for scope=my — explicit "My picks" dashboard URL. */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));
    const skip = (page - 1) * limit;

    const filter = {
      status: 'active' as const,
      pickedBy: new mongoose.Types.ObjectId(userId),
    };

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
  } catch (e: any) {
    console.error('employee unified-data my-picks', e);
    return NextResponse.json({ error: e.message || 'Failed to load picks' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withEmployee((r) => handleGet(r))(req);
}
