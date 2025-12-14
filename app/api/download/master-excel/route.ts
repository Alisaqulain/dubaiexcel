import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin } from '@/lib/middleware';
import { generateMasterExcel } from '@/lib/masterExcelGenerator';

async function handleDownloadMaster(req: NextRequest) {
  try {
    await connectDB();

    const workbook = await generateMasterExcel();

    // Convert workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="MASTER_SUMMARY_${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Download master error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate master Excel' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleDownloadMaster);

