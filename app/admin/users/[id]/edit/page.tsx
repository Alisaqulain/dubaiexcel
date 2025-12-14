'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ProtectedRoute } from '../../../../components/ProtectedRoute';
import Navigation from '../../../../components/Navigation';
import { useAuth } from '../../../../context/AuthContext';

interface User {
  _id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'e1-user';
  isActive: boolean;
  canUpload: boolean;
}

export default function EditUserPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <EditUserComponent />
    </ProtectedRoute>
  );
}

function EditUserComponent() {
  const params = useParams();
  const userId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'e1-user' as 'admin' | 'e1-user',
    isActive: true,
    canUpload: true,
  });
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const fetchUser = async () => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setUser(result.data);
        setFormData({
          fullName: result.data.fullName,
          email: result.data.email,
          role: result.data.role,
          isActive: result.data.isActive,
          canUpload: result.data.canUpload,
        });
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (result.success) {
        router.push('/admin/users');
      } else {
        setError(result.error || 'Failed to update user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    if (!confirm('Are you sure you want to reset this user\'s password?')) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword }),
      });

      const result = await response.json();
      if (result.success) {
        alert('Password reset successfully');
        setNewPassword('');
      } else {
        alert(result.error || 'Failed to reset password');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!user) {
    return <div className="p-6">User not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Edit User</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role *
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'e1-user' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="e1-user">E1 User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.canUpload}
                  onChange={(e) => setFormData({ ...formData, canUpload: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Can Upload</span>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* Reset Password Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Reset Password</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                placeholder="Enter new password (min 6 characters)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleResetPassword}
              disabled={!newPassword || newPassword.length < 6}
              className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset Password
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}





