'use client';

import Link from 'next/link';
import Navigation from '../components/Navigation';
import { useAuth } from '../context/AuthContext';

export default function UnauthorizedPage() {
  const { user } = useAuth();

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <svg
              className="mx-auto h-16 w-16 text-yellow-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Access Restricted
          </h1>
          
          <p className="text-gray-600 mb-6">
            You don&apos;t have permission to access this page. This area is reserved for administrators only.
          </p>

          {user && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Logged in as:</strong> {user.email}
                <br />
                <strong>Role:</strong> {user.role === 'admin' ? 'Administrator' : 'Employee'}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="block w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Go to Dashboard
            </Link>
            
            <Link
              href="/excel"
              className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-200 transition-colors font-medium"
            >
              Excel Interface
            </Link>
          </div>

          <p className="text-sm text-gray-500 mt-6">
            Need admin access? Contact your system administrator.
          </p>
        </div>
      </div>
    </>
  );
}

