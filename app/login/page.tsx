'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [loginType, setLoginType] = useState<'email' | 'username' | 'employee'>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password);
      } else {
        // Support email, username, and employee ID login
        let loginIdentifier = '';
        if (loginType === 'email') {
          loginIdentifier = email.trim();
        } else if (loginType === 'username') {
          loginIdentifier = username.trim();
        } else if (loginType === 'employee') {
          loginIdentifier = employeeId.trim().toUpperCase();
        }
        
        if (!loginIdentifier) {
          setError(`Please enter your ${loginType === 'employee' ? 'Employee ID' : loginType}`);
          setLoading(false);
          return;
        }
        if (!password) {
          setError('Please enter your password');
          setLoading(false);
          return;
        }
        
        // Pass loginType to the login function
        await login(loginIdentifier, password, loginType);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-900">
          {isRegister ? 'Register' : 'Login'}
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Login with
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginType('email');
                    setEmail('');
                    setUsername('');
                    setEmployeeId('');
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm ${
                    loginType === 'email'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginType('username');
                    setEmail('');
                    setUsername('');
                    setEmployeeId('');
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm ${
                    loginType === 'username'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Username
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginType('employee');
                    setEmail('');
                    setUsername('');
                    setEmployeeId('');
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm ${
                    loginType === 'employee'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Employee ID
                </button>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isRegister 
                ? 'Email' 
                : loginType === 'email' 
                  ? 'Email' 
                  : loginType === 'username' 
                    ? 'Username' 
                    : 'Employee ID'}
            </label>
            {isRegister || loginType === 'email' ? (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your email"
              />
            ) : loginType === 'username' ? (
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your username"
              />
            ) : (
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your Employee ID (e.g., EMP008)"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        <div className="mt-4 text-center">
          {isRegister ? (
            <button
              type="button"
              onClick={() => setIsRegister(false)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Already have an account? Login
            </button>
          ) : (
            <div className="text-sm text-gray-600">
              <p>Don&apos;t have an account?</p>
              <p className="mt-1 text-xs text-gray-500">
                Contact your administrator to create an account
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

