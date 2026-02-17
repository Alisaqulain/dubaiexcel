import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import mongoose from 'mongoose';

/**
 * GET /api/admin/emp-pick/picks?formatId=xxx
 * Returns which employee picked which row for a format (admin only).
 * Response: { success, data: { picks: Record<rowIndex, { empId, empName, pickedBy }> } }
 */
async function handleGetPicks(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatId = searchParams.get('formatId');
    if (!formatId) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const picks = await PickedTemplateRow.find({ formatId: formatIdObj }).lean();

    const picksByRow: Record<string, { empId: string; empName: string; pickedBy: string }> = {};
    picks.forEach((p: any) => {
      picksByRow[String(p.rowIndex)] = {
        empId: p.empId || '',
        empName: p.empName || 'Unknown',
        pickedBy: p.pickedBy?.toString() || '',
      };
    });

    return NextResponse.json({
      success: true,
      data: { picks: picksByRow },
    });
  } catch (error: any) {
    console.error('Admin get picks error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get picks' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return withAdmin(handleGetPicks)(req);
}
