import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import AttendanceMaster from '@/models/AttendanceMaster';

async function handleGetDashboard(req: AuthenticatedRequest) {
  try {
    await connectDB();

    // Fetch all employees
    const employees = await Employee.find().lean();

    // Calculate current date and date range (last 9 days)
    const today = new Date();
    const dates = [];
    for (let i = 8; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    // Calculate metrics
    const totalHeadcount = employees.length;
    const activeEmployees = employees.filter(emp => emp.active).length;

    // Get today's attendance from AttendanceMaster
    const todayStr = today.toISOString().split('T')[0];
    const todayAttendance = await AttendanceMaster.find({ date: todayStr }).lean();

    const present = todayAttendance.filter((att: any) => 
      att.status?.toLowerCase().includes('present') || 
      att.status?.toLowerCase() === 'p'
    ).length;
    
    const absent = todayAttendance.filter((att: any) => 
      att.status?.toLowerCase().includes('absent') || 
      att.status?.toLowerCase() === 'a'
    ).length;

    const vacation = todayAttendance.filter((att: any) => 
      att.status?.toLowerCase().includes('vacation')
    ).length;

    const visaMedical = todayAttendance.filter((att: any) => 
      att.status?.toLowerCase().includes('visa') || 
      att.status?.toLowerCase().includes('medical')
    ).length;

    const weekOff = todayAttendance.filter((att: any) => 
      att.status?.toLowerCase().includes('week') || 
      att.status?.toLowerCase().includes('off')
    ).length;

    const sickLeave = todayAttendance.filter((att: any) => 
      att.status?.toLowerCase().includes('sick')
    ).length;

    const absentPercent = totalHeadcount > 0 ? ((absent / totalHeadcount) * 100).toFixed(2) : '0.00';

    // Division-wise distribution (based on role or name patterns)
    const divisions = {
      CIVIL: 0,
      MEP: 0,
      ALUMINIUM: 0,
    };

    employees.forEach((emp: any) => {
      if (emp.siteType === 'CIVIL') {
        divisions.CIVIL++;
      } else if (emp.siteType === 'MEP') {
        divisions.MEP++;
      } else if (emp.siteType === 'OTHER' || emp.siteType === 'OUTSOURCED') {
        divisions.ALUMINIUM++;
      } else {
        // Default to ALUMINIUM for other types
        divisions.ALUMINIUM++;
      }
    });

    // Staff/Labour distribution (based on role)
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

    // Nationality distribution (mock data for demo)
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

    // Department distribution (mock data)
    const departments: Record<string, number> = {
      'TECHNICAL & DESIGN': 27,
      'HUMAN RESOURCES': 24,
      'IT': 20,
      'PROCUREMENT': 20,
      'ACCOUNTS': 14,
      'HSE': 12,
      'LOGISTICS & TRANSPORTATION': 10,
      'SALES': 10,
      'MARKETING': 8,
      'PLANNING': 7,
      'LEGAL': 3,
      'PROJECTS': 2,
    };

    // Camp distribution (mock data)
    const camps: Record<string, number> = {
      'JABAL ALI CAMP MEP': 1160,
      'SONAPUR CAMP': 801,
      'JABAL ALI CAMP-PAREO': 685,
      'DIP CAMP': 445,
      'PERSONAL': 330,
      'CLIENT CAMP': 72,
      'BATAYAH GROUND': 13,
    };

    // Attendance type distribution
    const attendanceTypes = {
      BIOMETRIC: Math.floor(totalHeadcount * 0.85),
      MANUAL: Math.floor(totalHeadcount * 0.10),
      'NEED TO CHECK': Math.floor(totalHeadcount * 0.05),
    };

    // Date-wise absent count
    const absentCountDateWise = await Promise.all(
      dates.map(async (date) => {
        const dayAttendance = await AttendanceMaster.find({ date }).lean();
        return dayAttendance.filter((att: any) => 
          att.status?.toLowerCase().includes('absent') || 
          att.status?.toLowerCase() === 'a'
        ).length;
      })
    );

    // Project-wise distribution (mock data for MEP and Civil/Aluminium)
    const mepProjects = [
      { name: 'FINA BUSINESS BAY', present: 350, absent: 10 },
      { name: 'ELEGANT TOWER PROJECT MEP', present: 258, absent: 6 },
      { name: 'CHIC TOWER PROJECT MEP', present: 207, absent: 5 },
      { name: 'PROJECT MEP 4', present: 176, absent: 4 },
      { name: 'PROJECT MEP 5', present: 150, absent: 3 },
      { name: 'PROJECT MEP 6', present: 124, absent: 2 },
      { name: 'PROJECT MEP 7', present: 94, absent: 2 },
      { name: 'PROJECT MEP 8', present: 87, absent: 1 },
    ];

    const civilAluminiumProjects = [
      { name: 'EMIRATES BAY 2 - PROPOSED', present: 425, absent: 12 },
      { name: 'LAGOON VILLAS MEP', present: 310, absent: 8 },
      { name: 'EDGE WATER RESIDENCES AT', present: 178, absent: 5 },
      { name: 'CIVIL PROJECT 4', present: 170, absent: 4 },
      { name: 'CIVIL PROJECT 5', present: 128, absent: 3 },
      { name: 'CIVIL PROJECT 6', present: 126, absent: 3 },
      { name: 'CIVIL PROJECT 7', present: 119, absent: 2 },
      { name: 'CIVIL PROJECT 8', present: 110, absent: 2 },
    ];

    return NextResponse.json({
      success: true,
      data: {
        metrics: {
          totalHeadcount,
          activeEmployees,
          inactiveEmployees: totalHeadcount - activeEmployees,
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

export const GET = withAuth(handleGetDashboard);


