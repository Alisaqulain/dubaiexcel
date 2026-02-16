import mongoose, { Schema, Document } from 'mongoose';

export interface ISheetRow extends Document {
  sheetId: mongoose.Types.ObjectId;
  /** Dynamic row data from Excel (keys = column headers) */
  data: Record<string, unknown>;
  /** Value of login column for this row (denormalized for filtering) */
  projectName: string;
  /** Optional assigned employee/user id */
  employeeAssigned?: mongoose.Types.ObjectId;
  /** Optional status (e.g. Active, Inactive) */
  status?: string;
  /** Optional notes */
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SheetRowSchema = new Schema<ISheetRow>(
  {
    sheetId: { type: Schema.Types.ObjectId, ref: 'UploadedSheet', required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    projectName: { type: String, required: true, trim: true, index: true },
    employeeAssigned: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, trim: true },
    notes: { type: String },
  },
  { timestamps: true }
);

SheetRowSchema.index({ sheetId: 1, projectName: 1 });
SheetRowSchema.index({ projectName: 1 });

const SheetRow =
  mongoose.models.SheetRow ||
  mongoose.model<ISheetRow>('SheetRow', SheetRowSchema);
export default SheetRow;
