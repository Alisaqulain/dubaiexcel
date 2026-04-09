import mongoose, { Schema, Document } from 'mongoose';

export interface IUnifiedExcelFile extends Document {
  fileName: string;
  originalName: string;
  filePath: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

const UnifiedExcelFileSchema = new Schema<IUnifiedExcelFile>(
  {
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    filePath: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

UnifiedExcelFileSchema.index({ uploadedAt: -1 });

export default mongoose.models.UnifiedExcelFile ||
  mongoose.model<IUnifiedExcelFile>('UnifiedExcelFile', UnifiedExcelFileSchema);
