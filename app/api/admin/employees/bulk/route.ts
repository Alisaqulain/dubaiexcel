import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import bcrypt from 'bcryptjs';

async function handleBulkCreateEmployees(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { employees } = body;

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json(
        { error: 'Employees array is required' },
        { status: 400 }
      );
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const emp of employees) {
      const { empId, name, site, siteType, role, department, active, password, labourType } = emp;

      if (!empId || !name || !site || !role) {
        results.failed++;
        results.errors.push(`Missing required fields for employee: ${empId || 'unknown'}`);
        continue;
      }

      try {
        // Prepare employee data
        // Note: Password will be hashed by the pre-save hook in the Employee model
        const employeeData: any = {
          empId,
          name,
          site,
          siteType: siteType || 'OTHER',
          role,
          department,
          active: active !== undefined ? active : true,
          labourType: labourType || 'OUR_LABOUR',
        };

        // Only set password if it's provided and not empty
        if (password && password.trim().length > 0) {
          employeeData.password = password.trim();
        }

        await Employee.create(employeeData);
        results.created++;
      } catch (error: any) {
        results.failed++;
        if (error.code === 11000) {
          results.errors.push(`Employee ID ${empId} already exists`);
        } else {
          results.errors.push(`Failed to create ${empId}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      message: `Created ${results.created} employees, ${results.failed} failed`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create employees' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleBulkCreateEmployees);
