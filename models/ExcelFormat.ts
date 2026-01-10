import mongoose, { Schema, Document } from 'mongoose';

export interface IExcelFormat extends Document {
  name: string;
  description?: string;
  columns: Array<{
    name: string;
    type: 'text' | 'number' | 'date' | 'email' | 'dropdown';
    required: boolean;
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
      options?: string[]; // For dropdown type
    };
    order: number;
  }>;
  assignedTo: mongoose.Types.ObjectId[]; // Employee IDs or User IDs
  assignedToType: 'employee' | 'user' | 'all';
  createdBy: mongoose.Types.ObjectId;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExcelFormatSchema = new Schema<IExcelFormat>({
  name: { type: String, required: true },
  description: { type: String },
  columns: [{
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['text', 'number', 'date', 'email', 'dropdown'],
      required: true,
      default: 'text'
    },
    required: { type: Boolean, default: false },
    validation: {
      min: { type: Number },
      max: { type: Number },
      pattern: { type: String },
      options: [{ type: String }], // For dropdown
    },
    order: { type: Number, required: true },
  }],
  assignedTo: [{ type: Schema.Types.ObjectId, refPath: 'assignedToType' }],
  assignedToType: { 
    type: String, 
    enum: ['employee', 'user', 'all'],
    default: 'all'
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Indexes
ExcelFormatSchema.index({ assignedTo: 1, active: 1 });
ExcelFormatSchema.index({ createdBy: 1 });

const ExcelFormat = mongoose.models.ExcelFormat || mongoose.model<IExcelFormat>('ExcelFormat', ExcelFormatSchema);
export default ExcelFormat;







