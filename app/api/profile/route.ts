import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import User from '@/models/User';

// GET /api/profile - Get current user profile
async function handleGetProfile(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const user = await User.findById(req.user?.userId).lean();
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user._id,
        email: (user as any).email,
        username: (user as any).username,
        name: (user as any).name,
        role: (user as any).role,
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get profile' },
      { status: 500 }
    );
  }
}

// PUT /api/profile - Update current user profile
async function handleUpdateProfile(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { name, username, email } = body;

    const user = await User.findById(req.user?.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update fields
    if (name !== undefined) user.name = name;
    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await User.findOne({ 
        username: username.toLowerCase(),
        _id: { $ne: user._id }
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 400 }
        );
      }
      user.username = username.toLowerCase();
    }
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: user._id }
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already taken' },
          { status: 400 }
        );
      }
      user.email = email.toLowerCase();
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'Username or email already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGetProfile);
export const PUT = withAuth(handleUpdateProfile);



