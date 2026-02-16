import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ProjectHead from '@/models/ProjectHead';
import bcrypt from 'bcryptjs';

const DEFAULT_PASSWORD = 'Password@1234';

/**
 * POST /api/admin/projects/bulk-password-reset
 * Body: { projectIds: string[], newPassword? }. If newPassword omitted, use default Password@1234
 */
async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const projectIds = body.projectIds;
    const newPassword = body.newPassword ? String(body.newPassword) : DEFAULT_PASSWORD;

    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json(
        { error: 'projectIds array is required and must not be empty' },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'newPassword must be at least 6 characters' },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const result = await ProjectHead.updateMany(
      { _id: { $in: projectIds } },
      { $set: { password: hash } }
    );

    return NextResponse.json({
      success: true,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error: any) {
    console.error('Bulk password reset error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset passwords' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return withAdmin(handlePost)(req);
}
