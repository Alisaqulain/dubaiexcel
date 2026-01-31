import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';

/**
 * DELETE /api/admin/created-excel-files/[id]
 * Delete a created Excel file (Admin only)
 */
async function handleDeleteExcelFile(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const fileId = params.id;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Delete the file
    // Note: It's safe to delete original files even if they're referenced by merged files
    // because merged files already contain all the data independently
    const deletedFile = await CreatedExcelFile.findByIdAndDelete(fileId);

    if (!deletedFile) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete Excel file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete Excel file' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleDeleteExcelFile(authReq, context);
  });
  return handler(req);
}










