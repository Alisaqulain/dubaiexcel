import mongoose, { Schema, Document } from 'mongoose';

/**
 * Activity Log Model
 * Tracks all user activities: upload, edit, delete
 */
export interface IActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  userEmail: string;
  action: 'UPLOAD' | 'EDIT' | 'DELETE' | 'CREATE' | 'MERGE' | 'TOGGLE_STATUS';
  entityType: 'EMPLOYEE' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR' | 'USER' | 'EXCEL';
  entityId?: string;
  description: string;
  projectId?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, required: true, index: true },
  action: { 
    type: String, 
    enum: ['UPLOAD', 'EDIT', 'DELETE', 'CREATE', 'MERGE', 'TOGGLE_STATUS'],
    required: true,
    index: true
  },
  entityType: { 
    type: String, 
    enum: ['EMPLOYEE', 'SUPPLY_LABOUR', 'SUBCONTRACTOR', 'USER', 'EXCEL'],
    required: true,
    index: true
  },
  entityId: { type: String, index: true },
  description: { type: String, required: true },
  projectId: { type: String, index: true },
  metadata: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

// Index for efficient querying
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ projectId: 1, createdAt: -1 });

const ActivityLog = mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
export default ActivityLog;

