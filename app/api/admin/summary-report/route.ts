import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withSuperAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import SupplyLabour from '@/models/SupplyLabour';
import Subcontractor from '@/models/Subcontractor';
import AttendanceMaster from '@/models/AttendanceMaster';

/**
 * GET /api/admin/summary-report
 * Generates comprehensive manpower summary report
 */
async function handleGetSummaryReport(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const reportDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get all active employees
    const employees = await Employee.find({ active: true }).lean();
    
    // Get attendance for the report date
    const attendance = await AttendanceMaster.find({ date: reportDate }).lean();
    
    // Get supply labour for the date
    const supplyLabour = await SupplyLabour.find({ 
      status: 'PRESENT',
      createdAt: { $lte: new Date(reportDate + 'T23:59:59') }
    }).lean();
    
    // Get subcontractor data
    const subcontractors = await Subcontractor.find({
      createdAt: { $lte: new Date(reportDate + 'T23:59:59') }
    }).lean();

    // Helper function to categorize employee role
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
      if (roleUpper.includes('LABOUR') || roleUpper.includes('LABOR')) {
        return 'LABOUR';
      }
      return 'LABOUR'; // Default
    };

    // Helper function to get attendance status
    const getAttendanceStatus = (empId: string): 'PRESENT' | 'ABSENT' => {
      const empAttendance = attendance.find(att => att.empId === empId);
      if (!empAttendance) return 'ABSENT';
      const status = empAttendance.status?.toLowerCase() || '';
      if (status.includes('present') || status === 'p') {
        return 'PRESENT';
      }
      return 'ABSENT';
    };

    // Group employees by site and site type
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
      if (siteType === 'HEAD_OFFICE') {
        sections.HEAD_OFFICE.push(group);
      } else if (siteType === 'MEP') {
        sections.MEP_SITES.push(group);
      } else if (siteType === 'CIVIL') {
        sections.CIVIL_SITES.push(group);
      } else if (siteType === 'SUPPORT') {
        sections.SUPPORT_TEAM.push(group);
      } else if (siteType === 'OUTSOURCED') {
        sections.OUTSOURCED_SITES.push(group);
      } else {
        sections.OTHER_SITES.push(group);
      }
    });

    // Calculate section totals
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

    // Calculate supply labour and subcontractor totals for MEP and CIVIL
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
    const mepSubContTotal = mepSubCont.length;

    const civilSubCont = subcontractors.filter(sub => {
      const emp = employees.find(e => e.projectId === sub.projectId);
      return emp?.siteType === 'CIVIL';
    });
    const civilSubContPresent = civilSubCont.reduce((sum, sub) => sum + (sub.employeesPresent || 0), 0);
    const civilSubContTotal = civilSubCont.length;

    // Calculate grand totals
    const allSectionTotals = Object.values(sections).map(calculateSectionTotal);
    const grandTotal = {
      MBM_STAFF: { present: 0, absent: 0 },
      SUPPORTING_STAFF: { present: 0, absent: 0 },
      DOCUMENT_CONTROLLER: { present: 0, absent: 0 },
      SUPERVISOR_FOREMAN: { present: 0, absent: 0 },
      CHARGEHAND: { present: 0, absent: 0 },
      OFFICE_BOY_SECURITY: { present: 0, absent: 0 },
      LABOUR: { present: 0, absent: 0 },
    };

    allSectionTotals.forEach(totals => {
      Object.keys(grandTotal).forEach(cat => {
        grandTotal[cat as keyof typeof grandTotal].present += totals[cat as keyof typeof totals].present;
        grandTotal[cat as keyof typeof grandTotal].absent += totals[cat as keyof typeof totals].absent;
      });
    });

    const totalPresent = Object.values(grandTotal).reduce((sum, cat) => sum + cat.present, 0);
    const totalAbsent = Object.values(grandTotal).reduce((sum, cat) => sum + cat.absent, 0);
    const grandTotalCount = totalPresent + totalAbsent;
    const absentPercentage = grandTotalCount > 0 ? ((totalAbsent / grandTotalCount) * 100).toFixed(2) : '0.00';

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
      if (status.includes('vacation')) {
        absentBreakdown.VACATION++;
      } else if (status.includes('md') || status.includes('reference')) {
        absentBreakdown.MD_REFERENCE++;
      } else if (status.includes('absconded') || status.includes('run away')) {
        absentBreakdown.ABSCONDED++;
      }
    });

    // Count management absent
    employees.forEach(emp => {
      const category = categorizeRole(emp.role);
      if (category === 'MBM_STAFF') {
        const status = getAttendanceStatus(emp.empId);
        if (status === 'ABSENT') {
          absentBreakdown.MANAGEMENT++;
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        reportDate,
        sections: {
          HEAD_OFFICE: {
            sites: sections.HEAD_OFFICE,
            totals: calculateSectionTotal(sections.HEAD_OFFICE),
          },
          MEP_SITES: {
            sites: sections.MEP_SITES,
            totals: { ...calculateSectionTotal(sections.MEP_SITES), labourSupply: mepSupplyLabour, subContPresent: mepSubContPresent, subContTotal: mepSubContTotal },
          },
          CIVIL_SITES: {
            sites: sections.CIVIL_SITES,
            totals: { ...calculateSectionTotal(sections.CIVIL_SITES), labourSupply: civilSupplyLabour, subContPresent: civilSubContPresent, subContTotal: civilSubContTotal },
          },
          OTHER_SITES: {
            sites: sections.OTHER_SITES,
            totals: calculateSectionTotal(sections.OTHER_SITES),
          },
          SUPPORT_TEAM: {
            sites: sections.SUPPORT_TEAM,
            totals: calculateSectionTotal(sections.SUPPORT_TEAM),
          },
          OUTSOURCED_SITES: {
            sites: sections.OUTSOURCED_SITES,
            totals: calculateSectionTotal(sections.OUTSOURCED_SITES),
          },
        },
        grandTotal: {
          ...grandTotal,
          totalPresent,
          totalAbsent,
          total: grandTotalCount,
          absentPercentage,
        },
        absentBreakdown,
        labourSupplyTotal: mepSupplyLabour + civilSupplyLabour,
        subContPresentTotal: mepSubContPresent + civilSubContPresent,
        subContTotalTotal: mepSubContTotal + civilSubContTotal,
      },
    });
  } catch (error: any) {
    console.error('Summary report error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary report' },
      { status: 500 }
    );
  }
}

export const GET = withSuperAdmin(handleGetSummaryReport);

