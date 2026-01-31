import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Employee from '@/models/Employee';
import { generateToken } from '@/lib/jwt';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { loginIdentifier, email, username, password, loginType } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Support employee login (by Employee ID)
    // Try employee login if loginType is 'employee' or if identifier looks like an Employee ID (starts with EMP)
    const identifier = loginIdentifier || email || username;
    const isEmployeeLogin = loginType === 'employee' || (identifier && (identifier.toUpperCase().startsWith('EMP') || identifier.match(/^[A-Z0-9]+$/i)));
    
    if (isEmployeeLogin && identifier) {
      // Find employee by Employee ID - case-insensitive search
      // Try exact match first, then case-insensitive
      const empIdUpper = identifier.toUpperCase().trim();
      let employee = await Employee.findOne({ empId: empIdUpper })
        .select('+password')
        .lean();
      
      // If not found with uppercase, try case-insensitive regex search
      if (!employee) {
        employee = await Employee.findOne({ 
          empId: { $regex: new RegExp(`^${identifier.trim()}$`, 'i') }
        })
        .select('+password')
        .lean();
      }
      
      if (employee) {
        // Check if employee is active
        if (!employee.active) {
          return NextResponse.json(
            { error: 'Your account is inactive. Please contact administrator.' },
            { status: 403 }
          );
        }

        // Verify password
        if (!employee.password) {
          return NextResponse.json(
            { error: 'Employee account has no password set. Please contact administrator to set a password.' },
            { status: 403 }
          );
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, employee.password);
        if (!isPasswordValid) {
          return NextResponse.json(
            { error: 'Invalid Employee ID or password' },
            { status: 401 }
          );
        }

        // Password is valid, generate token
        const token = generateToken({
          userId: employee._id.toString(),
          email: employee.empId,
          role: 'employee',
        });

        return NextResponse.json({
          success: true,
          token,
          user: {
            id: employee._id,
            email: employee.empId,
            empId: employee.empId,
            role: 'employee',
            name: employee.name,
          },
        });
      }
      // If employee not found and loginType is employee, return error
      if (loginType === 'employee') {
        return NextResponse.json(
          { error: 'Invalid Employee ID or password' },
          { status: 401 }
        );
      }
    }

    // If not employee login or employee not found, try user login
    // Support both loginIdentifier (new) and email/username (legacy)
    if (!identifier) {
      return NextResponse.json(
        { error: 'Email, username, or Employee ID is required' },
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

