import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import mongoose from 'mongoose';

/**
 * GET /api/admin/format-merge-dates?formatId=
 * Calendar days (YYYY-MM-DD) that have at least one non-merged save for this format,
 * derived from dailyWorkDate and day-stamped filenames. Newest first.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatId = searchParams.get('formatId');
    if (!formatId || !mongoose.Types.ObjectId.isValid(formatId)) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const docs = await CreatedExcelFile.find({
      formatId: formatIdObj,
      isMerged: { $ne: true },
    })
      .select('dailyWorkDate originalFilename')
      .lean();

    const counts = new Map<string, number>();
    const daySuffix = /_(\d{4}-\d{2}-\d{2})\.xlsx$/i;

    for (const d of docs as Array<{ dailyWorkDate?: string; originalFilename?: string }>) {
      let ymd: string | null = null;
      const dw = String(d.dailyWorkDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dw)) ymd = dw;
      if (!ymd) {
        const m = String(d.originalFilename || '').trim().match(daySuffix);
        if (m) ymd = m[1];
      }
      if (ymd) counts.set(ymd, (counts.get(ymd) || 0) + 1);
    }

    const dates = Array.from(counts.keys()).sort((a, b) => b.localeCompare(a));
    const countsObj: Record<string, number> = {};
    counts.forEach((v, k) => {
      countsObj[k] = v;
    });

    return NextResponse.json({
      success: true,
      data: { dates, counts: countsObj },
    });
  } catch (e: any) {
    console.error('format-merge-dates:', e);
    return NextResponse.json({ error: e.message || 'Failed to list merge dates' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAdmin((r: AuthenticatedRequest) => handleGet(r))(req);
}
