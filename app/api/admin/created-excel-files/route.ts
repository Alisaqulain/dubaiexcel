import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import Employee from '@/models/Employee';

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
    const limit = parseInt(searchParams.get('limit') || '1000'); // Increased limit to show more files
    const skip = parseInt(searchParams.get('skip') || '0');

    // Build query - include all files (both employee-saved and admin-uploaded)
    const query: any = {};
    if (labourType && ['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'].includes(labourType)) {
      query.labourType = labourType;
    }

    // Get files with pagination, organized by date (newest first, merged files after originals)
    const files = await CreatedExcelFile.find(query)
      .select('-fileData') // Don't include file data in list (too large)
      .populate('createdBy', 'name email')
      .sort({ 
        isMerged: 1, // Original files first (false < true)
        createdAt: -1 // Then by date, newest first
      })
      .limit(limit)
      .skip(skip)
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

    // Get total count
    const total = await CreatedExcelFile.countDocuments(query);

    return NextResponse.json({
      success: true,
      data: enhancedFiles,
      total,
      limit,
      skip,
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

