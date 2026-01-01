import mongoose, { Schema, Document } from 'mongoose';

/**
 * Supply Labour Model
 * Maintains minimal information for supply labour
 */
export interface ISupplyLabour extends Document {
  empId: string;
  name: string;
  trade: string;
  companyName: string;
  status: 'PRESENT' | 'ABSENT';
  projectId?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const SupplyLabourSchema = new Schema<ISupplyLabour>({
  empId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  trade: { type: String, required: true },
  companyName: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['PRESENT', 'ABSENT'],
    default: 'PRESENT',
    required: true 
  },
  projectId: { type: String, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Compound index for unique employee per company
SupplyLabourSchema.index({ empId: 1, companyName: 1 }, { unique: true });

const SupplyLabour = mongoose.models.SupplyLabour || mongoose.model<ISupplyLabour>('SupplyLabour', SupplyLabourSchema);
export default SupplyLabour;



