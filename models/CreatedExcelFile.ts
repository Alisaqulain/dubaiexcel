import mongoose, { Schema, Document } from 'mongoose';

export interface ICreatedExcelFile extends Document {
  filename: string;
  originalFilename: string;
  fileData: Buffer; // Store the Excel file as binary data
  labourType: 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR';
  rowCount: number;
  createdBy: mongoose.Types.ObjectId; // User who created the file
  createdByName?: string; // User's name for easy display
  createdByEmail?: string; // User's email for easy display
  isMerged?: boolean; // True if this is a merged file
  mergedFrom?: mongoose.Types.ObjectId[]; // IDs of files that were merged
  mergedDate?: Date; // Date when files were merged
  mergeCount?: number; // Number of times this file has been used in merges
  createdAt?: Date;
  updatedAt?: Date;
}

const CreatedExcelFileSchema = new Schema<ICreatedExcelFile>({
  filename: { type: String, required: true, index: true },
  originalFilename: { type: String, required: true },
  fileData: { type: Buffer, required: true },
  labourType: { 
    type: String, 
    enum: ['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'],
    required: true 
  },
  rowCount: { type: Number, required: true, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdByName: { type: String },
  createdByEmail: { type: String },
  isMerged: { type: Boolean, default: false, index: true },
  mergedFrom: [{ type: Schema.Types.ObjectId, ref: 'CreatedExcelFile' }],
  mergedDate: { type: Date },
  mergeCount: { type: Number, default: 0 }, // Track how many times this file has been merged
}, {
  timestamps: true,
});

const CreatedExcelFile = mongoose.models.CreatedExcelFile || mongoose.model<ICreatedExcelFile>('CreatedExcelFile', CreatedExcelFileSchema);
export default CreatedExcelFile;

