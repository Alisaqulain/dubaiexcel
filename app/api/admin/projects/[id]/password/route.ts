import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ProjectHead from '@/models/ProjectHead';
import bcrypt from 'bcryptjs';

/**
 * PATCH /api/admin/projects/[id]/password
 * Body: { newPassword }
 */
async function handlePatch(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const body = await req.json();
    const newPassword = body.newPassword;
    if (!newPassword || String(newPassword).length < 6) {
      return NextResponse.json(
        { error: 'newPassword is required and must be at least 6 characters' },
        { status: 400 }
      );
    }

    const ph = await ProjectHead.findById(params.id);
    if (!ph) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    ph.password = await bcrypt.hash(String(newPassword), 10);
    await ph.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Change project password error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update password' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAdmin((authReq) => handlePatch(authReq, context))(req);
}
