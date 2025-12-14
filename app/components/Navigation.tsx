'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function Navigation() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/dashboard" className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
              Dashboard
            </Link>
            {/* Excel Interface - Available to all authenticated users (includes upload and create) */}
            <Link
              href="/excel"
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                isActive('/excel') || isActive('/admin/upload') ? 'bg-blue-800' : 'hover:bg-blue-700'
              }`}
            >
              Excel Interface
            </Link>
            {user.role === 'admin' && (
              <>
                <Link
                  href="/admin/users"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/users') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Users
                </Link>
                <Link
                  href="/admin/employees"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/employees') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Employees
                </Link>
                <Link
                  href="/admin/files"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/files') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  All Files
                </Link>
                <Link
                  href="/admin/logs"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/logs') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Logs
                </Link>
                <Link
                  href="/reports/download-excel"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/reports/download-excel') ? 'bg-blue-800' : 'hover:bg-blue-700'
                  }`}
                >
                  Download Excel
                </Link>
                <Link
                  href="/admin/clear-data"
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    isActive('/admin/clear-data') ? 'bg-red-800' : 'hover:bg-red-700'
                  }`}
                >
                  Clear Data
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

