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
  const { token, user } = useAuth();
  const [dataType, setDataType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSuperAdmin = user?.role === 'super-admin';

  const handleClear = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!confirm) {
      setMessage({ type: 'error', text: 'Please confirm by checking the confirmation box' });
      return;
    }

    if (!dataType) {
      setMessage({ type: 'error', text: 'Please select data type to clear' });
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
        body: JSON.stringify({
          dataType,
          projectId: projectId || undefined,
          confirm: true,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Data cleared successfully' });
        setConfirm(false);
        setDataType('');
        setProjectId('');
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to clear data' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to clear data' });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Clear Data</h1>
        {!isSuperAdmin && (
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            <strong>Note:</strong> As Admin, you can only clear project-specific data. Super Admin can clear all data.
          </div>
        )}

        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleClear} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Type *
            </label>
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select data type...</option>
              <option value="EMPLOYEES">Employees</option>
              <option value="SUPPLY_LABOUR">Supply Labour</option>
              <option value="SUBCONTRACTOR">Subcontractor</option>
              <option value="ATTENDANCE">Attendance Records</option>
              <option value="UPLOADS">Excel Uploads</option>
              {isSuperAdmin && <option value="ALL">All Data (Super Admin Only)</option>}
            </select>
          </div>

          {!isSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project ID *
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="Enter project ID"
              />
              <p className="text-xs text-gray-500 mt-1">Admin can only clear data for specific projects</p>
            </div>
          )}

          {isSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project ID (Optional)
              </label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave empty to clear all"
              />
            </div>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="confirm"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="confirm" className="text-sm text-gray-700">
              I understand this action cannot be undone
            </label>
          </div>

          <button
            type="submit"
            disabled={clearing || !confirm}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clearing ? 'Clearing...' : 'Clear Data'}
          </button>
        </form>
      </div>
    </div>
  );
}






