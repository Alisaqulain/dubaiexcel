import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import * as XLSX from 'xlsx';

/**
 * GET /api/admin/created-excel-files/[id]/unique-values?column=PROJECT%20NAME
 * Returns unique values from the given column (for "login column" setup).
 */
async function handleGetUniqueValues(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const fileId = params.id;
    const { searchParams } = new URL(req.url || '');
    const column = searchParams.get('column');

    if (!fileId || !column) {
      return NextResponse.json(
        { error: 'File ID and column name are required' },
        { status: 400 }
      );
    }

    const file = await CreatedExcelFile.findById(fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = Buffer.isBuffer(file.fileData)
      ? file.fileData
      : Buffer.from(file.fileData as any);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const row of jsonData) {
      const val = row[column];
      const s = val != null ? String(val).trim() : '';
      if (s !== '' && !seen.has(s)) {
        seen.add(s);
        unique.push(s);
      }
    }
    unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return NextResponse.json({
      success: true,
      data: { column, uniqueValues: unique },
    });
  } catch (error: any) {
    console.error('Unique values error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get unique values' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetUniqueValues(authReq, context);
  });
  return handler(req);
}
