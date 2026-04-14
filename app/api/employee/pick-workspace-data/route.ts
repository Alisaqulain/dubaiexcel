import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, type AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import {
  getTemplateRowsByOriginalIndices,
  TEMPLATE_ROW_INDEX,
} from '@/lib/formatTemplateRows';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

const DAILY_NAME_RE = /_[0-9]{4}-[0-9]{2}-[0-9]{2}\.xlsx$/i;

function isDailyWorkFilename(name: string): boolean {
  return DAILY_NAME_RE.test((name || '').trim());
}

function hasPickRowIndices(f: {
  formatId?: unknown;
  pickedTemplateRowIndices?: unknown;
}): boolean {
  return !!(
    f.formatId &&
    Array.isArray(f.pickedTemplateRowIndices) &&
    (f.pickedTemplateRowIndices as unknown[]).length > 0
  );
}

function rowsFromFileBuffer(buf: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const first = workbook.SheetNames[0];
  const sheet = workbook.Sheets[first];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
}

function toBufferOrNull(fileData: unknown): Buffer | null {
  if (!fileData) return null;
  if (Buffer.isBuffer(fileData)) return fileData;

  // ArrayBuffer / TypedArray (common for binary in some serializers)
  if (fileData instanceof ArrayBuffer) return Buffer.from(new Uint8Array(fileData));
  if (ArrayBuffer.isView(fileData)) {
    const view = fileData as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }

  // Sometimes binary is stored/returned as a string (e.g. base64)
  if (typeof fileData === 'string') {
    const s = fileData.trim();
    if (!s) return null;
    try {
      return Buffer.from(s, 'base64');
    } catch {
      return Buffer.from(s);
    }
  }

  return null;
}

const MAX_DAY_FILES = 50;

/**
 * GET ?pickFileId=...
 * My picks → Work with this: HR/template baseline + chronological day saves;
 * for columns with editable===true, later saves overwrite earlier (latest wins per cell).
 */
