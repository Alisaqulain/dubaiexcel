'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

interface EmployeeCounts {
  active: number;
  inactive: number;
  total: number;
}

export default function Navigation() {
  const { user, token, logout } = useAuth();
  const pathname = usePathname();
  const [employeeCounts, setEmployeeCounts] = useState<EmployeeCounts | null>(null);

  const isActive = (path: string) => pathname === path;

  const fetchEmployeeCounts = async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/admin/employees/counts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setEmployeeCounts(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch employee counts:', err);
    }
  };

  // Fetch employee counts for admin and super-admin users
  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super-admin') && token) {
      fetchEmployeeCounts();
      // Refresh counts every 30 seconds
      const interval = setInterval(fetchEmployeeCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.role, token]);

  if (!user) return null;

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/dashboard" className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${isActive('/dashboard') ? 'bg-blue-800' : 'hover:bg-blue-700'}`}>
              Dashboard
            </Link>
            {(user.role === 'super-admin' || user.role === 'admin') && (
              <Link
                href="/admin/format-view"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/admin/format-view') || isActive('/admin/emp-pick') ? 'bg-blue-800' : 'hover:bg-blue-700'
                }`}
              >
                Format & picks
              </Link>
            )}
            {(user.role === 'super-admin' || user.role === 'admin') && (
              <Link
                href="/admin/deleted-data"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/admin/deleted-data') ? 'bg-blue-800' : 'hover:bg-blue-700'
                }`}
              >
                Deleted data
              </Link>
            )}
          
            {(user.role === 'super-admin' || user.role === 'admin') && (
              <Link
                href="/admin/all-merge-data"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/admin/all-merge-data') ? 'bg-blue-800' : 'hover:bg-blue-700'
                }`}
              >
                All merge data
              </Link>
            )}
            {(user.role === 'super-admin' || user.role === 'admin') && (
              <Link
                href="/admin/excel-formats"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/admin/excel-formats') ? 'bg-blue-800' : 'hover:bg-blue-700'
                }`}
              >
                Excel formats
              </Link>
            )}
            {/* Super Admin & Admin Navigation */}
            {(user.role === 'super-admin' || user.role === 'admin') && (
              <>
            
                <Link
                  href="/admin/employees"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Users
                  {employeeCounts && (
                    <span className="ml-2 flex items-center gap-1">
                      <span className="px-1.5 py-0.5 text-xs rounded bg-green-500">
                        {employeeCounts.active}
                      </span>
                      <span className="px-1.5 py-0.5 text-xs rounded bg-red-500">
                        {employeeCounts.inactive}
                      </span>
                    </span>
                  )}
                </Link>
              </>
            )}
            {/* User Navigation */}
            {user.role === 'user' && (
              <>
                <Link
                  href="/admin/upload"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/upload') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Upload Excel
                </Link>
                <Link
                  href="/dashboard"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/dashboard') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  My Reports
                </Link>
              </>
            )}
            {user.role === 'employee' && (
              <Link
                href="/dashboard/unified-data"
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/dashboard/unified-data') ? 'bg-blue-800' : 'hover:bg-blue-700'
                }`}
              >
                Shared data
              </Link>
            )}
          </div>
          <div className="flex items-center">
            <div className="flex items-center mr-4">
              <span className="text-sm mr-2">{user.email}</span>
              <span className={`px-2 py-1 text-xs rounded-full font-semibold ${
                user.role === 'super-admin' ? 'bg-purple-500 text-white' :
                user.role === 'admin' ? 'bg-green-500 text-white' :
                user.role === 'employee' ? 'bg-teal-500 text-white' :
                'bg-gray-500 text-white'
              }`}>
                {user.role === 'super-admin' ? 'SUPER ADMIN' :
                 user.role === 'admin' ? 'ADMIN' :
                 user.role === 'employee' ? 'EMPLOYEE' :
                 'USER'}
              </span>
            </div>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
