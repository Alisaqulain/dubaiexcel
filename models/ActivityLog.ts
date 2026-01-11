import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  userEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  projectId?: string;
  metadata?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userEmail: { type: String, required: true },
  action: { type: String, required: true, index: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String },
  description: { type: String, required: true },
  projectId: { type: String, index: true },
  metadata: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

// Indexes for efficient queries
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ projectId: 1, createdAt: -1 });
ActivityLogSchema.index({ action: 1, entityType: 1 });
ActivityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;
