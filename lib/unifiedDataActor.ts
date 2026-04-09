import { AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import User from '@/models/User';
import mongoose from 'mongoose';

export interface ActorInfo {
  id: mongoose.Types.ObjectId;
  label: string;
  role: string;
}

export async function resolveActor(req: AuthenticatedRequest): Promise<ActorInfo> {
  const userId = req.user?.userId;
  const role = req.user?.role || 'unknown';
  if (!userId) {
    throw new Error('Unauthorized');
  }
  const oid = new mongoose.Types.ObjectId(userId);

  if (role === 'employee') {
    const emp = await Employee.findById(userId).select('name empId').lean();
    if (emp) {
      return {
        id: oid,
        label: `${(emp as { name?: string }).name || 'Employee'} (${(emp as { empId?: string }).empId || ''})`,
        role: 'employee',
      };
    }
    return { id: oid, label: req.user?.email || userId, role: 'employee' };
  }

  const u = await User.findById(userId).select('name email role').lean();
  if (u) {
    const doc = u as { name?: string; email?: string; role?: string };
    const name = doc.name || doc.email || 'Admin';
    return {
      id: oid,
      label: `${name} (${doc.role || role})`,
      role: doc.role || role,
    };
  }

  return { id: oid, label: req.user?.email || userId, role };
}
