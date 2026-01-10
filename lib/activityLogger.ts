import connectDB from './mongodb';
import ActivityLog from '@/models/ActivityLog';

/**
 * Activity Logger Utility
 * Logs all user activities for audit trail
 */
export interface LogActivityParams {
  userId: string;
  userEmail: string;
  action: 'UPLOAD' | 'EDIT' | 'DELETE' | 'CREATE' | 'MERGE' | 'TOGGLE_STATUS';
  entityType: 'EMPLOYEE' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR' | 'USER' | 'EXCEL';
  entityId?: string;
  description: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await connectDB();
    await ActivityLog.create({
      userId: params.userId,
      userEmail: params.userEmail,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
      projectId: params.projectId,
      metadata: params.metadata,
    });
  } catch (error) {
    // Don't throw error if logging fails - it shouldn't break the main operation
    console.error('Failed to log activity:', error);
  }
}








