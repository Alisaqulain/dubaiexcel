'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  lastLogin: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface ActivityLog {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  details: string;
}

interface AdminPanelProps {
  onLogout?: () => void;
  userEmail?: string;
  onNavigateToSpreadsheet?: () => void;
}

export default function AdminPanel({ onLogout, userEmail, onNavigateToSpreadsheet }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'analytics' | 'settings'>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalSheets: 0,
    totalActivity: 0,
  });

  // Load mock data on mount
  useEffect(() => {
    // Load users from localStorage or create mock data
    const savedUsers = localStorage.getItem('excelProUsers');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    } else {
      const mockUsers: User[] = [
        {
          id: '1',
          email: userEmail || 'admin@excelpro.com',
          role: 'admin',
          lastLogin: new Date().toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          email: 'user1@example.com',
          role: 'user',
          lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '3',
          email: 'user2@example.com',
          role: 'user',
          lastLogin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '4',
          email: 'user3@example.com',
          role: 'user',
          lastLogin: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'inactive',
          createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];
      setUsers(mockUsers);
      localStorage.setItem('excelProUsers', JSON.stringify(mockUsers));
    }

    // Load activity logs
    const savedLogs = localStorage.getItem('excelProActivityLogs');
    if (savedLogs) {
      setActivityLogs(JSON.parse(savedLogs));
    } else {
      const mockLogs: ActivityLog[] = [
        {
          id: '1',
          user: 'user1@example.com',
          action: 'Created Sheet',
          timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          details: 'Created new spreadsheet "Project Data"',
        },
        {
          id: '2',
          user: 'user2@example.com',
          action: 'Updated Cell',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          details: 'Updated cell A1 in Sheet1',
        },
        {
          id: '3',
          user: 'user1@example.com',
          action: 'Logged In',
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          details: 'User logged in successfully',
        },
      ];
      setActivityLogs(mockLogs);
      localStorage.setItem('excelProActivityLogs', JSON.stringify(mockLogs));
    }
  }, [userEmail]);

  // Update stats
  useEffect(() => {
    setStats({
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === 'active').length,
      totalSheets: parseInt(localStorage.getItem('excelProTotalSheets') || '0'),
      totalActivity: activityLogs.length,
    });
  }, [users, activityLogs]);

  const handleUserStatusToggle = (userId: string) => {
    setUsers(prevUsers =>
      prevUsers.map(user =>
        user.id === userId
          ? { ...user, status: user.status === 'active' ? 'inactive' : 'active' }
          : user
      )
    );
    localStorage.setItem('excelProUsers', JSON.stringify(users.map(u => 
      u.id === userId ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u
    )));
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      const newUsers = users.filter(u => u.id !== userId);
      setUsers(newUsers);
      localStorage.setItem('excelProUsers', JSON.stringify(newUsers));
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
                <p className="text-sm text-gray-500">Excel Pro Management</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {onNavigateToSpreadsheet && (
              <button
                onClick={onNavigateToSpreadsheet}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Spreadsheet
              </button>
            )}
            {userEmail && (
              <span className="text-sm text-gray-600 hidden sm:inline">{userEmail}</span>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <nav className="flex gap-1">
            {(['dashboard', 'users', 'analytics', 'settings'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Users</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalUsers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Users</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeUsers}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Sheets</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalSheets}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Activity</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalActivity}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {activityLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{log.action}</p>
                        <p className="text-sm text-gray-600">{log.details}</p>
                        <p className="text-xs text-gray-500 mt-1">{log.user} • {getTimeAgo(log.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </button>
            </div>

            {/* Search */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <input
                type="text"
                placeholder="Search users by email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-indigo-600 font-medium text-sm">
                                {user.email.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{user.email}</div>
                              <div className="text-sm text-gray-500">Joined {getTimeAgo(user.createdAt)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {getTimeAgo(user.lastLogin)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleUserStatusToggle(user.id)}
                              className={`px-3 py-1 rounded text-xs ${
                                user.status === 'active'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {user.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            {user.role !== 'admin' && (
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">User Growth</h3>
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <p>Chart visualization would go here</p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Over Time</h3>
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <p>Chart visualization would go here</p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sheet Usage</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Sheets Created</span>
                    <span className="text-sm font-semibold text-gray-900">{stats.totalSheets}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Active Sheets</span>
                    <span className="text-sm font-semibold text-gray-900">{Math.floor(stats.totalSheets * 0.7)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Uptime</span>
                    <span className="text-sm font-semibold text-green-600">99.9%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Response Time</span>
                    <span className="text-sm font-semibold text-green-600">120ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Error Rate</span>
                    <span className="text-sm font-semibold text-green-600">0.01%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">General Settings</h3>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Application Name
                  </label>
                  <input
                    type="text"
                    defaultValue="Excel Pro"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Users
                  </label>
                  <input
                    type="number"
                    defaultValue="1000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    defaultValue="30"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                  Save Changes
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Security Settings</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-500">Require 2FA for all admin accounts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email Notifications</p>
                    <p className="text-sm text-gray-500">Send email alerts for important events</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


