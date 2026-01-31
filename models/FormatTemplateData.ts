import mongoose, { Schema, Document } from 'mongoose';

export interface IFormatTemplateData extends Document {
  formatId: mongoose.Types.ObjectId;
  rows: Array<Record<string, any>>; // All rows from dummy Excel with all columns
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const FormatTemplateDataSchema = new Schema<IFormatTemplateData>({
  formatId: { type: Schema.Types.ObjectId, ref: 'ExcelFormat', required: true, unique: true },
  rows: [{ type: Schema.Types.Mixed, required: true }], // Array of objects, each object is a row
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Index for faster lookups
FormatTemplateDataSchema.index({ formatId: 1 });

const FormatTemplateData = mongoose.models.FormatTemplateData || mongoose.model<IFormatTemplateData>('FormatTemplateData', FormatTemplateDataSchema);
export default FormatTemplateData;








