import ExcelJS from 'exceljs';
import AttendanceMaster from '@/models/AttendanceMaster';
import Employee from '@/models/Employee';

interface MasterRow {
  section?: string;
  site?: string;
  role?: string;
  present?: number;
  absent?: number;
  total?: number;
  isTotal?: boolean;
  isHeader?: boolean;
}

interface RoleStats {
  present: number;
  absent: number;
  total: number;
}

interface SiteStats {
  [role: string]: RoleStats;
  total: RoleStats;
}

export async function generateMasterExcel(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Summary of Manpower');

  // Fetch all attendance records
  const attendanceRecords = await AttendanceMaster.find().lean();
  const employees = await Employee.find().lean();

  // Create employee map
  const employeeMap = new Map(employees.map(emp => [emp.empId, emp]));

  // Group by site type and site
  const siteGroups: Record<string, Record<string, SiteStats>> = {
    HEAD_OFFICE: {},
    MEP: {},
    CIVIL: {},
    OTHER: {},
    OUTSOURCED: {},
    SUPPORT: {},
  };

  // Process attendance records
  attendanceRecords.forEach(record => {
    const employee = employeeMap.get(record.empId);
    if (!employee) return;

    const siteType = employee.siteType || 'OTHER';
    const site = record.site || employee.site || 'Unknown';
    const role = record.role || 'Unknown';

    if (!siteGroups[siteType]) {
      siteGroups[siteType] = {};
    }
    if (!siteGroups[siteType][site]) {
      siteGroups[siteType][site] = {
        total: { present: 0, absent: 0, total: 0 }
      };
    }
    if (!siteGroups[siteType][site][role]) {
      siteGroups[siteType][site][role] = { present: 0, absent: 0, total: 0 };
    }

    const status = record.status?.toLowerCase() || '';
    const isPresent = status.includes('present') || status === 'p';
    const isAbsent = status.includes('absent') || status === 'a' || status.includes('leave');

    if (isPresent) {
      siteGroups[siteType][site][role].present++;
      siteGroups[siteType][site].total.present++;
    } else if (isAbsent) {
      siteGroups[siteType][site][role].absent++;
      siteGroups[siteType][site].total.absent++;
    }

    siteGroups[siteType][site][role].total++;
    siteGroups[siteType][site].total.total++;
  });

  // Get unique roles across all sites
  const allRoles = new Set<string>();
  Object.values(siteGroups).forEach((sites: Record<string, SiteStats>) => {
    Object.values(sites).forEach((site: SiteStats) => {
      Object.keys(site).forEach((role: string) => {
        if (role !== 'total') allRoles.add(role);
      });
    });
  });
  const sortedRoles = Array.from(allRoles).sort();

  // Build Excel rows
  const rows: MasterRow[] = [];
  let grandTotal = { present: 0, absent: 0, total: 0 };

  // Define sections in order
  const sections = [
    { name: 'HEAD OFFICE', key: 'HEAD_OFFICE' },
    { name: 'MEP SITES', key: 'MEP' },
    { name: 'CIVIL SITES', key: 'CIVIL' },
    { name: 'OTHER SITES', key: 'OTHER' },
    { name: 'OUTSOURCED', key: 'OUTSOURCED' },
    { name: 'SUPPORT TEAM', key: 'SUPPORT' },
  ];

  sections.forEach(section => {
    const sites = siteGroups[section.key];
    if (Object.keys(sites).length === 0) return;

    // Section header
    rows.push({ section: section.name, isHeader: true });

    // Process each site in this section
    Object.entries(sites).forEach(([siteName, siteData]) => {
      // Site header
      rows.push({ section: section.name, site: siteName, isHeader: true });

      // Role rows
      sortedRoles.forEach(role => {
        const roleData = siteData[role];
        if (!roleData || roleData.total === 0) return;

        rows.push({
          section: section.name,
          site: siteName,
          role,
          present: roleData.present,
          absent: roleData.absent,
          total: roleData.total,
        });

        grandTotal.present += roleData.present;
        grandTotal.absent += roleData.absent;
        grandTotal.total += roleData.total;
      });

      // Site total
      rows.push({
        section: section.name,
        site: siteName,
        role: 'TOTAL',
        present: siteData.total.present,
        absent: siteData.total.absent,
        total: siteData.total.total,
        isTotal: true,
      });
    });
  });

  // Add special rows
  rows.push({ section: 'MANAGEMENT', isHeader: true });
  rows.push({ section: 'MD REFERENCE', isHeader: true });
  
  // Vacation, Inactive, Absconded (from employees)
  const inactiveEmployees = employees.filter((emp: any) => !emp.active);
  const vacationCount = attendanceRecords.filter((r: any) => 
    r.status?.toLowerCase().includes('vacation')
  ).length;

  rows.push({ section: 'VACATION', role: 'Count', total: vacationCount });
  rows.push({ section: 'INACTIVE', role: 'Count', total: inactiveEmployees.length });
  rows.push({ section: 'ABSCONDED-RUN AWAY', role: 'Count', total: 0 });

  // Grand Total
  rows.push({ section: 'GRAND TOTAL', isHeader: true });
  rows.push({
    section: 'GRAND TOTAL',
    role: 'TOTAL',
    present: grandTotal.present,
    absent: grandTotal.absent,
    total: grandTotal.total,
    isTotal: true,
  });

  // Calculate absent percentage
  const absentPercent = grandTotal.total > 0 
    ? ((grandTotal.absent / grandTotal.total) * 100).toFixed(2)
    : '0.00';

  // Write to worksheet
  // Header row
  const headerRow = worksheet.addRow(['Section', 'Site', 'Role', 'Present', 'Absent', 'Total', 'Absent %']);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.font = { ...headerRow.font, color: { argb: 'FFFFFFFF' }, bold: true };

  // Data rows
  rows.forEach(row => {
    if (row.isHeader) {
      const excelRow = worksheet.addRow([row.section || '', '', '', '', '', '', '']);
      excelRow.font = { bold: true };
      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
    } else {
      const absentPercentValue = row.total && row.total > 0
        ? ((row.absent || 0) / row.total * 100).toFixed(2)
        : '0.00';

      const excelRow = worksheet.addRow([
        row.section || '',
        row.site || '',
        row.role || '',
        row.present || 0,
        row.absent || 0,
        row.total || 0,
        row.isTotal ? absentPercent : absentPercentValue,
      ]);

      if (row.isTotal) {
        excelRow.font = { bold: true };
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' },
        };
      }
    }
  });

  // Set column widths
  worksheet.columns = [
    { width: 20 },
    { width: 30 },
    { width: 25 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  return workbook;
}

