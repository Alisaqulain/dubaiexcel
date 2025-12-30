import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withSuperAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import SupplyLabour from '@/models/SupplyLabour';
import Subcontractor from '@/models/Subcontractor';
import AttendanceMaster from '@/models/AttendanceMaster';
import * as XLSX from 'xlsx';

/**
 * GET /api/admin/summary-report/export
 * Exports summary report to Excel format
 */
async function handleExportReport(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const reportDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Reuse the same calculation logic from the main route
    const employees = await Employee.find({ active: true }).lean();
    const attendance = await AttendanceMaster.find({ date: reportDate }).lean();
    const supplyLabour = await SupplyLabour.find({ 
      status: 'PRESENT',
      createdAt: { $lte: new Date(reportDate + 'T23:59:59') }
    }).lean();
    const subcontractors = await Subcontractor.find({
      createdAt: { $lte: new Date(reportDate + 'T23:59:59') }
    }).lean();

    // Helper functions (same as main route)
    const categorizeRole = (role: string): string => {
      const roleUpper = role.toUpperCase();
      if (roleUpper.includes('MBM') || roleUpper.includes('MANAGEMENT') || roleUpper.includes('MANAGER')) {
        return 'MBM_STAFF';
      }
      if (roleUpper.includes('SUPPORTING') || roleUpper.includes('SUPPORT')) {
        return 'SUPPORTING_STAFF';
      }
      if (roleUpper.includes('DOCUMENT')) {
        return 'DOCUMENT_CONTROLLER';
      }
      if (roleUpper.includes('SUPERVISOR') || roleUpper.includes('FOREMAN')) {
        return 'SUPERVISOR_FOREMAN';
      }
      if (roleUpper.includes('CHARGEHAND') || roleUpper.includes('CHARGE HAND')) {
        return 'CHARGEHAND';
      }
      if (roleUpper.includes('OFFICE BOY') || roleUpper.includes('SECURITY') || roleUpper.includes('BOY')) {
        return 'OFFICE_BOY_SECURITY';
      }
      return 'LABOUR';
    };

    const getAttendanceStatus = (empId: string): 'PRESENT' | 'ABSENT' => {
      const empAttendance = attendance.find(att => att.empId === empId);
      if (!empAttendance) return 'ABSENT';
      const status = empAttendance.status?.toLowerCase() || '';
      if (status.includes('present') || status === 'p') {
        return 'PRESENT';
      }
      return 'ABSENT';
    };

    // Group employees by site
    const siteGroups: Record<string, any> = {};
    employees.forEach(emp => {
      const siteKey = `${emp.siteType}_${emp.site}`;
      if (!siteGroups[siteKey]) {
        siteGroups[siteKey] = {
          siteType: emp.siteType,
          site: emp.site,
          categories: {
            MBM_STAFF: { present: 0, absent: 0 },
            SUPPORTING_STAFF: { present: 0, absent: 0 },
            DOCUMENT_CONTROLLER: { present: 0, absent: 0 },
            SUPERVISOR_FOREMAN: { present: 0, absent: 0 },
            CHARGEHAND: { present: 0, absent: 0 },
            OFFICE_BOY_SECURITY: { present: 0, absent: 0 },
            LABOUR: { present: 0, absent: 0 },
          },
        };
      }
      const category = categorizeRole(emp.role);
      const status = getAttendanceStatus(emp.empId);
      if (status === 'PRESENT') {
        siteGroups[siteKey].categories[category].present++;
      } else {
        siteGroups[siteKey].categories[category].absent++;
      }
    });

    // Organize by sections
    const sections: Record<string, any[]> = {
      HEAD_OFFICE: [],
      MEP_SITES: [],
      CIVIL_SITES: [],
      OTHER_SITES: [],
      SUPPORT_TEAM: [],
      OUTSOURCED_SITES: [],
    };

    Object.values(siteGroups).forEach((group: any) => {
      const siteType = group.siteType;
      if (siteType === 'HEAD_OFFICE') sections.HEAD_OFFICE.push(group);
      else if (siteType === 'MEP') sections.MEP_SITES.push(group);
      else if (siteType === 'CIVIL') sections.CIVIL_SITES.push(group);
      else if (siteType === 'SUPPORT') sections.SUPPORT_TEAM.push(group);
      else if (siteType === 'OUTSOURCED') sections.OUTSOURCED_SITES.push(group);
      else sections.OTHER_SITES.push(group);
    });

    const calculateSectionTotal = (sites: any[]) => {
      const totals: any = {
        MBM_STAFF: { present: 0, absent: 0 },
        SUPPORTING_STAFF: { present: 0, absent: 0 },
        DOCUMENT_CONTROLLER: { present: 0, absent: 0 },
        SUPERVISOR_FOREMAN: { present: 0, absent: 0 },
        CHARGEHAND: { present: 0, absent: 0 },
        OFFICE_BOY_SECURITY: { present: 0, absent: 0 },
        LABOUR: { present: 0, absent: 0 },
        labourSupply: 0,
        subContPresent: 0,
        subContTotal: 0,
      };
      sites.forEach(site => {
        Object.keys(site.categories).forEach(cat => {
          const categoryValue = totals[cat];
          if (categoryValue && typeof categoryValue === 'object' && 'present' in categoryValue) {
            categoryValue.present += site.categories[cat].present;
            categoryValue.absent += site.categories[cat].absent;
          }
        });
      });
      return totals;
    };

    const mepSupplyLabour = supplyLabour.filter(sl => {
      const emp = employees.find(e => e.empId === sl.empId);
      return emp?.siteType === 'MEP';
    }).length;
    const civilSupplyLabour = supplyLabour.filter(sl => {
      const emp = employees.find(e => e.empId === sl.empId);
      return emp?.siteType === 'CIVIL';
    }).length;

    const mepSubCont = subcontractors.filter(sub => {
      const emp = employees.find(e => e.projectId === sub.projectId);
      return emp?.siteType === 'MEP';
    });
    const mepSubContPresent = mepSubCont.reduce((sum, sub) => sum + (sub.employeesPresent || 0), 0);
    const civilSubCont = subcontractors.filter(sub => {
      const emp = employees.find(e => e.projectId === sub.projectId);
      return emp?.siteType === 'CIVIL';
    });
    const civilSubContPresent = civilSubCont.reduce((sum, sub) => sum + (sub.employeesPresent || 0), 0);

    const data = {
      reportDate,
      sections: {
        HEAD_OFFICE: { sites: sections.HEAD_OFFICE, totals: calculateSectionTotal(sections.HEAD_OFFICE) },
        MEP_SITES: { sites: sections.MEP_SITES, totals: { ...calculateSectionTotal(sections.MEP_SITES), labourSupply: mepSupplyLabour, subContPresent: mepSubContPresent, subContTotal: mepSubCont.length } },
        CIVIL_SITES: { sites: sections.CIVIL_SITES, totals: { ...calculateSectionTotal(sections.CIVIL_SITES), labourSupply: civilSupplyLabour, subContPresent: civilSubContPresent, subContTotal: civilSubCont.length } },
        OTHER_SITES: { sites: sections.OTHER_SITES, totals: calculateSectionTotal(sections.OTHER_SITES) },
        SUPPORT_TEAM: { sites: sections.SUPPORT_TEAM, totals: calculateSectionTotal(sections.SUPPORT_TEAM) },
        OUTSOURCED_SITES: { sites: sections.OUTSOURCED_SITES, totals: calculateSectionTotal(sections.OUTSOURCED_SITES) },
      },
      grandTotal: {} as any,
      absentBreakdown: {} as any,
      labourSupplyTotal: mepSupplyLabour + civilSupplyLabour,
      subContPresentTotal: mepSubContPresent + civilSubContPresent,
      subContTotalTotal: mepSubCont.length + civilSubCont.length,
    };

    // Calculate grand totals
    const allSectionTotals = Object.values(data.sections).map((s: any) => s.totals);
    const grandTotal = {
      MBM_STAFF: { present: 0, absent: 0 },
      SUPPORTING_STAFF: { present: 0, absent: 0 },
      DOCUMENT_CONTROLLER: { present: 0, absent: 0 },
      SUPERVISOR_FOREMAN: { present: 0, absent: 0 },
      CHARGEHAND: { present: 0, absent: 0 },
      OFFICE_BOY_SECURITY: { present: 0, absent: 0 },
      LABOUR: { present: 0, absent: 0 },
    };
    allSectionTotals.forEach((totals: any) => {
      Object.keys(grandTotal).forEach(cat => {
        if (totals[cat]) {
          grandTotal[cat as keyof typeof grandTotal].present += totals[cat].present;
          grandTotal[cat as keyof typeof grandTotal].absent += totals[cat].absent;
        }
      });
    });
    const totalPresent = Object.values(grandTotal).reduce((sum, cat) => sum + cat.present, 0);
    const totalAbsent = Object.values(grandTotal).reduce((sum, cat) => sum + cat.absent, 0);
    data.grandTotal = { ...grandTotal, totalPresent, totalAbsent, total: totalPresent + totalAbsent, absentPercentage: ((totalAbsent / (totalPresent + totalAbsent)) * 100).toFixed(2) };

    // Calculate absent breakdown
    const absentBreakdown = {
      MANAGEMENT: 0,
      MD_REFERENCE: 0,
      VACATION: 0,
      INACTIVE: employees.filter(e => !e.active).length,
      ABSCONDED: 0,
    };
    attendance.forEach(att => {
      const status = att.status?.toLowerCase() || '';
      if (status.includes('vacation')) absentBreakdown.VACATION++;
      else if (status.includes('md') || status.includes('reference')) absentBreakdown.MD_REFERENCE++;
      else if (status.includes('absconded') || status.includes('run away')) absentBreakdown.ABSCONDED++;
    });
    employees.forEach(emp => {
      const category = categorizeRole(emp.role);
      if (category === 'MBM_STAFF' && getAttendanceStatus(emp.empId) === 'ABSENT') {
        absentBreakdown.MANAGEMENT++;
      }
    });
    data.absentBreakdown = absentBreakdown;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Helper function to format date
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Create report sheet
    const reportData: any[] = [];

    // Header
    reportData.push(['SUMMARY OF MANPOWER']);
    reportData.push(['Date:', formatDate(reportDate)]);
    reportData.push(['HEAD OFFICE - BUSINESS BAY & SILICON OFFICE']);
    reportData.push([]);

    // Column headers
    const headers = [
      'S.NO',
      'SITE DETAILS',
      'MBM - STAFF',
      '',
      'SUPPORTING - STAFF',
      '',
      'DOCUMENT CONTROLLER',
      '',
      'SUPERVISOR/FOREMAN',
      '',
      'CHARGEHAND',
      '',
      'OFFICE BOY/SECURITY',
      '',
      'LABOUR',
      '',
      'TOTAL',
      'TOTAL-PRESENT',
    ];

    const headerRow1 = [
      'S.NO',
      'SITE DETAILS',
      'MBM - STAFF',
      '',
      'SUPPORTING - STAFF',
      '',
      'DOCUMENT CONTROLLER',
      '',
      'SUPERVISOR/FOREMAN',
      '',
      'CHARGEHAND',
      '',
      'OFFICE BOY/SECURITY',
      '',
      'LABOUR',
      '',
      'TOTAL',
      'TOTAL-PRESENT',
    ];

    const headerRow2 = [
      '',
      '',
      'Present',
      'Absent',
      'Present',
      'Absent',
      'Present',
      'Absent',
      'Present',
      'Absent',
      'Present',
      'Absent',
      'Present',
      'Absent',
      'Present',
      'Absent',
      '',
      '',
    ];

    reportData.push(headerRow1);
    reportData.push(headerRow2);

    // Helper to format site row
    const formatSiteRow = (site: any, index: number) => {
      const cats = site.categories;
      const total = Object.values(cats).reduce((sum: number, cat: any) => sum + cat.present + cat.absent, 0);
      const totalPresent = Object.values(cats).reduce((sum: number, cat: any) => sum + cat.present, 0);

      return [
        index + 1,
        site.site,
        cats.MBM_STAFF.present,
        cats.MBM_STAFF.absent,
        cats.SUPPORTING_STAFF.present,
        cats.SUPPORTING_STAFF.absent,
        cats.DOCUMENT_CONTROLLER.present,
        cats.DOCUMENT_CONTROLLER.absent,
        cats.SUPERVISOR_FOREMAN.present,
        cats.SUPERVISOR_FOREMAN.absent,
        cats.CHARGEHAND.present,
        cats.CHARGEHAND.absent,
        cats.OFFICE_BOY_SECURITY.present,
        cats.OFFICE_BOY_SECURITY.absent,
        cats.LABOUR.present,
        cats.LABOUR.absent,
        total,
        totalPresent,
      ];
    };

    // Helper to format totals row
    const formatTotalsRow = (totals: any, label: string, includeSupply = false) => {
      const total = Object.values(totals).reduce((sum: number, cat: any) => {
        if (typeof cat === 'object' && cat.present !== undefined) {
          return sum + cat.present + cat.absent;
        }
        return sum;
      }, 0);
      const totalPresent = Object.values(totals).reduce((sum: number, cat: any) => {
        if (typeof cat === 'object' && cat.present !== undefined) {
          return sum + cat.present;
        }
        return sum;
      }, 0);

      const row: any[] = [
        '',
        `TOTAL FOR ${label}`,
        totals.MBM_STAFF.present,
        totals.MBM_STAFF.absent,
        totals.SUPPORTING_STAFF.present,
        totals.SUPPORTING_STAFF.absent,
        totals.DOCUMENT_CONTROLLER.present,
        totals.DOCUMENT_CONTROLLER.absent,
        totals.SUPERVISOR_FOREMAN.present,
        totals.SUPERVISOR_FOREMAN.absent,
        totals.CHARGEHAND.present,
        totals.CHARGEHAND.absent,
        totals.OFFICE_BOY_SECURITY.present,
        totals.OFFICE_BOY_SECURITY.absent,
        totals.LABOUR.present,
        totals.LABOUR.absent,
        total,
        totalPresent,
      ];

      if (includeSupply) {
        row.push(totals.labourSupply || 0);
        row.push(totals.subContPresent || 0);
        row.push(totals.subContTotal || 0);
      }

      return row;
    };

    // Add sections
    let rowIndex = 0;

    // HEAD OFFICE
    reportData.push(['HEAD OFFICE']);
    data.sections.HEAD_OFFICE.sites.forEach((site: any) => {
      reportData.push(formatSiteRow(site, rowIndex++));
    });
    reportData.push(formatTotalsRow(data.sections.HEAD_OFFICE.totals, 'HEAD OFFICE'));
    reportData.push([]);

    // MEP SITES
    reportData.push(['MEP SITES']);
    rowIndex = 0;
    data.sections.MEP_SITES.sites.forEach((site: any) => {
      reportData.push(formatSiteRow(site, rowIndex++));
    });
    const mepHeaderWithSupply = [...headerRow1, 'LABOUR SUPPLY', 'SUB-CONT (PRESENT)', 'SUB-CONT (TOTAL)'];
    reportData.push(formatTotalsRow(data.sections.MEP_SITES.totals, 'MEP SITES', true));
    reportData.push([]);

    // CIVIL SITES
    reportData.push(['CIVIL SITES']);
    rowIndex = 0;
    data.sections.CIVIL_SITES.sites.forEach((site: any) => {
      reportData.push(formatSiteRow(site, rowIndex++));
    });
    reportData.push(formatTotalsRow(data.sections.CIVIL_SITES.totals, 'CIVIL SITES', true));
    reportData.push([]);

    // OTHER SITES
    reportData.push(['OTHER SITES']);
    rowIndex = 0;
    data.sections.OTHER_SITES.sites.forEach((site: any) => {
      reportData.push(formatSiteRow(site, rowIndex++));
    });
    reportData.push(formatTotalsRow(data.sections.OTHER_SITES.totals, 'OTHER SITES'));
    reportData.push([]);

    // SUPPORT TEAM
    reportData.push(['SUPPORT TEAM']);
    rowIndex = 0;
    data.sections.SUPPORT_TEAM.sites.forEach((site: any) => {
      reportData.push(formatSiteRow(site, rowIndex++));
    });
    reportData.push(formatTotalsRow(data.sections.SUPPORT_TEAM.totals, 'SUPPORT TEAM'));
    reportData.push([]);

    // OUTSOURCED SITES
    reportData.push(['OUTSOURCED SITES']);
    rowIndex = 0;
    data.sections.OUTSOURCED_SITES.sites.forEach((site: any) => {
      reportData.push(formatSiteRow(site, rowIndex++));
    });
    reportData.push(formatTotalsRow(data.sections.OUTSOURCED_SITES.totals, 'OUTSOURCED SITES'));
    reportData.push([]);

    // TOTAL ACTIVE EMPLOYEES
    reportData.push(['TOTAL ACTIVE EMPLOYEES']);
    const totalActiveRow = [
      '',
      'TOTAL ACTIVE EMPLOYEES',
      data.grandTotal.MBM_STAFF.present,
      data.grandTotal.MBM_STAFF.absent,
      data.grandTotal.SUPPORTING_STAFF.present,
      data.grandTotal.SUPPORTING_STAFF.absent,
      data.grandTotal.DOCUMENT_CONTROLLER.present,
      data.grandTotal.DOCUMENT_CONTROLLER.absent,
      data.grandTotal.SUPERVISOR_FOREMAN.present,
      data.grandTotal.SUPERVISOR_FOREMAN.absent,
      data.grandTotal.CHARGEHAND.present,
      data.grandTotal.CHARGEHAND.absent,
      data.grandTotal.OFFICE_BOY_SECURITY.present,
      data.grandTotal.OFFICE_BOY_SECURITY.absent,
      data.grandTotal.LABOUR.present,
      data.grandTotal.LABOUR.absent,
      data.grandTotal.total,
      data.grandTotal.totalPresent,
    ];
    reportData.push(totalActiveRow);

    // TOTAL ABSENT
    reportData.push([]);
    reportData.push(['TOTAL ABSENT', data.grandTotal.totalAbsent, `Absent %: ${data.grandTotal.absentPercentage}%`]);
    reportData.push([]);

    // ABSENT BREAKDOWN
    reportData.push(['ABSENT BREAKDOWN']);
    reportData.push(['MANAGEMENT', data.absentBreakdown.MANAGEMENT]);
    reportData.push(['MD REFERENCE', data.absentBreakdown.MD_REFERENCE]);
    reportData.push(['VACATION', data.absentBreakdown.VACATION]);
    reportData.push(['INACTIVE', data.absentBreakdown.INACTIVE]);
    reportData.push(['ABSCONDED - RUN AWAY', data.absentBreakdown.ABSCONDED]);
    reportData.push([]);

    // GRAND TOTAL
    reportData.push(['GRAND TOTAL', data.grandTotal.total, data.labourSupplyTotal, data.subContPresentTotal, data.subContTotalTotal]);

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(reportData);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 8 },  // S.NO
      { wch: 40 }, // SITE DETAILS
      { wch: 10 }, // MBM Present
      { wch: 10 }, // MBM Absent
      { wch: 10 }, // Supporting Present
      { wch: 10 }, // Supporting Absent
      { wch: 10 }, // Document Present
      { wch: 10 }, // Document Absent
      { wch: 10 }, // Supervisor Present
      { wch: 10 }, // Supervisor Absent
      { wch: 10 }, // Chargehand Present
      { wch: 10 }, // Chargehand Absent
      { wch: 10 }, // Office Boy Present
      { wch: 10 }, // Office Boy Absent
      { wch: 10 }, // Labour Present
      { wch: 10 }, // Labour Absent
      { wch: 10 }, // TOTAL
      { wch: 12 }, // TOTAL-PRESENT
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Manpower Summary');

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="manpower_summary_${reportDate}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export report' },
      { status: 500 }
    );
  }
}

export const GET = withSuperAdmin(handleExportReport);

