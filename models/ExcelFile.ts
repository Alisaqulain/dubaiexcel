import mongoose, { Schema, Document } from 'mongoose';

export interface IExcelFile extends Document {
  fileId: string;
  filename: string;
  createdBy: mongoose.Types.ObjectId;
  fileType: 'uploaded' | 'created'; // uploaded from file or created in system
  fileData?: Buffer; // Store file buffer for created files
  fileSize: number;
  rowCount?: number;
  status: 'active' | 'merged' | 'archived';
  uploadedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExcelFileSchema = new Schema<IExcelFile>({
  fileId: { type: String, required: true, unique: true, index: true },
  filename: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileType: { 
    type: String, 
    enum: ['uploaded', 'created'], 
    required: true,
    index: true
  },
  fileData: { type: Buffer }, // Only for created files
  fileSize: { type: Number, required: true },
  rowCount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['active', 'merged', 'archived'], 
    default: 'active',
    index: true
  },
  uploadedAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
});

const ExcelFile = mongoose.models.ExcelFile || mongoose.model<IExcelFile>('ExcelFile', ExcelFileSchema);
export default ExcelFile;


