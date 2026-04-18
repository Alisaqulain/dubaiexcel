import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import {
  parseDayRangeUtc,
  mergeDailyFileRows,
  loadCreatedFilesForFormatAndDay,
} from '@/lib/formatDailyMerge';
import mongoose from 'mongoose';

async function employeeHasFormat(userId: string, role: string | undefined, formatId: string): Promise<boolean> {
  const oid = new mongoose.Types.ObjectId(userId);
  const query: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(formatId),
    active: true,
    assignedToType: { $ne: 'none' },
    $or: [{ assignedToType: 'all' }],
  };
  if (role === 'employee') {
    (query.$or as unknown[]).push({ assignedToType: 'employee', assignedTo: oid });
  } else {
    (query.$or as unknown[]).push({ assignedToType: 'user', assignedTo: oid });
  }
  const f = await ExcelFormat.findOne(query).select('_id').lean();
  return !!f;
}

/**
 * GET /api/employee/format-daily-merge?formatId=&date=YYYY-MM-DD
 * All employees' saved rows for this format on that day (UTC), with Submitted by on each row.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatId = searchParams.get('formatId');
    let date = searchParams.get('date') || '';
    if (!date) {
      const now = new Date();
      date = now.toISOString().slice(0, 10);
    }

    if (!formatId || !mongoose.Types.ObjectId.isValid(formatId)) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }

    const range = parseDayRangeUtc(date);
    if (!range) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const allowed = await employeeHasFormat(userId, req.user?.role, formatId);
    if (!allowed) {
      return NextResponse.json({ error: 'Format not found or not assigned to you' }, { status: 403 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const docs = await loadCreatedFilesForFormatAndDay(formatIdObj, range.start, range.end, date);
    const { rows, columnOrder } = mergeDailyFileRows(docs as any[], {
      includeSourceFileIds: false,
    });

    const fmt = await ExcelFormat.findById(formatIdObj).select('name').lean();

    return NextResponse.json({
      success: true,
      data: {
        date,
        formatId,
        formatName: (fmt as any)?.name || '',
        fileCount: docs.length,
        rowCount: rows.length,
        columns: columnOrder,
        rows,
      },
    });
  } catch (e: any) {
    console.error('format-daily-merge employee:', e);
    return NextResponse.json({ error: e.message || 'Failed to load merge data' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAuth((r: AuthenticatedRequest) => handleGet(r))(req);
}
