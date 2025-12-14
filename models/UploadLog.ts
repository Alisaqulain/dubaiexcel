import mongoose, { Schema, Document } from 'mongoose';

export interface IUploadLog extends Document {
  userId: mongoose.Types.ObjectId;
  fileName: string;
  rowsCount: number;
  uploadTime: Date;
  status: 'success' | 'failed' | 'processing';
  errorMessage?: string;
  fileId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const UploadLogSchema = new Schema<IUploadLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileName: { type: String, required: true },
  rowsCount: { type: Number, default: 0 },
  uploadTime: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['success', 'failed', 'processing'], default: 'processing' },
  errorMessage: String,
  fileId: String,
}, {
  timestamps: true,
});

// Index for efficient queries
UploadLogSchema.index({ userId: 1, uploadTime: -1 });
UploadLogSchema.index({ uploadTime: -1 });

const UploadLog = mongoose.models.UploadLog || mongoose.model<IUploadLog>('UploadLog', UploadLogSchema);
export default UploadLog;






