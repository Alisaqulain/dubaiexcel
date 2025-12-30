import mongoose, { Schema, Document } from 'mongoose';

/**
 * Excel Upload Model
 * Tracks uploaded Excel files and their status
 */
export interface IExcelUpload extends Document {
  filename: string;
  originalFilename: string;
  uploadedBy: mongoose.Types.ObjectId;
  projectId?: string;
  labourType: 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR';
  status: 'PENDING' | 'PROCESSED' | 'MERGED' | 'ERROR';
  rowCount: number;
  processedCount: number;
  errorCount: number;
  errorMessages?: string[];
  merged: boolean;
  mergedAt?: Date;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExcelUploadSchema = new Schema<IExcelUpload>({
  filename: { type: String, required: true, unique: true },
  originalFilename: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  projectId: { type: String, index: true },
  labourType: { 
    type: String, 
    enum: ['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'],
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['PENDING', 'PROCESSED', 'MERGED', 'ERROR'],
    default: 'PENDING',
    index: true
  },
  rowCount: { type: Number, default: 0 },
  processedCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  errorMessages: [{ type: String }],
  merged: { type: Boolean, default: false, index: true },
  mergedAt: { type: Date },
  metadata: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

// Indexes for efficient querying
ExcelUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
ExcelUploadSchema.index({ projectId: 1, status: 1 });
ExcelUploadSchema.index({ merged: 1, status: 1 });

const ExcelUpload = mongoose.models.ExcelUpload || mongoose.model<IExcelUpload>('ExcelUpload', ExcelUploadSchema);
export default ExcelUpload;

