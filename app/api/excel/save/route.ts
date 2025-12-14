import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFile from '@/models/ExcelFile';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';

async function handleSaveExcel(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { fileName, rows } = body;

    if (!fileName || !rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'FileName and rows data are required' },
        { status: 400 }
      );
    }

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    const colWidths = rows[0]?.map((_: string, colIndex: number) => {
      const maxLength = Math.max(
        ...rows.map((row: string[]) => (row[colIndex] || '').toString().length),
        10
      );
      return { wch: Math.min(maxLength + 2, 50) };
    }) || [];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Save to database
    const fileId = randomUUID();
    const excelFile = await ExcelFile.create({
      fileId,
      filename: `${fileName}.xlsx`,
      createdBy: req.user.userId as any,
      fileType: 'created',
      fileData: buffer,
      fileSize: buffer.length,
      rowCount: rows.length,
      status: 'active',
    });

    return NextResponse.json({
      success: true,
      message: 'Excel file saved successfully',
      file: {
        fileId: excelFile.fileId,
        filename: excelFile.filename,
        fileSize: excelFile.fileSize,
        rowCount: excelFile.rowCount,
        uploadedAt: excelFile.uploadedAt,
      },
    });
  } catch (error: any) {
    console.error('Save Excel error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save Excel file' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleSaveExcel);


