import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

// GET /api/admin/users/:id - Get user by ID
async function handleGetUser(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const user = await User.findById(params.id).select('-passwordHash').lean();

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/users/:id - Update user
async function handleUpdateUser(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const body = await req.json();
    const { fullName, email, role, isActive, canUpload } = body;

    const user = await User.findById(params.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only super-admin can assign super-admin role
    if (role === 'super-admin' && req.user?.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Only super-admin can assign super-admin role' },
        { status: 403 }
      );
    }

    // Prevent non-super-admin from changing existing super-admin role
    if (user.role === 'super-admin' && role !== 'super-admin' && req.user?.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Only super-admin can modify super-admin users' },
        { status: 403 }
      );
    }

    // Update fields
    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: params.id } });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
      user.email = email.toLowerCase();
    }
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (canUpload !== undefined) user.canUpload = canUpload;

    await user.save();

    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return NextResponse.json({
      success: true,
      data: userResponse,
    });
  } catch (error: any) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/:id - Delete user
async function handleDeleteUser(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    // Prevent deleting yourself
    if (params.id === req.user?.userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndDelete(params.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}

// Wrappers to handle Next.js dynamic route context
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetUser(authReq, context);
  });
  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleUpdateUser(authReq, context);
  });
  return handler(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleDeleteUser(authReq, context);
  });
  return handler(req);
}

