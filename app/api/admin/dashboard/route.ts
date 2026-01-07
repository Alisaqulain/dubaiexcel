import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withViewAccess } from '@/lib/middleware';
import AttendanceMaster from '@/models/AttendanceMaster';
import Employee from '@/models/Employee';
import Upload from '@/models/Upload';
import AttendanceRaw from '@/models/AttendanceRaw';

async function handleGetDashboard(req: NextRequest) {
  try {
    await connectDB();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get all employees
    const employees = await Employee.find().lean();
    const totalHeadcount = employees.length;
    const activeEmployees = employees.filter(emp => emp.active).length;
    const inactiveEmployees = totalHeadcount - activeEmployees;

    // Get today's attendance
    const todayAttendance = await AttendanceMaster.find({ date: todayStr }).lean();
    
    const present = todayAttendance.filter(att => 
      att.status?.toLowerCase().includes('present') || 
      att.status?.toLowerCase() === 'p'
    ).length;
    
    const absent = todayAttendance.filter(att => 
      att.status?.toLowerCase().includes('absent') || 
      att.status?.toLowerCase() === 'a'
    ).length;

    const vacation = todayAttendance.filter(att => 
      att.status?.toLowerCase().includes('vacation')
    ).length;

    const visaMedical = todayAttendance.filter(att => 
      att.status?.toLowerCase().includes('visa') || 
      att.status?.toLowerCase().includes('medical')
    ).length;

    const weekOff = todayAttendance.filter(att => 
      att.status?.toLowerCase().includes('week') || 
      att.status?.toLowerCase().includes('off')
    ).length;

    const sickLeave = todayAttendance.filter(att => 
      att.status?.toLowerCase().includes('sick')
    ).length;

    const absentPercent = totalHeadcount > 0 ? ((absent / totalHeadcount) * 100).toFixed(2) : '0.00';

    // Division-wise distribution
    const divisions = {
      CIVIL: 0,
      MEP: 0,
      ALUMINIUM: 0,
    };

    employees.forEach(emp => {
      if (emp.siteType === 'CIVIL') divisions.CIVIL++;
      else if (emp.siteType === 'MEP') divisions.MEP++;
      else if (emp.siteType === 'OTHER') divisions.ALUMINIUM++;
    });

    // Staff/Labour distribution
    const staffLabour: Record<string, number> = {};
    employees.forEach(emp => {
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

    // Nationality distribution (mock - can be enhanced with employee schema)
    const nationalities: Record<string, number> = {
      'INDIA': Math.floor(totalHeadcount * 0.635),
      'BANGLADESH': Math.floor(totalHeadcount * 0.088),
      'EGYPT': Math.floor(totalHeadcount * 0.088),
      'PAKISTAN': Math.floor(totalHeadcount * 0.041),
      'NEPAL': Math.floor(totalHeadcount * 0.033),
      'PHILIPPINES': Math.floor(totalHeadcount * 0.015),
      'UNITED ARAB EMIRATES': Math.floor(totalHeadcount * 0.009),
      'SRI LANKA': Math.floor(totalHeadcount * 0.007),
      'SUDAN': Math.floor(totalHeadcount * 0.005),
      'INDONESIA': Math.floor(totalHeadcount * 0.002),
    };

    // Department distribution
    const departments: Record<string, number> = {};
    employees.forEach(emp => {
      const dept = emp.department || 'UNASSIGNED';
      departments[dept] = (departments[dept] || 0) + 1;
    });

    // Camp/Site distribution
    const camps: Record<string, number> = {};
    employees.forEach(emp => {
      const camp = emp.site || 'UNKNOWN';
      camps[camp] = (camps[camp] || 0) + 1;
    });

    // Attendance type (mock - can track in attendance records)
    const attendanceTypes = {
      BIOMETRIC: Math.floor(totalHeadcount * 0.85),
      MANUAL: Math.floor(totalHeadcount * 0.10),
      'NEED TO CHECK': Math.floor(totalHeadcount * 0.05),
    };

    // Date-wise absent count (last 9 days)
    const dates = [];
    for (let i = 8; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const absentCountDateWise = await Promise.all(
      dates.map(async (date) => {
        const dayAttendance = await AttendanceMaster.find({ date }).lean();
        return dayAttendance.filter(att => 
          att.status?.toLowerCase().includes('absent') || 
          att.status?.toLowerCase() === 'a'
        ).length;
      })
    );

    // Project-wise distribution
    const mepProjects = [
      { name: 'FINA BUSINESS BAY', present: 350, absent: 10 },
      { name: 'ELEGANT TOWER PROJECT MEP', present: 258, absent: 6 },
      { name: 'CHIC TOWER PROJECT MEP', present: 207, absent: 5 },
    ];

    const civilAluminiumProjects = [
      { name: 'EMIRATES BAY 2 - PROPOSED', present: 425, absent: 12 },
      { name: 'LAGOON VILLAS MEP', present: 310, absent: 8 },
      { name: 'EDGE WATER RESIDENCES AT', present: 178, absent: 5 },
    ];

    // Recent uploads
    const recentUploads = await Upload.find()
      .sort({ uploadedAt: -1 })
      .limit(10)
      .lean();

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

export const GET = withViewAccess(handleGetDashboard);

