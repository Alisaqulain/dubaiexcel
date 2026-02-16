import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ProjectHead from '@/models/ProjectHead';
import SheetRow from '@/models/SheetRow';
import bcrypt from 'bcryptjs';

const DEFAULT_PASSWORD = 'Password@1234';

/**
 * GET /api/admin/projects
 * List all project heads with worker count per project.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const list = await ProjectHead.find({}).sort({ projectName: 1 }).lean();
    const counts = await Promise.all(
      list.map(async (p: any) => {
        const total = await SheetRow.countDocuments({ projectName: p.projectName });
        return { projectName: p.projectName, totalWorkers: total };
      })
    );
    const countMap = Object.fromEntries(counts.map((c) => [c.projectName, c.totalWorkers]));
    const data = list.map((p: any) => ({
      id: p._id.toString(),
      name: p.name,
      projectName: p.projectName,
      totalWorkers: countMap[p.projectName] ?? 0,
      createdAt: p.createdAt,
    }));
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('List projects error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list projects' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/projects
 * Create a new project head. Body: { name, projectName, password? }. Default password: Password@1234
 */
async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const name = String(body.name || '').trim();
    const projectName = String(body.projectName || '').trim();
    const password = body.password ? String(body.password) : DEFAULT_PASSWORD;

    if (!projectName) {
      return NextResponse.json({ error: 'projectName is required' }, { status: 400 });
    }

    const existing = await ProjectHead.findOne({ projectName });
    if (existing) {
      return NextResponse.json(
        { error: 'A project with this name already exists' },
        { status: 400 }
      );
    }

    const ph = await ProjectHead.create({
      name: name || projectName,
      projectName,
      password,
      role: 'project',
    });

    return NextResponse.json({
      success: true,
      data: {
        id: ph._id.toString(),
        name: ph.name,
        projectName: ph.projectName,
      },
    });
  } catch (error: any) {
    console.error('Create project error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create project' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return withAdmin(handleGet)(req);
}

export async function POST(req: NextRequest) {
  return withAdmin(handlePost)(req);
}
