'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { highlightAllSearchMatches } from '../../components/HighlightSearch';

interface FileItem {
  _id: string;
  filename: string;
  originalFilename: string;
  labourType: string;
  rowCount: number;
}

interface SiteItem {
  siteValue: string;
}

const DEFAULT_PASSWORD = 'Password@1234';

export default function SiteManagementPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <SiteManagementContent />
    </ProtectedRoute>
  );
}

function SiteManagementContent() {
  const { token } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loginColumnName, setLoginColumnName] = useState('');
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patching, setPatching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newSiteValue, setNewSiteValue] = useState('');
  const [changePasswordSite, setChangePasswordSite] = useState<string | null>(null);
  const [changePasswordValue, setChangePasswordValue] = useState('');
  const [bulkPasswordValue, setBulkPasswordValue] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [fileSearch, setFileSearch] = useState('');

  useEffect(() => {
    const f = async () => {
      try {
        const res = await fetch('/api/admin/created-excel-files', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setFiles(json.data);
          if (selectedFileId && !json.data.some((f: FileItem) => f._id === selectedFileId)) {
            setSelectedFileId(null);
          }
        }
      } catch (e) {
        setMessage({ type: 'error', text: 'Failed to load files' });
      } finally {
        setLoadingFiles(false);
      }
    };
    f();
  }, [token]);

  useEffect(() => {
    if (!selectedFileId || !token) {
      setSites([]);
      setLoginColumnName('');
      return;
    }
    setLoadingSites(true);
    fetch(`/api/admin/created-excel-files/${selectedFileId}/site-logins`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setLoginColumnName(json.data.loginColumnName || '');
          setSites(Array.isArray(json.data.sites) ? json.data.sites : []);
        } else {
          setSites([]);
          setLoginColumnName('');
        }
      })
      .catch(() => {
        setSites([]);
        setLoginColumnName('');
      })
      .finally(() => setLoadingSites(false));
  }, [selectedFileId, token]);

  const handleSaveSites = async () => {
    if (!selectedFileId || !token) return;
    const siteList = sites.filter((s) => String(s.siteValue).trim());
    if (!loginColumnName.trim()) {
      setMessage({ type: 'error', text: 'Login column must be set in Created Excel Files → View file → Login column & site logins.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${selectedFileId}/site-logins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          loginColumnName: loginColumnName.trim(),
          sites: siteList.map((s) => ({ siteValue: s.siteValue.trim() })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Sites saved.' });
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to save' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSite = () => {
    const v = newSiteValue.trim();
    if (!v) return;
    if (sites.some((s) => String(s.siteValue).trim() === v)) {
      setMessage({ type: 'error', text: 'Site already exists' });
      return;
    }
    setSites((prev) => [...prev, { siteValue: v }]);
    setNewSiteValue('');
    setMessage(null);
  };

  const handleDeleteSite = (siteValue: string) => {
    setSites((prev) => prev.filter((s) => s.siteValue !== siteValue));
    setMessage(null);
  };

  const handleChangePassword = async () => {
    if (!selectedFileId || !token || !changePasswordSite) return;
    const pwd = changePasswordValue.trim();
    if (!pwd) {
      setMessage({ type: 'error', text: 'Enter a new password' });
      return;
    }
    setPatching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${selectedFileId}/site-logins`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteValue: changePasswordSite, newPassword: pwd }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Password updated.' });
        setChangePasswordSite(null);
        setChangePasswordValue('');
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to update' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to update' });
    } finally {
      setPatching(false);
    }
  };

  const handleBulkPasswordReset = async () => {
    if (!selectedFileId || !token) return;
    const pwd = bulkPasswordValue.trim();
    if (!pwd) {
      setMessage({ type: 'error', text: 'Enter a new password' });
      return;
    }
    setPatching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${selectedFileId}/site-logins`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: pwd }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `All ${sites.length} site(s) password updated.` });
        setBulkPasswordValue('');
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to update' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to update' });
    } finally {
      setPatching(false);
    }
  };

  const selectedFile = files.find((f) => f._id === selectedFileId);
  const filteredFilesForSelect = fileSearch.trim()
    ? files.filter((f) => (f.originalFilename || f.filename || '').toLowerCase().includes(fileSearch.trim().toLowerCase()))
    : files;
  const filteredSites = siteSearch.trim()
    ? sites.filter((s) => s.siteValue.toLowerCase().includes(siteSearch.trim().toLowerCase()))
    : sites;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Site / Project Management</h1>
        <p className="text-sm text-gray-600 mb-4">
          Select a created Excel file to manage project/site logins. You can add sites, delete sites, change a single site password, or reset all passwords at once. Default password for new sites is {DEFAULT_PASSWORD}.
        </p>

        {message && (
          <div
            className={`mb-4 p-3 rounded ${
              message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select file</label>
          <input
            type="text"
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
            placeholder="Search files..."
            className="mb-2 w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <select
            value={selectedFileId || ''}
            onChange={(e) => setSelectedFileId(e.target.value || null)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md bg-white"
          >
            <option value="">— Choose a file —</option>
            {filteredFilesForSelect.map((f) => (
              <option key={f._id} value={f._id}>
                {f.originalFilename || f.filename} ({f.rowCount} rows)
              </option>
            ))}
          </select>
        </div>

        {loadingFiles && <p className="text-gray-500">Loading files...</p>}

        {!loadingFiles && selectedFileId && (
          <>
            {loadingSites ? (
              <p className="text-gray-500">Loading sites...</p>
            ) : (
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                {selectedFile && (
                  <p className="text-sm text-gray-600 mb-4">
                    File: <strong>{selectedFile.originalFilename || selectedFile.filename}</strong>
                    {loginColumnName && (
                      <span className="ml-2">Login column: <strong>{loginColumnName}</strong></span>
                    )}
                  </p>
                )}
                {!loginColumnName.trim() && (
                  <p className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-sm">
                    This file has no login column set. Open <strong>Created Excel Files</strong> → View this file → &quot;Login column &amp; site logins&quot; to choose the column and load unique values, then save. After that, you can manage sites here.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <input
                    type="text"
                    value={newSiteValue}
                    onChange={(e) => setNewSiteValue(e.target.value)}
                    placeholder="New site name"
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddSite}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Add site
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSites}
                    disabled={saving}
                    className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save all sites'}
                  </button>
                  <span className="text-sm text-gray-500">Bulk password:</span>
                  <input
                    type="password"
                    value={bulkPasswordValue}
                    onChange={(e) => setBulkPasswordValue(e.target.value)}
                    placeholder="New password for all"
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm w-40"
                  />
                  <button
                    type="button"
                    onClick={handleBulkPasswordReset}
                    disabled={patching || sites.length === 0}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
                  >
                    {patching ? 'Updating...' : 'Reset all passwords'}
                  </button>
                </div>
                <div className="mb-2">
                  <label className="text-sm font-medium text-gray-700 mr-2">Filter sites:</label>
                  <input
                    type="text"
                    value={siteSearch}
                    onChange={(e) => setSiteSearch(e.target.value)}
                    placeholder="Search site name..."
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm w-48"
                  />
                </div>
                <div className="border border-gray-200 rounded overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-700">Site name</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-700 w-48">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSites.map((s, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2">{highlightAllSearchMatches(s.siteValue, siteSearch)}</td>
                          <td className="px-3 py-2">
                            {changePasswordSite === s.siteValue ? (
                              <span className="flex items-center gap-2">
                                <input
                                  type="password"
                                  value={changePasswordValue}
                                  onChange={(e) => setChangePasswordValue(e.target.value)}
                                  placeholder="New password"
                                  className="px-2 py-1 border border-gray-300 rounded text-sm w-32"
                                />
                                <button
                                  type="button"
                                  onClick={handleChangePassword}
                                  disabled={patching}
                                  className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setChangePasswordSite(null); setChangePasswordValue(''); }}
                                  className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { setChangePasswordSite(s.siteValue); setChangePasswordValue(''); }}
                                  className="mr-2 text-blue-600 hover:text-blue-800 text-xs"
                                >
                                  Change password
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSite(s.siteValue)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sites.length === 0 && (
                  <p className="mt-4 text-gray-500 text-sm">No sites yet. Add a site above and save, or load unique values from the file in Created Excel Files.</p>
                )}
                {sites.length > 0 && filteredSites.length === 0 && (
                  <p className="mt-4 text-gray-500 text-sm">No sites match the current search.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
