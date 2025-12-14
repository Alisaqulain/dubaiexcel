import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceRow {
  empId?: string;
  name?: string;
  role?: string;
  site?: string;
  date?: string;
  time?: string;
  status?: string;
  raw: Record<string, any>;
}

export interface IAttendanceRaw extends Document {
  fileId: string;
  uploaderId: mongoose.Types.ObjectId;
  filename: string;
  rows: IAttendanceRow[];
  uploadedAt: Date;
  parsedRowsCount: number;
  status: 'pending' | 'processed' | 'error';
  errorMessage?: string;
}

const AttendanceRowSchema = new Schema<IAttendanceRow>({
  empId: String,
  name: String,
  role: String,
  site: String,
  date: String,
  time: String,
  status: String,
  raw: { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const AttendanceRawSchema = new Schema<IAttendanceRaw>({
  fileId: { type: String, required: true, unique: true, index: true },
  uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  rows: { type: [AttendanceRowSchema], default: [] },
  uploadedAt: { type: Date, default: Date.now },
  parsedRowsCount: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'processed', 'error'], default: 'pending' },
  errorMessage: String,
}, {
  timestamps: true,
});

const AttendanceRaw = mongoose.models.AttendanceRaw || mongoose.model<IAttendanceRaw>('AttendanceRaw', AttendanceRawSchema);
export default AttendanceRaw;

