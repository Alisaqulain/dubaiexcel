import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Role from '@/models/Role';

async function handleGetRoles(req: NextRequest) {
  try {
    await connectDB();

    const roles = await Role.find().sort({ name: 1 }).lean();

    return NextResponse.json({
      success: true,
      data: roles,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch roles' },
      { status: 500 }
    );
  }
}

async function handleCreateRole(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { name, allowedStatuses, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Role name is required' },
        { status: 400 }
      );
    }

    const role = await Role.create({
      name: name.toUpperCase(),
      allowedStatuses: allowedStatuses || ['Present', 'Absent', 'Leave'],
      description,
    });

    return NextResponse.json({
      success: true,
      data: role,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create role' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetRoles);
export const POST = withAdmin(handleCreateRole);

