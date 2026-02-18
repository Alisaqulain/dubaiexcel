import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import User from '@/models/User';

/**
 * GET /api/admin/users
 * Get all users with optional search and pagination
 */
async function handleGetUsers(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || '';

    const query: any = {};

    // Search by email, username, or name
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: users.map(user => ({
        id: user._id,
        email: (user as any).email,
        username: (user as any).username,
        name: (user as any).name,
        role: (user as any).role,
        active: (user as any).active !== false,
        createdAt: (user as any).createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get users' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetUsers(authReq);
  });
  return handler(req);
}