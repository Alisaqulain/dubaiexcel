import mongoose, { Schema, Document } from 'mongoose';

export interface IExcelEmployee extends Document {
  empId: string;
  name: string;
  site?: string;
  siteType?: string;
  role?: string;
  department?: string;
  division?: string;
  company?: string;
  projectName?: string;
  nationality?: string;
  status?: string;
  accommodation?: string;
  passportNumber?: string;
  doj?: string;
  designationHr?: string;
  designationSite?: string;
  shift?: string;
  shiftTiming?: string;
  staffLabour?: string;
  attendance?: string;
  punchIn?: string;
  device?: string;
  currentDate?: string;
  attendanceType?: string;
  remarks?: string;
  raw: Record<string, any>; // Store all raw data from Excel
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExcelEmployeeSchema = new Schema<IExcelEmployee>({
  empId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  site: { type: String },
  siteType: { type: String },
  role: { type: String },
  department: { type: String },
  division: { type: String },
  company: { type: String },
  projectName: { type: String },
  nationality: { type: String },
  status: { type: String },
  accommodation: { type: String },
  passportNumber: { type: String },
  doj: { type: String },
  designationHr: { type: String },
  designationSite: { type: String },
  shift: { type: String },
  shiftTiming: { type: String },
  staffLabour: { type: String },
  attendance: { type: String },
  punchIn: { type: String },
  device: { type: String },
  currentDate: { type: String },
  attendanceType: { type: String },
  remarks: { type: String },
  raw: { type: Schema.Types.Mixed, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Index for faster lookups
ExcelEmployeeSchema.index({ empId: 1 });
ExcelEmployeeSchema.index({ uploadedBy: 1 });

const ExcelEmployee = mongoose.models.ExcelEmployee || mongoose.model<IExcelEmployee>('ExcelEmployee', ExcelEmployeeSchema);
export default ExcelEmployee;








