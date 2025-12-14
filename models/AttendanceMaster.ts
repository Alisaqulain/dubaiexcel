import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceMaster extends Document {
  empId: string;
  name: string;
  role: string;
  site: string;
  date: string;
  time?: string;
  status: string;
  validation: 'OK' | 'ERROR' | 'WARNING';
  validationMessage?: string;
  sourceFileId: string;
  updatedAt: Date;
}

const AttendanceMasterSchema = new Schema<IAttendanceMaster>({
  empId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  role: { type: String, required: true, index: true },
  site: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true },
  time: String,
  status: { type: String, required: true },
  validation: { type: String, enum: ['OK', 'ERROR', 'WARNING'], default: 'OK' },
  validationMessage: String,
  sourceFileId: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Compound index for unique attendance records
AttendanceMasterSchema.index({ empId: 1, date: 1 }, { unique: true });

const AttendanceMaster = mongoose.models.AttendanceMaster || mongoose.model<IAttendanceMaster>('AttendanceMaster', AttendanceMasterSchema);
export default AttendanceMaster;