async function handlePickWorkspace(req: AuthenticatedRequest): Promise<NextResponse> {
  try {
    await connectDB();
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.nextUrl);
    const pickFileId = url.searchParams.get('pickFileId')?.trim();
    if (!pickFileId || !mongoose.Types.ObjectId.isValid(pickFileId)) {
      return NextResponse.json({ error: 'pickFileId is required' }, { status: 400 });
    }

    const userIdObj = new mongoose.Types.ObjectId(userId as string);
    const pickDoc = await CreatedExcelFile.findById(pickFileId).select('+fileData').lean();
    if (!pickDoc) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    if ((pickDoc as any).createdBy?.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formatId = (pickDoc as any).formatId as mongoose.Types.ObjectId | undefined;
    if (!formatId) {
      return NextResponse.json({ error: 'Pick file has no format' }, { status: 400 });
    }

    const pickIndices = Array.isArray((pickDoc as any).pickedTemplateRowIndices)
      ? ([...(pickDoc as any).pickedTemplateRowIndices] as number[]).filter(
          (n) => typeof n === 'number' && n >= 0
        )
      : [];

    const [fmt, templateData] = await Promise.all([
      ExcelFormat.findById(formatId).select('columns').lean(),
      FormatTemplateData.findOne({ formatId }).select('rows').lean(),
    ]);

    const columns = ((fmt as any)?.columns || []) as { name: string; editable?: boolean }[];
    const editableNames = columns
      .filter((c) => c && c.editable === true && c.name)
      .map((c) => String(c.name).trim());

    const allTemplateRows = templateData?.rows as unknown[] | undefined;
    const templateByIndex =
      pickIndices.length > 0 && allTemplateRows
        ? getTemplateRowsByOriginalIndices(allTemplateRows, pickIndices)
        : {};

    const pickBuf = toBufferOrNull((pickDoc as any).fileData);
    const pickRows = pickBuf ? rowsFromFileBuffer(pickBuf) : [];
    const canFallbackToTemplate =
      !pickBuf && pickIndices.length > 0 && allTemplateRows && Object.keys(templateByIndex).length > 0;

    if (!pickBuf && !canFallbackToTemplate) {
      return NextResponse.json(
        {
          error:
            'Pick file data is missing or invalid. Please re-save your pick file (or contact admin to repair this record).',
        },
        { status: 400 }
      );
    }

    const rowCount = pickIndices.length > 0 ? pickIndices.length : pickRows.length;

    const merged: Record<string, unknown>[] = [];
    for (let i = 0; i < rowCount; i++) {
      const tIdx = pickIndices[i];
      const fromT =
        typeof tIdx === 'number' && templateByIndex[String(tIdx)]
          ? { ...(templateByIndex[String(tIdx)] as Record<string, unknown>) }
          : pickRows[i] && typeof pickRows[i] === 'object'
            ? { ...(pickRows[i] as Record<string, unknown>) }
            : ({} as Record<string, unknown>);
      if (typeof tIdx === 'number' && tIdx >= 0) {
        fromT[TEMPLATE_ROW_INDEX] = tIdx;
      }
      merged.push(fromT);
    }

    const candidates = await CreatedExcelFile.find({
      createdBy: userIdObj,
      formatId,
      isMerged: { $ne: true },
      _id: { $ne: new mongoose.Types.ObjectId(pickFileId) },
    })
      .sort({ updatedAt: 1 })
      .select('+fileData originalFilename pickedTemplateRowIndices dailyWorkDate updatedAt')
      .lean();

    const daySaves = candidates.filter((f: any) => {
      if (hasPickRowIndices(f) && !isDailyWorkFilename(f.originalFilename || '')) {
        return false;
      }
      return isDailyWorkFilename(f.originalFilename || '') || !!f.dailyWorkDate;
    });

    const asc = [...daySaves].sort(
      (a: any, b: any) =>
        new Date(a.updatedAt || a.createdAt).getTime() -
        new Date(b.updatedAt || b.createdAt).getTime()
    );
    const toMerge = asc.length > MAX_DAY_FILES ? asc.slice(-MAX_DAY_FILES) : asc;

    for (const doc of toMerge) {
      const b = toBufferOrNull((doc as any).fileData);
      if (!b) continue;
      let sheetRows: Record<string, unknown>[];
      try {
        sheetRows = rowsFromFileBuffer(b);
      } catch {
        continue;
      }
      for (let i = 0; i < merged.length && i < sheetRows.length; i++) {
        const patch = sheetRows[i];
        for (const col of editableNames) {
          if (Object.prototype.hasOwnProperty.call(patch, col)) {
            merged[i][col] = patch[col];
          }
        }
        const tIdx = pickIndices[i];
        if (typeof tIdx === 'number' && tIdx >= 0) {
          merged[i][TEMPLATE_ROW_INDEX] = tIdx;
        }
      }
    }

    const ymd = (() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    })();

    const todayDaily = [...daySaves]
      .filter((f: any) => {
        if (f.dailyWorkDate === ymd) return true;
        const m = (f.originalFilename || '').match(/_([0-9]{4}-[0-9]{2}-[0-9]{2})\.xlsx$/i);
        if (m && m[1] === ymd) return true;
        const lu = new Date(f.lastEditedAt || f.updatedAt || f.createdAt);
        const p = (n: number) => String(n).padStart(2, '0');
        const fy = `${lu.getFullYear()}-${p(lu.getMonth() + 1)}-${p(lu.getDate())}`;
        return fy === ymd;
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.updatedAt || b.lastEditedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.lastEditedAt || a.createdAt).getTime()
      )[0] as any;

    const editingFileId = todayDaily?._id?.toString?.() || pickFileId;
    const editingFilename =
      todayDaily?.originalFilename || (pickDoc as any).originalFilename || '';

    return NextResponse.json({
      success: true,
      data: {
        rows: merged,
        pickedTemplateRowIndices: pickIndices.length > 0 ? pickIndices : undefined,
        formatId: formatId.toString(),
        editingFileId,
        editingFilename,
      },
    });
  } catch (e: any) {
    console.error('pick-workspace-data:', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to build workspace' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handlePickWorkspace);
