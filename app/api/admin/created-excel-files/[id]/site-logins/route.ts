import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import bcrypt from 'bcryptjs';

const DEFAULT_SITE_PASSWORD = 'Password@1234';

/**
 * GET /api/admin/created-excel-files/[id]/site-logins
 * Returns loginColumnName and list of sites (siteValue only; no password).
 */
async function handleGetSiteLogins(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const file = await CreatedExcelFile.findById(params.id);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const doc = file as any;
    const siteLogins = (doc.siteLogins || []).map((s: { siteValue: string }) => ({ siteValue: s.siteValue }));
    return NextResponse.json({
      success: true,
      data: {
        loginColumnName: doc.loginColumnName || '',
        sites: siteLogins,
      },
    });
  } catch (error: any) {
    console.error('Get site logins error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get site logins' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/created-excel-files/[id]/site-logins
 * Body: { loginColumnName: string, sites: { siteValue: string, password?: string }[] }
 * Passwords are hashed. Omit password to keep existing or use default Password@1234.
 */
async function handlePutSiteLogins(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const file = await CreatedExcelFile.findById(params.id);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const body = await req.json();
    const { loginColumnName, sites } = body;
    if (typeof loginColumnName !== 'string') {
      return NextResponse.json(
        { error: 'loginColumnName is required' },
        { status: 400 }
      );
    }
    if (!Array.isArray(sites)) {
      return NextResponse.json(
        { error: 'sites must be an array' },
        { status: 400 }
      );
    }

    const existing = (file as any).siteLogins || [];
    const existingByValue = new Map<string, { siteValue: string; passwordHash: string }>(
      existing.map((s: any) => [s.siteValue, { siteValue: s.siteValue, passwordHash: s.passwordHash }])
    );

    const siteLogins = await Promise.all(
      sites.map(async (s: { siteValue: string; password?: string }) => {
        const siteValue = String(s?.siteValue ?? '').trim();
        if (!siteValue) return null;
        let passwordHash = existingByValue.get(siteValue)?.passwordHash;
        const newPassword = s.password;
        if (newPassword !== undefined && newPassword !== '') {
          passwordHash = await bcrypt.hash(newPassword, 10);
        } else if (!passwordHash) {
          passwordHash = await bcrypt.hash(DEFAULT_SITE_PASSWORD, 10);
        }
        return { siteValue, passwordHash };
      })
    );

    const filtered = siteLogins.filter(Boolean) as { siteValue: string; passwordHash: string }[];
    (file as any).loginColumnName = loginColumnName.trim() || undefined;
    (file as any).siteLogins = filtered;
    await file.save();

    return NextResponse.json({
      success: true,
      data: {
        loginColumnName: (file as any).loginColumnName,
        sites: filtered.map((s) => ({ siteValue: s.siteValue })),
      },
    });
  } catch (error: any) {
    console.error('Put site logins error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save site logins' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/created-excel-files/[id]/site-logins
 * Single: { siteValue: string, newPassword: string }
 * Bulk: { newPassword: string } — sets all sites to this password
 */
async function handlePatchSiteLogins(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const file = await CreatedExcelFile.findById(params.id);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const body = await req.json();
    const { siteValue, newPassword } = body;
    const sites = (file as any).siteLogins || [];
    if (typeof newPassword !== 'string' || !newPassword.trim()) {
      return NextResponse.json(
        { error: 'newPassword is required' },
        { status: 400 }
      );
    }
    const hash = await bcrypt.hash(newPassword.trim(), 10);
    if (siteValue !== undefined && siteValue !== null && String(siteValue).trim() !== '') {
      const value = String(siteValue).trim();
      const idx = sites.findIndex((s: any) => String(s.siteValue).trim() === value);
      if (idx === -1) {
        return NextResponse.json(
          { error: 'Site not found' },
          { status: 404 }
        );
      }
      (file as any).siteLogins[idx].passwordHash = hash;
    } else {
      (file as any).siteLogins = sites.map((s: any) => ({ siteValue: s.siteValue, passwordHash: hash }));
    }
    await file.save();
    return NextResponse.json({
      success: true,
      data: { updated: siteValue != null && String(siteValue).trim() !== '' ? 1 : sites.length },
    });
  } catch (error: any) {
    console.error('Patch site logins error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update password(s)' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetSiteLogins(authReq, context);
  });
  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handlePutSiteLogins(authReq, context);
  });
  return handler(req);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handlePatchSiteLogins(authReq, context);
  });
  return handler(req);
}
