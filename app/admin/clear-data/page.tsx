'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

export default function ClearDataPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <ClearDataComponent />
    </ProtectedRoute>
  );
}

function ClearDataComponent() {
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; details?: any } | null>(null);
  const { token } = useAuth();

  const handleClearData = async () => {
    const confirmed = confirm(
      '⚠️ WARNING: This will delete ALL static data including:\n\n' +
      '• All attendance records (AttendanceMaster)\n' +
      '• All raw attendance data (AttendanceRaw)\n' +
      '• All employees\n' +
      '• All upload records\n' +
      '• All upload logs\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Users and Roles will be preserved.\n\n' +
      'Are you absolutely sure you want to proceed?'
    );

    if (!confirmed) {
      return;
    }

    // Double confirmation
    const doubleConfirm = confirm(
      '⚠️ FINAL CONFIRMATION ⚠️\n\n' +
      'You are about to PERMANENTLY DELETE all static data.\n\n' +
      'Type "DELETE" in the next prompt to confirm.'
    );

    if (!doubleConfirm) {
      return;
    }

    setClearing(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/clear-data', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to clear data');
      }

      setMessage({
        type: 'success',
        text: result.message || 'All static data cleared successfully',
        details: result.deleted,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to clear data',
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-red-600">Clear All Static Data</h1>

        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-red-200">
          <div className="mb-6">
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex items-center">
                <svg className="w-6 h-6 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-red-800">Danger Zone</h3>
                  <p className="text-sm text-red-700 mt-1">
                    This action will permanently delete all static data from the system.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">What will be deleted:</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li><strong>AttendanceMaster</strong> - All processed attendance records</li>
                <li><strong>AttendanceRaw</strong> - All raw uploaded attendance data</li>
                <li><strong>Employees</strong> - All employee master records</li>
                <li><strong>Uploads</strong> - All upload file records</li>
                <li><strong>UploadLogs</strong> - All upload activity logs</li>
              </ul>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">What will be preserved:</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li><strong>Users</strong> - All system user accounts</li>
                <li><strong>Roles</strong> - All role definitions and configurations</li>
              </ul>
            </div>
          </div>

          <button
            onClick={handleClearData}
            disabled={clearing}
            className="w-full bg-red-600 text-white py-3 px-6 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg transition-colors flex items-center justify-center gap-2"
          >
            {clearing ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Clearing Data...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All Static Data
              </>
            )}
          </button>

          {message && (
            <div className={`mt-6 p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <div className="flex items-start gap-2">
                {message.type === 'success' ? (
                  <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <div className="flex-1">
                  <p className="font-medium">{message.text}</p>
                  {message.details && (
                    <div className="mt-2 text-sm">
                      <p className="font-semibold mb-1">Deleted Records:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>AttendanceMaster: {message.details.attendanceMaster || 0}</li>
                        <li>AttendanceRaw: {message.details.attendanceRaw || 0}</li>
                        <li>Employees: {message.details.employees || 0}</li>
                        <li>Uploads: {message.details.uploads || 0}</li>
                        <li>UploadLogs: {message.details.uploadLogs || 0}</li>
                        <li className="font-semibold mt-2">
                          Total: {message.details.totalDeleted || 0} records
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


