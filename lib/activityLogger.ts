import connectDB from './mongodb';
import User from '@/models/User'; // Import User first to ensure it's registered
import ActivityLog from '@/models/ActivityLog';

export interface LogActivityParams {
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  projectId?: string;
  metadata?: any;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await connectDB();
    
    await ActivityLog.create({
      userId: params.userId || undefined,
      userEmail: params.userEmail,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
      projectId: params.projectId,
      metadata: params.metadata,
    });
  } catch (error: any) {
    // Log errors but don't throw - we don't want activity logging to break the main flow
    console.error('Failed to log activity:', error);
  }
}
