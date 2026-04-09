import mongoose, { Schema, Document } from 'mongoose';

export type UnifiedRowStatus = 'active' | 'removed';

export interface IUnifiedChangeEntry {
  changedBy: mongoose.Types.ObjectId;
  /** Display label at time of change */
  changedByLabel?: string;
  changedByRole?: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: Date;
}

export interface IUnifiedDataRow extends Document {
  name: string;
  fields: Record<string, unknown>;
  pickedBy: mongoose.Types.ObjectId | null;
  status: UnifiedRowStatus;
  fileId: mongoose.Types.ObjectId | null;
  changeHistory: IUnifiedChangeEntry[];
  lastModifiedBy?: mongoose.Types.ObjectId;
  lastModifiedByLabel?: string;
  lastModifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ChangeEntrySchema = new Schema<IUnifiedChangeEntry>(
  {
    changedBy: { type: Schema.Types.ObjectId, required: true },
    changedByLabel: { type: String },
    changedByRole: { type: String },
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UnifiedDataRowSchema = new Schema<IUnifiedDataRow>(
  {
    name: { type: String, required: true, trim: true, index: true },
    fields: { type: Schema.Types.Mixed, default: {} },
    pickedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    status: {
      type: String,
      enum: ['active', 'removed'],
      default: 'active',
      index: true,
    },
    fileId: { type: Schema.Types.ObjectId, ref: 'UnifiedExcelFile', default: null, index: true },
    changeHistory: { type: [ChangeEntrySchema], default: [] },
    lastModifiedBy: { type: Schema.Types.ObjectId },
    lastModifiedByLabel: { type: String },
    lastModifiedAt: { type: Date },
  },
  { timestamps: true }
);

UnifiedDataRowSchema.index({ createdAt: -1 });
UnifiedDataRowSchema.index({ updatedAt: -1 });

export default mongoose.models.UnifiedDataRow ||
  mongoose.model<IUnifiedDataRow>('UnifiedDataRow', UnifiedDataRowSchema);
