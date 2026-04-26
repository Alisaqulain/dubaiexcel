import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import {
  parseClientDayRangeIso,
  parseDayRangeUtc,
  listCreatedFilesForFormatAndDayMetadata,
} from '@/lib/formatDailyMerge';
import mongoose from 'mongoose';

/**
 * GET /api/admin/saves-by-day?formatId=&date=YYYY-MM-DD
 * Optional: rangeStart, rangeEnd (ISO) for the browser’s local calendar day.
 * Lists employee saves for that format and work day (no file bytes).
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatId = searchParams.get('formatId')?.trim();
    let date = searchParams.get('date')?.trim() || '';
    const rangeStartQ = searchParams.get('rangeStart');
    const rangeEndQ = searchParams.get('rangeEnd');

    if (!formatId || !mongoose.Types.ObjectId.isValid(formatId)) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }
    const rangeFromClient = parseClientDayRangeIso(rangeStartQ, rangeEndQ);
    const range = rangeFromClient || parseDayRangeUtc(date);
    if (!range) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const docs = await listCreatedFilesForFormatAndDayMetadata(
      formatIdObj,
      range.start,
      range.end,
      date,
      null
    );

    const data = (docs as Record<string, unknown>[]).map((d) => {
      const createdBy = d.createdBy as Record<string, unknown> | undefined;
      let owner = '';
      if (createdBy && typeof createdBy === 'object') {
        const n = String(createdBy.name || '').trim();
        const e = String(createdBy.email || '').trim();
        owner = n && e ? `${n} (${e})` : n || e;
      }
      if (!owner) {
        const n = String(d.createdByName || '').trim();
        const e = String(d.createdByEmail || '').trim();
        owner = n && e ? `${n} (${e})` : n || e || '—';
      }
      return {
        _id: String(d._id),
        originalFilename: d.originalFilename,
        labourType: d.labourType,
        rowCount: d.rowCount,
        dailyWorkDate: d.dailyWorkDate,
        lastEditedAt: d.lastEditedAt,
        updatedAt: d.updatedAt,
        pickedTemplateRowIndices: d.pickedTemplateRowIndices,
        owner,
      };
    });

    return NextResponse.json({
      success: true,
      date,
      formatId,
      data,
    });
  } catch (e: unknown) {
    console.error('saves-by-day:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list saves' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return withAdmin((r: AuthenticatedRequest) => handleGet(r))(req);
}
