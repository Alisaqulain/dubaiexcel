import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import Employee from '@/models/Employee';
import '@/models/User';

/**
 * GET /api/admin/created-excel-files
 * Get all created Excel files (Admin only)
 */
async function handleGetCreatedExcelFiles(req: AuthenticatedRequest) {
  try {
    await connectDB();

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const labourType = searchParams.get('labourType');
    const rangeStart = searchParams.get('rangeStart');
    const rangeEnd = searchParams.get('rangeEnd');
    const formatId = searchParams.get('formatId');
    const isMergedParam = searchParams.get('isMerged');
    const cleanParam = searchParams.get('clean');
    const qFilename = searchParams.get('q')?.trim();
    const limit = parseInt(searchParams.get('limit') || '1000'); // Increased limit to show more files
    const skip = parseInt(searchParams.get('skip') || '0');
    const cleanOnly = cleanParam === '1' || cleanParam === 'true';
    const groupByDay =
      (searchParams.get('groupByDay') === '1' || searchParams.get('groupByDay') === 'true') &&
      cleanOnly &&
      isMergedParam === 'false';
    const GROUP_SCAN_LIMIT = 8000;

    // Build query - include all files (both employee-saved and admin-uploaded)
    const query: any = {};
    if (qFilename && !groupByDay) {
      const esc = qFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.originalFilename = new RegExp(esc, 'i');
    }
    if (labourType && ['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'].includes(labourType)) {
      query.labourType = labourType;
    }
    if (formatId) {
      query.formatId = formatId;
    }
    if (isMergedParam === 'true') query.isMerged = true;
    if (isMergedParam === 'false') query.isMerged = false;

    if (cleanOnly && isMergedParam === 'false') {
      // Clean list: only day-save files, exclude pick snapshots.
      if (!query.$and) query.$and = [];
      query.$and.push({ originalFilename: { $not: /^my_pick_/i } });
      query.$and.push({
        $or: [
          { dailyWorkDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ } },
          { originalFilename: /_[0-9]{4}-[0-9]{2}-[0-9]{2}\.xlsx$/i },
        ],
      });
    }
    if (rangeStart || rangeEnd) {
      const createdAt: any = {};
      if (rangeStart) {
        const d = new Date(rangeStart);
        if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
      }
      if (rangeEnd) {
        const d = new Date(rangeEnd);
        if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
      }
      if (Object.keys(createdAt).length) query.createdAt = createdAt;
    }

    // Get files with pagination, organized by date (newest first, merged files after originals)
    const files = await CreatedExcelFile.find(query)
      .select('-fileData') // Don't include file data in list (too large)
      .populate('createdBy', 'name email')
      .populate('formatId', 'name')
      .sort(
        groupByDay
          ? { updatedAt: -1 }
          : {
              isMerged: 1, // Original files first (false < true)
              createdAt: -1, // Then by date, newest first
            }
      )
      .limit(groupByDay ? GROUP_SCAN_LIMIT : limit)
      .skip(groupByDay ? 0 : skip)
      .lean();

    // Backfill mergeCount for files that don't have it set
    // Count how many times each file appears in mergedFrom arrays
    const allMergedFiles = await CreatedExcelFile.find({ isMerged: true })
      .select('mergedFrom')
      .lean();
    
    const mergeCountMap = new Map<string, number>();
    allMergedFiles.forEach((mergedFile: any) => {
      if (mergedFile.mergedFrom && Array.isArray(mergedFile.mergedFrom)) {
        mergedFile.mergedFrom.forEach((fileId: any) => {
          const idStr = fileId.toString();
          mergeCountMap.set(idStr, (mergeCountMap.get(idStr) || 0) + 1);
        });
      }
    });

    // Update mergeCount for files that need it
    const filesToUpdate: string[] = [];
    files.forEach((file: any) => {
      const fileIdStr = file._id.toString();
      const calculatedCount = mergeCountMap.get(fileIdStr) || 0;
      if (file.mergeCount === undefined || file.mergeCount === null || file.mergeCount !== calculatedCount) {
        filesToUpdate.push(fileIdStr);
        file.mergeCount = calculatedCount;
      }
    });

    // Batch update files that need mergeCount set/updated
    if (filesToUpdate.length > 0) {
      await Promise.all(filesToUpdate.map(async (fileIdStr) => {
        const calculatedCount = mergeCountMap.get(fileIdStr) || 0;
        await CreatedExcelFile.updateOne(
          { _id: fileIdStr },
          { $set: { mergeCount: calculatedCount } }
        );
      }));
    }

    // Enhance files with employee info if createdBy is not populated (means it's an employee)
    const enhancedFiles = await Promise.all(files.map(async (file: any) => {
      // Ensure mergeCount is always defined (default to 0 if not set)
      if (file.mergeCount === undefined || file.mergeCount === null) {
        file.mergeCount = 0;
      }
      
      // If createdBy is not populated (null or string ID), try to get employee info
      if (!file.createdBy || typeof file.createdBy === 'string') {
        try {
          const employee = await Employee.findById(file.createdBy || file.createdBy).lean();
          if (employee) {
            file.createdBy = {
              _id: employee._id,
              name: (employee as any).name,
              email: (employee as any).empId,
            };
            // Also ensure createdByName and createdByEmail are set
            if (!file.createdByName) {
              file.createdByName = (employee as any).name;
            }
            if (!file.createdByEmail) {
              file.createdByEmail = (employee as any).empId;
            }
          }
        } catch (err) {
          // If employee lookup fails, use stored values
          console.error('Error fetching employee:', err);
        }
      }
      return file;
    }));

    const dayFromFilename = (name: string): string => {
      const m = String(name || '').match(/_([0-9]{4}-[0-9]{2}-[0-9]{2})\.xlsx$/i);
      return m ? m[1] : '';
    };
    const toTs = (f: any): number =>
      new Date(f.lastEditedAt || f.updatedAt || f.createdAt || 0).getTime();

    // Clean mode: one latest file per owner+format+work-day (+ labour type when grouping).
    const dedupedCleanFiles = cleanOnly
      ? (() => {
          const latest = new Map<string, any>();
          for (const f of enhancedFiles as any[]) {
            const ownerId =
              (f.createdBy && typeof f.createdBy === 'object' && String(f.createdBy._id || '').trim()) ||
              String(f.createdBy || '').trim() ||
              String(f.createdByEmail || '').trim() ||
              'unknown';
            const fmtId =
              (f.formatId && typeof f.formatId === 'object' && String(f.formatId._id || '').trim()) ||
              String(f.formatId || '').trim() ||
              'no-format';
            const day =
              String(f.dailyWorkDate || '').trim() ||
              dayFromFilename(String(f.originalFilename || '')) ||
              '';
            if (!day) continue;
            const lab = String(f.labourType || '').trim() || 'UNKNOWN';
            const key = groupByDay ? `${ownerId}|${fmtId}|${day}|${lab}` : `${ownerId}|${fmtId}|${day}`;
            const prev = latest.get(key);
            if (!prev || toTs(f) >= toTs(prev)) latest.set(key, f);
          }
          return Array.from(latest.values()).sort((a, b) => toTs(b) - toTs(a));
        })()
      : enhancedFiles;

    const contributorLabel = (f: any): string => {
      if (f.createdBy && typeof f.createdBy === 'object') {
        const n = String(f.createdBy.name || '').trim();
        const e = String(f.createdBy.email || '').trim();
        if (n && e) return `${n} (${e})`;
        return n || e || '';
      }
      const n = String(f.createdByName || '').trim();
      const e = String(f.createdByEmail || '').trim();
      if (n && e) return `${n} (${e})`;
      return n || e || '';
    };

    let outputFiles: any[];
    let responseTotal = 0;

    if (groupByDay) {
      const byKey = new Map<
        string,
        { formatKey: string; day: string; labour: string; files: any[] }
      >();
      for (const f of dedupedCleanFiles as any[]) {
        const fmtId =
          (f.formatId && typeof f.formatId === 'object' && String(f.formatId._id || '').trim()) ||
          String(f.formatId || '').trim() ||
          '';
        const day =
          String(f.dailyWorkDate || '').trim() ||
          dayFromFilename(String(f.originalFilename || '')) ||
          '';
        if (!day || !fmtId || fmtId === 'no-format') continue;
        const labour = String(f.labourType || '').trim() || 'UNKNOWN';
        const gk = `${fmtId}|${day}|${labour}`;
        let g = byKey.get(gk);
        if (!g) {
          g = { formatKey: fmtId, day, labour, files: [] };
          byKey.set(gk, g);
        }
        g.files.push(f);
      }
      const groups = Array.from(byKey.values()).map((g) => {
        const labels = g.files.map(contributorLabel).filter(Boolean);
        const unique = Array.from(new Set(labels));
        let contributorsSummary = unique.slice(0, 4).join(', ');
        if (unique.length > 4) contributorsSummary += ` +${unique.length - 4} more`;
        const fmtName =
          g.files[0].formatId && typeof g.files[0].formatId === 'object'
            ? String(g.files[0].formatId.name || '').trim()
            : '';
        const titleBase = fmtName || 'Saved workbook';
        const maxTs = Math.max(...g.files.map((x: any) => toTs(x)));
        const byRecent = [...g.files].sort((a: any, b: any) => toTs(b) - toTs(a));
        const sampleFilename =
          String(byRecent[0]?.originalFilename || '').trim() || `${titleBase.replace(/\s+/g, '_')}_${g.day}.xlsx`;
        return {
          isDailyGroup: true as const,
          _id: `dg:${g.formatKey}:${g.day}:${g.labour}`,
          formatId: g.files[0].formatId,
          formatName: titleBase,
          sampleFilename,
          dailyWorkDate: g.day,
          labourType: g.labour,
          contributorCount: g.files.length,
          contributorsSummary,
          sourceFileIds: g.files.map((x: any) => String(x._id)),
          /** Short name for lists (actual .xlsx); UI shows date & format in other columns. */
          originalFilename: sampleFilename,
          rowCount: undefined,
          lastEditedAt: new Date(maxTs).toISOString(),
          updatedAt: new Date(maxTs).toISOString(),
        };
      });
      groups.sort((a, b) => toTs(b) - toTs(a));
      const qLow = (qFilename || '').toLowerCase();
      const filtered = qLow
        ? groups.filter(
            (g) =>
              String(g.sampleFilename || '').toLowerCase().includes(qLow) ||
              String(g.formatName || '').toLowerCase().includes(qLow) ||
              g.contributorsSummary.toLowerCase().includes(qLow) ||
              g.dailyWorkDate.includes(qLow)
          )
        : groups;
      responseTotal = filtered.length;
      outputFiles = filtered.slice(skip, skip + limit);
    } else {
      outputFiles = dedupedCleanFiles;
    }

    const dbTotal = await CreatedExcelFile.countDocuments(query);

    return NextResponse.json({
      success: true,
      data: outputFiles,
      total: groupByDay ? responseTotal : cleanOnly ? dedupedCleanFiles.length : dbTotal,
      limit,
      skip,
      ...(groupByDay && files.length >= GROUP_SCAN_LIMIT
        ? { listNote: 'List is capped from the most recently updated saves; total may be incomplete.' }
        : {}),
    });
  } catch (error: any) {
    console.error('Get created Excel files error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get created Excel files' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetCreatedExcelFiles);

