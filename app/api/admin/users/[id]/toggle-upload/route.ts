import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import User from '@/models/User';

// POST /api/admin/users/:id/toggle-upload - Toggle user upload permission
async function handleToggleUpload(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const user = await User.findById(params.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    user.canUpload = !user.canUpload;
    await user.save();

    return NextResponse.json({
      success: true,
      data: {
        canUpload: user.canUpload,
      },
      message: `Upload access ${user.canUpload ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error: any) {
    console.error('Toggle upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to toggle upload permission' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleToggleUpload);





