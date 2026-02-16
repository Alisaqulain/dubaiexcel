import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProjectHead from '@/models/ProjectHead';

/**
 * GET /api/auth/project-heads
 * Returns list of project names (and display name) for Project Head login dropdown.
 */
export async function GET() {
  try {
    await connectDB();
    const list = await ProjectHead.find({})
      .select('projectName name')
      .sort({ projectName: 1 })
      .lean();
    return NextResponse.json({
      success: true,
      data: list.map((p: any) => ({
        projectName: p.projectName,
        name: p.name || p.projectName,
      })),
    });
  } catch (error: any) {
    console.error('List project heads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list projects' },
      { status: 500 }
    );
  }
}
