import { NextRequest, NextResponse } from 'next/server';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import * as XLSX from 'xlsx';

const PREVIEW_ROW_LIMIT = 100;

/**
 * POST /api/admin/sheets/upload
 * Parse Excel file and return headers + preview rows for admin to choose login column.
 * No DB write. Body: multipart form with "file".
 */
async function handleUpload(req: AuthenticatedRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
    });

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'Excel file has no data rows' }, { status: 400 });
    }

    const headers = Object.keys(rawRows[0] as object);
    if (headers.length === 0) {
      return NextResponse.json({ error: 'No column headers found' }, { status: 400 });
    }

    const previewRows = rawRows.slice(0, PREVIEW_ROW_LIMIT);
    const uniqueByColumn: Record<string, string[]> = {};
    headers.forEach((h) => {
      const set = new Set<string>();
      rawRows.forEach((row) => {
        const v = row[h];
        if (v != null && String(v).trim() !== '') set.add(String(v).trim());
      });
      uniqueByColumn[h] = Array.from(set).sort();
    });

    return NextResponse.json({
      success: true,
      data: {
        headers,
        previewRows,
        totalRows: rawRows.length,
        uniqueByColumn,
      },
    });
  } catch (error: any) {
    console.error('Sheets upload parse error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse Excel' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return withAdmin(handleUpload)(req);
}
