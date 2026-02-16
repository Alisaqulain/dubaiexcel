import mongoose, { Schema, Document } from 'mongoose';

export interface IUploadedSheet extends Document {
  name: string;
  /** Column name used for project/site filtering (e.g. PROJECT NAME) */
  loginColumnName: string;
  /** Headers from first row of Excel */
  headers: string[];
  rowCount: number;
  /** When set, this sheet was synced from Excel Format template (so it shows in Sheets Upload / Worker Transfer) */
  formatId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const UploadedSheetSchema = new Schema<IUploadedSheet>(
  {
    name: { type: String, required: true, trim: true },
    loginColumnName: { type: String, required: true, trim: true },
    headers: [{ type: String }],
    rowCount: { type: Number, default: 0 },
    formatId: { type: Schema.Types.ObjectId, ref: 'ExcelFormat', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

UploadedSheetSchema.index({ createdBy: 1 });

const UploadedSheet =
  mongoose.models.UploadedSheet ||
  mongoose.model<IUploadedSheet>('UploadedSheet', UploadedSheetSchema);
export default UploadedSheet;
