import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import mongoose from 'mongoose';

/**
 * GET /api/admin/excel-formats/:id
 * Get a specific Excel format
 */
async function handleGetFormat(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const format = await ExcelFormat.findById(params.id)
      .populate('createdBy', 'email name')
      .lean();

    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: format,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get format' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/excel-formats/:id
 * Update an Excel format
 */
async function handleUpdateFormat(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const body = await req.json();
    const { name, description, columns, assignedTo, assignedToType, active } = body;

    // Validate ObjectId format
    if (!params.id || params.id.length !== 24) {
      return NextResponse.json(
        { error: 'Invalid format ID' },
        { status: 400 }
      );
    }

    // Check if format exists first
    const existingFormat = await ExcelFormat.findById(params.id);
    if (!existingFormat) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (columns && Array.isArray(columns)) {
      updateData.columns = columns.map((col: any, index: number) => {
        const columnData: any = {
          name: col.name,
          type: col.type || 'text',
          required: col.required === true, // Explicit boolean
          editable: col.editable !== false, // Default to true if not explicitly false
          unique: col.unique === true, // Explicit boolean - only true if explicitly set to true
          validation: col.validation || {},
          order: col.order !== undefined ? col.order : index,
        };
        // Ensure unique is always explicitly set (even if false) so MongoDB stores it
        if (col.unique === undefined || col.unique === null) {
          columnData.unique = false;
        }
        return columnData;
      });
    }
    if (assignedTo !== undefined) {
      // Convert string IDs to ObjectIds, handle empty arrays
      if (Array.isArray(assignedTo) && assignedTo.length > 0) {
        updateData.assignedTo = assignedTo.map((id: string) => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch {
            return id;
          }
        });
      } else {
        updateData.assignedTo = [];
      }
    }
    if (assignedToType) updateData.assignedToType = assignedToType;
    if (active !== undefined) updateData.active = active;

    // Update the document directly
    Object.assign(existingFormat, updateData);
    
    // Explicitly mark columns as modified to ensure all fields (including unique: false) are saved
    existingFormat.markModified('columns');
    
    await existingFormat.save();

    // Fetch the updated format to ensure all fields are included
    const format = await ExcelFormat.findById(params.id).lean();

    // Log to verify unique property is saved
    console.log('Format updated - columns:', format?.columns?.map((col: any) => ({ 
      name: col.name, 
      unique: col.unique 
    })));

    return NextResponse.json({
      success: true,
      data: format,
      message: 'Format updated successfully',
    });
  } catch (error: any) {
    console.error('Update format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update format' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/excel-formats/:id
 * Delete an Excel format
 */
async function handleDeleteFormat(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const format = await ExcelFormat.findByIdAndDelete(params.id);

    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Format deleted successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete format' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetFormat(authReq, context);
  });
  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleUpdateFormat(authReq, context);
  });
  return handler(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleDeleteFormat(authReq, context);
  });
  return handler(req);
}
