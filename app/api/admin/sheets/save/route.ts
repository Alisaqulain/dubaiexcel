import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UploadedSheet from '@/models/UploadedSheet';
import SheetRow from '@/models/SheetRow';
import * as XLSX from 'xlsx';

const BATCH_SIZE = 500;

/**
 * POST /api/admin/sheets/save
 * Body: multipart form with file, name, loginColumnName.
 * Creates UploadedSheet and bulk-inserts SheetRows (batched for 40k+ rows).
 */
async function handleSave(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string)?.trim() || 'Sheet';
    const loginColumnName = (formData.get('loginColumnName') as string)?.trim();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!loginColumnName) {
      return NextResponse.json({ error: 'loginColumnName is required' }, { status: 400 });
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
    if (!headers.includes(loginColumnName)) {
      return NextResponse.json(
        { error: `Column "${loginColumnName}" not found in headers` },
        { status: 400 }
      );
    }

    const createdBy =
      req.user?.userId && mongoose.Types.ObjectId.isValid(req.user.userId)
        ? new mongoose.Types.ObjectId(req.user.userId)
        : undefined;
    const sheet = await UploadedSheet.create({
      name,
      loginColumnName,
      headers,
      rowCount: rawRows.length,
      createdBy,
    });
    const sheetId = sheet._id;

    for (let i = 0; i < rawRows.length; i += BATCH_SIZE) {
      const batch = rawRows.slice(i, i + BATCH_SIZE).map((row) => {
        const projectName = String(row[loginColumnName] ?? '').trim() || 'UNASSIGNED';
        return {
          sheetId,
          data: row,
          projectName,
          updatedAt: new Date(),
        };
      });
      await SheetRow.insertMany(batch);
    }

    return NextResponse.json({
      success: true,
      data: { sheetId: sheetId.toString(), rowCount: rawRows.length },
    });
  } catch (error: any) {
    console.error('Sheets save error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save sheet' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return withAdmin(handleSave)(req);
}
