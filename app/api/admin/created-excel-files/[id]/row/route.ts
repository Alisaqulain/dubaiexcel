import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import * as XLSX from 'xlsx';

/**
 * PATCH /api/admin/created-excel-files/[id]/row
 * Update a single cell in the file (e.g. for worker transfer - change login column value).
 * Body: { rowIndex: number (0-based data row), columnName: string, value: string }
 */
async function handlePatchRow(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const fileId = params.id;
    const body = await req.json();
    const { rowIndex, columnName, value } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }
    if (typeof rowIndex !== 'number' || rowIndex < 0) {
      return NextResponse.json({ error: 'rowIndex must be a non-negative number' }, { status: 400 });
    }
    if (typeof columnName !== 'string' || !columnName.trim()) {
      return NextResponse.json({ error: 'columnName is required' }, { status: 400 });
    }

    const file = await CreatedExcelFile.findById(fileId);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = Buffer.isBuffer(file.fileData)
      ? file.fileData
      : Buffer.from(file.fileData as any);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0] || {}) : [];

    const colIndex = headers.indexOf(columnName.trim());
    if (colIndex === -1) {
      return NextResponse.json(
        { error: `Column "${columnName}" not found in sheet` },
        { status: 400 }
      );
    }
    if (rowIndex >= jsonData.length) {
      return NextResponse.json(
        { error: 'rowIndex out of range' },
        { status: 400 }
      );
    }

    // Worksheet: row 0 = header, row 1+ = data. So data rowIndex -> sheet row rowIndex + 1
    const sheetRowIndex = rowIndex + 1;
    const colLetter = XLSX.utils.encode_col(colIndex);
    const cellRef = `${colLetter}${sheetRowIndex + 1}`; // A1 = header; first data row = A2
    if (!worksheet[cellRef]) {
      worksheet[cellRef] = { t: 's', v: String(value ?? '') };
    } else {
      (worksheet[cellRef] as XLSX.CellObject).v = String(value ?? '');
    }

    const newBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    (file as any).fileData = newBuffer;
    (file as any).lastEditedAt = new Date();
    if (req.user?.userId) {
      (file as any).lastEditedBy = req.user.userId;
    }
    await file.save();

    return NextResponse.json({
      success: true,
      data: { rowIndex, columnName: columnName.trim(), value: String(value ?? '') },
    });
  } catch (error: any) {
    console.error('Patch row error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update row' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handlePatchRow(authReq, context);
  });
  return handler(req);
}
