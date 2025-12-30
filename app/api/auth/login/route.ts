import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/jwt';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { loginIdentifier, email, username, password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Support both loginIdentifier (new) and email/username (legacy)
    const identifier = loginIdentifier || email || username;
    
    if (!identifier) {
      return NextResponse.json(
        { error: 'Email or username is required' },
        { status: 400 }
      );
    }

    // Find user by email or username - use lean() to get raw document with all fields
    const query = {
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    };
    const user = await User.findOne(query).lean();
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check active status (support both 'active' and 'isActive' fields)
    const isActive = (user as any).active !== false && (user as any).isActive !== false;
    if (!isActive) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      );
    }

    // Get hashed password (support both 'password' and 'passwordHash')
    const hashedPassword = (user as any).password || (user as any).passwordHash;
    if (!hashedPassword) {
      console.error('User has no password field:', Object.keys(user));
      return NextResponse.json(
        { error: 'Invalid user account configuration' },
        { status: 500 }
      );
    }

    // Verify password using bcrypt directly
    const isPasswordValid = await bcrypt.compare(password, hashedPassword);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      email: (user as any).email,
      role: (user as any).role || 'uploader',
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: (user as any).email,
        username: (user as any).username,
        role: (user as any).role || 'uploader',
        name: (user as any).name || (user as any).fullName,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}

