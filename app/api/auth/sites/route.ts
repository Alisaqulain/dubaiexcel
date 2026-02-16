import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import ExcelFormat from '@/models/ExcelFormat';

/**
 * GET /api/auth/sites
 * Returns all files that have site options: either file has siteLogins, or file has formatId and format has loginColumnValues.
 * No auth required.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Files that have site logins configured on the file
    const filesWithSiteLogins = await CreatedExcelFile.find(
      { loginColumnName: { $exists: true, $ne: '' }, 'siteLogins.0': { $exists: true } },
      { originalFilename: 1, loginColumnName: 1, siteLogins: 1 }
    ).lean();

    // Files that have formatId (may have no siteLogins yet) – we'll use format's loginColumnValues
    const filesWithFormat = await CreatedExcelFile.find(
      { formatId: { $exists: true, $ne: null } },
      { _id: 1, originalFilename: 1, loginColumnName: 1, siteLogins: 1, formatId: 1 }
    ).lean();

    const list: { fileId: string; filename: string; loginColumnName: string; sites: { siteValue: string }[] }[] = [];

    // Add entries for files that have siteLogins (one entry per file)
    const addedFileIds = new Set<string>();
    for (const f of filesWithSiteLogins as any[]) {
      const fileId = f._id.toString();
      addedFileIds.add(fileId);
      list.push({
        fileId,
        filename: f.originalFilename,
        loginColumnName: f.loginColumnName || '',
        sites: (f.siteLogins || []).map((s: { siteValue: string }) => ({ siteValue: s.siteValue })),
      });
    }

    // For files with formatId, add sites from format's loginColumnValues if not already in list (or if file has no siteLogins)
    const formatIds = Array.from(new Set((filesWithFormat as any[]).map((f: any) => f.formatId?.toString()).filter(Boolean)));
    const formats = formatIds.length
      ? await ExcelFormat.find({ _id: { $in: formatIds } }).select('_id loginColumnName loginColumnValues siteGroups').lean()
      : [];
    const formatMap = new Map(formats.map((fmt: any) => [fmt._id.toString(), fmt]));

    for (const f of filesWithFormat as any[]) {
      const fileId = f._id.toString();
      const siteLogins = f.siteLogins || [];
      const format = f.formatId ? formatMap.get(f.formatId.toString()) : null;
      const siteGroups = (format as any)?.siteGroups;
      const hasSiteGroups = Array.isArray(siteGroups) && siteGroups.length > 0;
      const formatSites = hasSiteGroups
        ? siteGroups.filter((g: any) => g?.siteName && String(g.siteName).trim()).map((g: any) => ({ siteValue: String(g.siteName).trim() }))
        : (format && (format as any).loginColumnValues && Array.isArray((format as any).loginColumnValues))
          ? (format as any).loginColumnValues.filter((v: string) => String(v).trim()).map((v: string) => ({ siteValue: String(v).trim() }))
          : [];

      if (siteLogins.length > 0) {
        // Already added above from filesWithSiteLogins
        continue;
      }
      if (formatSites.length === 0) continue;

      const loginColumnName = (format as any)?.loginColumnName || f.loginColumnName || '';
      if (!loginColumnName) continue;

      list.push({
        fileId,
        filename: f.originalFilename,
        loginColumnName,
        sites: formatSites,
      });
    }

    return NextResponse.json({
      success: true,
      data: list,
    });
  } catch (error: any) {
    console.error('List sites error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list sites' },
      { status: 500 }
    );
  }
}
