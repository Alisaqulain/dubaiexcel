'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!user) return null;

  const isActive = (path: string) => pathname === path;
  const statusParam = searchParams.get('status');

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/dashboard" className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
              Dashboard
            </Link>
            {(user.role === 'admin' || user.role === 'super-admin') && (
              <>
                <Link
                  href="/admin/upload"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/upload') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Upload
                </Link>
                <Link
                  href="/admin/employees"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  All Employees
                </Link>
                <Link
                  href="/admin/employees?status=active"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') && statusParam === 'active' ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Active Employees
                </Link>
                <Link
                  href="/admin/employees?status=inactive"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') && statusParam === 'inactive' ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Inactive Employees
                </Link>
                <Link
                  href="/reports/download-excel"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/reports/download-excel') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Download Excel
                </Link>
              </>
            )}
            {user.role === 'e1-user' && (
              <>
                <Link
                  href="/admin/employees?status=active"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') && statusParam === 'active' ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Active Employees
                </Link>
                <Link
                  href="/admin/employees?status=inactive"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') && statusParam === 'inactive' ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Inactive Employees
                </Link>
              </>
            )}
          </div>
          <div className="flex items-center">
            <span className="text-sm mr-4">{user.email}</span>
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

