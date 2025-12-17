import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

// GET /api/admin/users - List all users
async function handleGetUsers(req: NextRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const roleFilter = searchParams.get('role') || '';

    // Build query
    const query: any = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
      ];
    }
    if (roleFilter) {
      query.role = roleFilter;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
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
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create new user
async function handleCreateUser(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { fullName, email, password, role, isActive, canUpload } = body;

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Full name, email, and password are required' },
        { status: 400 }
      );
    }

    // Only super-admin can create super-admin users
    if (role === 'super-admin' && req.user?.role !== 'super-admin') {
      return NextResponse.json(
        { error: 'Only super-admin can create super-admin users' },
        { status: 403 }
      );
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      fullName,
      email: email.toLowerCase(),
      passwordHash,
      role: role || 'e1-user',
      isActive: isActive !== undefined ? isActive : true,
      canUpload: canUpload !== undefined ? canUpload : true,
    });

    const userResponse = user.toObject();
    delete (userResponse as any).passwordHash;

    return NextResponse.json({
      success: true,
      data: userResponse,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetUsers);
export const POST = withAdmin(handleCreateUser);










