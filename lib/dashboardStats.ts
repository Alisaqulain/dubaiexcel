import connectDB from '@/lib/mongodb';
import AttendanceMaster from '@/models/AttendanceMaster';
import Employee from '@/models/Employee';
import Upload from '@/models/Upload';

export interface DashboardPayload {
  metrics: {
    totalHeadcount: number;
    activeEmployees: number;
    inactiveEmployees: number;
    absent: number;
    absentPercent: string;
    present: number;
    vacation: number;
    visaMedical: number;
    weekOff: number;
    sickLeave: number;
  };
  divisions: Record<string, number>;
  staffLabour: Record<string, number>;
  nationalities: Record<string, number>;
  departments: Record<string, number>;
  camps: Record<string, number>;
  attendanceTypes: Record<string, number>;
  dates: string[];
  absentCountDateWise: number[];
  mepProjects: Array<{ name: string; present: number; absent: number }>;
  civilAluminiumProjects: Array<{ name: string; present: number; absent: number }>;
  recentUploads: unknown[];
}

/**
 * Aggregates employees + AttendanceMaster for admin (and optional public) dashboard.
 */
export async function buildDashboardPayload(): Promise<DashboardPayload> {
  await connectDB();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const employees = await Employee.find().lean();
  const totalHeadcount = employees.length;
  const activeEmployees = employees.filter((emp) => emp.active).length;
  const inactiveEmployees = totalHeadcount - activeEmployees;

  const todayAttendance = await AttendanceMaster.find({ date: todayStr }).lean();

  const present = todayAttendance.filter(
    (att) =>
      att.status?.toLowerCase().includes('present') || att.status?.toLowerCase() === 'p'
  ).length;

  const absent = todayAttendance.filter(
    (att) =>
      att.status?.toLowerCase().includes('absent') || att.status?.toLowerCase() === 'a'
  ).length;

  const vacation = todayAttendance.filter((att) =>
    att.status?.toLowerCase().includes('vacation')
  ).length;

  const visaMedical = todayAttendance.filter(
    (att) =>
      att.status?.toLowerCase().includes('visa') || att.status?.toLowerCase().includes('medical')
  ).length;

  const weekOff = todayAttendance.filter(
    (att) =>
      att.status?.toLowerCase().includes('week') || att.status?.toLowerCase().includes('off')
  ).length;

  const sickLeave = todayAttendance.filter((att) =>
    att.status?.toLowerCase().includes('sick')
  ).length;

  const absentPercent =
    totalHeadcount > 0 ? ((absent / totalHeadcount) * 100).toFixed(2) : '0.00';

  const divisions = {
    CIVIL: 0,
    MEP: 0,
    ALUMINIUM: 0,
    OFFICE_OUTSOURCED: 0,
  };

  employees.forEach((emp) => {
    if (emp.siteType === 'CIVIL') divisions.CIVIL++;
    else if (emp.siteType === 'MEP') divisions.MEP++;
    else if (emp.siteType === 'OTHER') divisions.ALUMINIUM++;
    else if (
      emp.siteType === 'HEAD_OFFICE' ||
      emp.siteType === 'OUTSOURCED' ||
      emp.siteType === 'SUPPORT'
    ) {
      divisions.OFFICE_OUTSOURCED++;
    }
  });

  const staffLabour: Record<string, number> = {};
  employees.forEach((emp) => {
    const role = emp.role?.toUpperCase() || 'BLANK';
    if (role.includes('OFFICE')) {
      staffLabour.OFFICE = (staffLabour.OFFICE || 0) + 1;
    } else if (role.includes('LABOUR') || role.includes('LABOR')) {
      staffLabour.LABOUR = (staffLabour.LABOUR || 0) + 1;
    } else if (role.includes('SUPERVISOR')) {
      staffLabour.SUPERVISOR = (staffLabour.SUPERVISOR || 0) + 1;
    } else if (role.includes('FOREMAN')) {
      staffLabour.FOREMAN = (staffLabour.FOREMAN || 0) + 1;
    } else if (role.includes('CHARD')) {
      staffLabour.CHARD = (staffLabour.CHARD || 0) + 1;
    } else if (role.includes('DOCUMENT')) {
      staffLabour['DOCUMENT CONTROL'] = (staffLabour['DOCUMENT CONTROL'] || 0) + 1;
    } else if (role.includes('SECURITY') || role.includes('BOY')) {
      staffLabour['OFFICE BOY/SECURITY'] = (staffLabour['OFFICE BOY/SECURITY'] || 0) + 1;
    } else if (role.includes('STAFF')) {
      staffLabour.STAFF = (staffLabour.STAFF || 0) + 1;
    } else if (role.includes('SUPPORT')) {
      staffLabour['SUPPORTING STAFF'] = (staffLabour['SUPPORTING STAFF'] || 0) + 1;
    } else {
      staffLabour.BLANK = (staffLabour.BLANK || 0) + 1;
    }
  });

  const nationalities: Record<string, number> = {};
  employees.forEach((emp) => {
    const raw = (emp as { nationality?: string }).nationality;
    const key = raw && String(raw).trim() ? String(raw).trim() : 'Not specified';
    nationalities[key] = (nationalities[key] || 0) + 1;
  });

  const departments: Record<string, number> = {};
  employees.forEach((emp) => {
    const dept = emp.department || 'UNASSIGNED';
    departments[dept] = (departments[dept] || 0) + 1;
  });

  const camps: Record<string, number> = {};
  employees.forEach((emp) => {
    const camp = emp.site || 'UNKNOWN';
    camps[camp] = (camps[camp] || 0) + 1;
  });

  const attendanceTypes: Record<string, number> = { OK: 0, WARNING: 0, ERROR: 0 };
  todayAttendance.forEach((att) => {
    const v = String(att.validation || 'OK').toUpperCase();
    if (v === 'WARNING') attendanceTypes.WARNING++;
    else if (v === 'ERROR') attendanceTypes.ERROR++;
    else attendanceTypes.OK++;
  });

  const dates: string[] = [];
  for (let i = 8; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  const absentCountDateWise = await Promise.all(
    dates.map(async (date) => {
      const dayAttendance = await AttendanceMaster.find({ date }).lean();
      return dayAttendance.filter(
        (att) =>
          att.status?.toLowerCase().includes('absent') || att.status?.toLowerCase() === 'a'
      ).length;
    })
  );

  const projectLabel = (projectId: unknown) => {
    const p = projectId != null ? String(projectId).trim() : '';
    return p || 'Unassigned project';
  };

  const isPresent = (status: string | undefined) => {
    const s = (status || '').toLowerCase();
    return s.includes('present') || s === 'p';
  };
  const isAbsent = (status: string | undefined) => {
    const s = (status || '').toLowerCase();
    return s.includes('absent') || s === 'a';
  };

  const buildProjectRows = (
    siteTypes: Set<string>,
    limit: number
  ): Array<{ name: string; present: number; absent: number }> => {
    const byProject = new Map<string, Set<string>>();
    for (const emp of employees) {
      if (!siteTypes.has(emp.siteType)) continue;
      const label = projectLabel(emp.projectId);
      if (!byProject.has(label)) byProject.set(label, new Set());
      byProject.get(label)!.add(emp.empId);
    }
    const rows: Array<{ name: string; present: number; absent: number; total: number }> = [];
    for (const [name, empIds] of Array.from(byProject.entries())) {
      let p = 0;
      let a = 0;
      for (const att of todayAttendance) {
        if (!empIds.has(att.empId)) continue;
        if (isPresent(att.status)) p++;
        else if (isAbsent(att.status)) a++;
      }
      rows.push({ name, present: p, absent: a, total: p + a });
    }
    rows.sort((x, y) => y.total - x.total);
    const top = rows.slice(0, limit).map(({ name, present: pr, absent: ab }) => ({
      name,
      present: pr,
      absent: ab,
    }));
    if (top.length === 0) {
      return [{ name: 'No project / attendance for today', present: 0, absent: 0 }];
    }
    return top;
  };

  const mepProjects = buildProjectRows(new Set(['MEP']), 12);
  const civilAluminiumProjects = buildProjectRows(new Set(['CIVIL', 'OTHER']), 12);

  const recentUploads = await Upload.find().sort({ uploadedAt: -1 }).limit(10).lean();

  return {
    metrics: {
      totalHeadcount,
      activeEmployees,
      inactiveEmployees,
      absent,
      absentPercent,
      present,
      vacation,
      visaMedical,
      weekOff,
      sickLeave,
    },
    divisions,
    staffLabour,
    nationalities,
    departments,
    camps,
    attendanceTypes,
    dates,
    absentCountDateWise,
    mepProjects,
    civilAluminiumProjects,
    recentUploads,
  };
}
