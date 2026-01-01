import mongoose, { Schema, Document } from 'mongoose';

/**
 * Subcontractor Model
 * Does NOT maintain individual employee names
 * Only company-level information
 */
export interface ISubcontractor extends Document {
  companyName: string;
  trade: string;
  scopeOfWork: string;
  employeesPresent: number; // Number of employees present today
  projectId?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubcontractorSchema = new Schema<ISubcontractor>({
  companyName: { type: String, required: true, index: true },
  trade: { type: String, required: true },
  scopeOfWork: { type: String, required: true },
  employeesPresent: { type: Number, required: true, default: 0, min: 0 },
  projectId: { type: String, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Compound index for unique company per project
SubcontractorSchema.index({ companyName: 1, projectId: 1 }, { unique: true });

const Subcontractor = mongoose.models.Subcontractor || mongoose.model<ISubcontractor>('Subcontractor', SubcontractorSchema);
export default Subcontractor;



