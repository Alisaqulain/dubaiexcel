import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/jwt';
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { email, password, role, name, username } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check if registration is restricted to admins only
    // If ALLOW_PUBLIC_REGISTRATION is not set to 'true', require admin authentication
    const allowPublicRegistration = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';
    
    if (!allowPublicRegistration) {
      // Require admin authentication
      const authHeader = request.headers.get('authorization');
      const token = extractTokenFromHeader(authHeader);

      if (!token) {
        return NextResponse.json(
          { error: 'Admin authentication required. Only admins can create accounts.' },
          { status: 401 }
        );
      }

      try {
        const decoded = verifyToken(token);
        // Verify the user is an admin
        const adminUser = await User.findOne({ email: decoded.email }).lean();
        if (!adminUser || (adminUser as any).role !== 'admin') {
          return NextResponse.json(
            { error: 'Admin access required. Only admins can create accounts.' },
            { status: 403 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid or expired admin token. Only admins can create accounts.' },
          { status: 401 }
        );
      }
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    // Check if username is already taken (if provided)
    if (username) {
      const existingUsername = await User.findOne({ username: username.toLowerCase() }).lean();
      if (existingUsername) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 400 }
        );
      }
    }

    // Create user - validate role
    const validRoles = ['super-admin', 'admin', 'user'];
    let userRole = role || 'user';
    
    // Only allow super-admin to create other super-admins
    if (userRole === 'super-admin' && !allowPublicRegistration) {
      try {
        const authHeader = request.headers.get('authorization');
        const token = extractTokenFromHeader(authHeader);
        if (token) {
          const decoded = verifyToken(token);
          const adminUser = await User.findOne({ email: decoded.email }).lean();
          if ((adminUser as any)?.role !== 'super-admin') {
            userRole = 'user'; // Downgrade to user if not super-admin
          }
        } else {
          userRole = 'user'; // No token means can't create super-admin
        }
      } catch {
        userRole = 'user'; // Invalid token means can't create super-admin
      }
    }
    
    if (!validRoles.includes(userRole)) {
      userRole = 'user';
    }
    
    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      username: username ? username.toLowerCase() : undefined,
      password,
      role: userRole,
      name: name || email.split('@')[0],
      active: true,
    });

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    );
  }
}

