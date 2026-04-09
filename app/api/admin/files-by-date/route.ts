import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import '@/models/ExcelFormat';
import { parseClientDayRangeIso, parseDayRangeUtc } from '@/lib/formatDailyMerge';

/**
 * GET /api/admin/files-by-date?date=YYYY-MM-DD
 * Optional: rangeStart & rangeEnd (ISO) from browser for correct local calendar day.
 * Lists employee/user saved Excel files (CreatedExcelFile) touched on that day — same pool used for daily merge.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    let date = searchParams.get('date') || '';
    const rangeStartQ = searchParams.get('rangeStart');
    const rangeEndQ = searchParams.get('rangeEnd');

    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    const rangeFromClient = parseClientDayRangeIso(rangeStartQ, rangeEndQ);
    const range = rangeFromClient || parseDayRangeUtc(date);
    if (!range) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const files = await CreatedExcelFile.find({
      isMerged: { $ne: true },
      $or: [
        { lastEditedAt: { $gte: range.start, $lte: range.end } },
        { updatedAt: { $gte: range.start, $lte: range.end } },
        { createdAt: { $gte: range.start, $lte: range.end } },
      ],
    })
      .select('-fileData')
      .populate('formatId', 'name')
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();

    const data = files.map((f: any) => {
      const uploadTime = f.lastEditedAt || f.updatedAt || f.createdAt;
      const fmt = f.formatId;
      const formatName =
        fmt && typeof fmt === 'object' && fmt.name != null ? String(fmt.name) : '';
      const formatIdStr =
        fmt && typeof fmt === 'object' && fmt._id != null
          ? String(fmt._id)
          : f.formatId != null && typeof f.formatId !== 'object'
            ? String(f.formatId)
            : '';

      const createdByLabel =
        [f.createdByName, f.createdByEmail].filter(Boolean).join(' · ') || '';

      return {
        id: String(f._id),
        fileName: String(f.originalFilename || f.filename || 'file.xlsx'),
        uploadTime: uploadTime ? new Date(uploadTime).toISOString() : null,
        formatId: formatIdStr || null,
        formatName: formatName || null,
        rowCount: typeof f.rowCount === 'number' ? f.rowCount : 0,
        labourType: f.labourType || null,
        createdByLabel,
        isMerged: !!f.isMerged,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        date,
        rangeStart: range.start.toISOString(),
        rangeEnd: range.end.toISOString(),
        count: data.length,
        files: data,
      },
    });
  } catch (e: any) {
    console.error('files-by-date:', e);
    return NextResponse.json({ error: e.message || 'Failed to list files' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAdmin((r: AuthenticatedRequest) => handleGet(r))(req);
}
