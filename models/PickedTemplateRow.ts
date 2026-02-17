import mongoose, { Schema, Document } from 'mongoose';

/**
 * Tracks which template row (formatId + rowIndex) was picked by which employee.
 * One row can only be picked by one employee (no duplication).
 */
export interface IPickedTemplateRow extends Document {
  formatId: mongoose.Types.ObjectId;
  rowIndex: number; // 0-based index in the template
  pickedBy: mongoose.Types.ObjectId; // User or Employee _id
  empId: string;   // Display ID (e.g. empId for employees, email for users)
  empName: string;
  createdAt?: Date;
}

const PickedTemplateRowSchema = new Schema<IPickedTemplateRow>({
  formatId: { type: Schema.Types.ObjectId, ref: 'ExcelFormat', required: true, index: true },
  rowIndex: { type: Number, required: true },
  pickedBy: { type: Schema.Types.ObjectId, required: true, index: true },
  empId: { type: String, required: true },
  empName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// One row per (formatId, rowIndex)
PickedTemplateRowSchema.index({ formatId: 1, rowIndex: 1 }, { unique: true });

export default mongoose.models.PickedTemplateRow || mongoose.model<IPickedTemplateRow>('PickedTemplateRow', PickedTemplateRowSchema);
