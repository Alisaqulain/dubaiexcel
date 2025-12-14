import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import User from '@/models/User';

// POST /api/admin/users/:id/toggle-active - Toggle user active status
async function handleToggleActive(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    // Prevent deactivating yourself
    if (params.id === req.user?.userId) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      );
    }

    const user = await User.findById(params.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    user.isActive = !user.isActive;
    await user.save();

    return NextResponse.json({
      success: true,
      data: {
        isActive: user.isActive,
      },
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    console.error('Toggle active error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to toggle user status' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleToggleActive);





