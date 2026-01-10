'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

export default function SummaryReportPage() {
  return (
    <ProtectedRoute requireSuperAdmin>
      <Navigation />
      <SummaryReportComponent />
    </ProtectedRoute>
  );
}

interface CategoryData {
  present: number;
  absent: number;
}

interface SiteData {
  site: string;
  categories: {
    MBM_STAFF: CategoryData;
    SUPPORTING_STAFF: CategoryData;
    DOCUMENT_CONTROLLER: CategoryData;
    SUPERVISOR_FOREMAN: CategoryData;
    CHARGEHAND: CategoryData;
    OFFICE_BOY_SECURITY: CategoryData;
    LABOUR: CategoryData;
  };
}

interface SectionData {
  sites: SiteData[];
  totals: any;
}

interface ReportData {
  reportDate: string;
  sections: {
    HEAD_OFFICE: SectionData;
    MEP_SITES: SectionData;
    CIVIL_SITES: SectionData;
    OTHER_SITES: SectionData;
    SUPPORT_TEAM: SectionData;
    OUTSOURCED_SITES: SectionData;
  };
  grandTotal: any;
  absentBreakdown: any;
  labourSupplyTotal: number;
  subContPresentTotal: number;
  subContTotalTotal: number;
}

function SummaryReportComponent() {
  const { token } = useAuth();
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReport();
  }, [reportDate]);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/summary-report?date=${reportDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setReportData(result.data);
      } else {
        setError(result.error || 'Failed to load report');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/admin/summary-report/export?date=${reportDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to export');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manpower_summary_${reportDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleDeleteData = async () => {
    if (!confirm('Are you sure you want to delete all data for this date? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/clear-data', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataType: 'ATTENDANCE',
          confirm: true,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert('Data deleted successfully');
        fetchReport();
      } else {
        alert(result.error || 'Failed to delete data');
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const calculateSiteTotal = (site: SiteData) => {
    const cats = site.categories;
    return Object.values(cats).reduce((sum, cat) => sum + cat.present + cat.absent, 0);
  };

  const calculateSitePresent = (site: SiteData) => {
    const cats = site.categories;
    return Object.values(cats).reduce((sum, cat) => sum + cat.present, 0);
  };

  const renderSiteRow = (site: SiteData, index: number) => {
    const cats = site.categories;
    const total = calculateSiteTotal(site);
    const totalPresent = calculateSitePresent(site);

    return (
      <tr key={index} className="hover:bg-gray-50">
        <td className="px-4 py-2 text-center border">{index + 1}</td>
        <td className="px-4 py-2 border">{site.site}</td>
        <td className="px-4 py-2 text-center border">{cats.MBM_STAFF.present}</td>
        <td className="px-4 py-2 text-center border">{cats.MBM_STAFF.absent}</td>
        <td className="px-4 py-2 text-center border">{cats.SUPPORTING_STAFF.present}</td>
        <td className="px-4 py-2 text-center border">{cats.SUPPORTING_STAFF.absent}</td>
        <td className="px-4 py-2 text-center border">{cats.DOCUMENT_CONTROLLER.present}</td>
        <td className="px-4 py-2 text-center border">{cats.DOCUMENT_CONTROLLER.absent}</td>
        <td className="px-4 py-2 text-center border">{cats.SUPERVISOR_FOREMAN.present}</td>
        <td className="px-4 py-2 text-center border">{cats.SUPERVISOR_FOREMAN.absent}</td>
        <td className="px-4 py-2 text-center border">{cats.CHARGEHAND.present}</td>
        <td className="px-4 py-2 text-center border">{cats.CHARGEHAND.absent}</td>
        <td className="px-4 py-2 text-center border">{cats.OFFICE_BOY_SECURITY.present}</td>
        <td className="px-4 py-2 text-center border">{cats.OFFICE_BOY_SECURITY.absent}</td>
        <td className="px-4 py-2 text-center border">{cats.LABOUR.present}</td>
        <td className="px-4 py-2 text-center border">{cats.LABOUR.absent}</td>
        <td className="px-4 py-2 text-center border font-semibold">{total}</td>
        <td className="px-4 py-2 text-center border font-semibold">{totalPresent}</td>
      </tr>
    );
  };

  const renderTotalsRow = (totals: any, label: string, includeSupply = false) => {
    const total = Object.values(totals).reduce((sum: number, cat: any) => {
      if (typeof cat === 'object' && cat.present !== undefined) {
        return sum + cat.present + cat.absent;
      }
      return sum;
    }, 0);
    const totalPresent = Object.values(totals).reduce((sum: number, cat: any) => {
      if (typeof cat === 'object' && cat.present !== undefined) {
        return sum + cat.present;
      }
      return sum;
    }, 0);

    return (
      <tr className="bg-yellow-100 font-bold">
        <td colSpan={2} className="px-4 py-2 border">TOTAL FOR {label}</td>
        <td className="px-4 py-2 text-center border">{totals.MBM_STAFF.present}</td>
        <td className="px-4 py-2 text-center border">{totals.MBM_STAFF.absent}</td>
        <td className="px-4 py-2 text-center border">{totals.SUPPORTING_STAFF.present}</td>
        <td className="px-4 py-2 text-center border">{totals.SUPPORTING_STAFF.absent}</td>
        <td className="px-4 py-2 text-center border">{totals.DOCUMENT_CONTROLLER.present}</td>
        <td className="px-4 py-2 text-center border">{totals.DOCUMENT_CONTROLLER.absent}</td>
        <td className="px-4 py-2 text-center border">{totals.SUPERVISOR_FOREMAN.present}</td>
        <td className="px-4 py-2 text-center border">{totals.SUPERVISOR_FOREMAN.absent}</td>
        <td className="px-4 py-2 text-center border">{totals.CHARGEHAND.present}</td>
        <td className="px-4 py-2 text-center border">{totals.CHARGEHAND.absent}</td>
        <td className="px-4 py-2 text-center border">{totals.OFFICE_BOY_SECURITY.present}</td>
        <td className="px-4 py-2 text-center border">{totals.OFFICE_BOY_SECURITY.absent}</td>
        <td className="px-4 py-2 text-center border">{totals.LABOUR.present}</td>
        <td className="px-4 py-2 text-center border">{totals.LABOUR.absent}</td>
        <td className="px-4 py-2 text-center border">{total}</td>
        <td className="px-4 py-2 text-center border">{totalPresent}</td>
        {includeSupply && (
          <>
            <td className="px-4 py-2 text-center border">{totals.labourSupply || 0}</td>
            <td className="px-4 py-2 text-center border">{totals.subContPresent || 0}</td>
            <td className="px-4 py-2 text-center border">{totals.subContTotal || 0}</td>
          </>
        )}
      </tr>
    );
  };

  const renderSection = (sectionName: string, section: SectionData, includeSupply = false) => {
    if (!section || !section.sites || section.sites.length === 0) return null;

    return (
      <div key={sectionName} className="mb-8">
        <h3 className="text-xl font-bold mb-4 bg-gray-200 px-4 py-2">{sectionName.replace('_', ' ')}</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th rowSpan={2} className="px-4 py-2 border border-gray-300">S.NO</th>
                <th rowSpan={2} className="px-4 py-2 border border-gray-300">SITE DETAILS</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">MBM - STAFF</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">SUPPORTING - STAFF</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">DOCUMENT CONTROLLER</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">SUPERVISOR/FOREMAN</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">CHARGEHAND</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">OFFICE BOY/SECURITY</th>
                <th colSpan={2} className="px-4 py-2 border border-gray-300">LABOUR</th>
                <th rowSpan={2} className="px-4 py-2 border border-gray-300">TOTAL</th>
                <th rowSpan={2} className="px-4 py-2 border border-gray-300">TOTAL-PRESENT</th>
                {includeSupply && (
                  <>
                    <th rowSpan={2} className="px-4 py-2 border border-gray-300">LABOUR SUPPLY</th>
                    <th rowSpan={2} className="px-4 py-2 border border-gray-300">SUB-CONT (PRESENT)</th>
                    <th rowSpan={2} className="px-4 py-2 border border-gray-300">SUB-CONT (TOTAL)</th>
                  </>
                )}
              </tr>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
                <th className="px-4 py-2 border border-gray-300">Present</th>
                <th className="px-4 py-2 border border-gray-300">Absent</th>
              </tr>
            </thead>
            <tbody>
              {section.sites.map((site, index) => renderSiteRow(site, index))}
              {renderTotalsRow(section.totals, sectionName.replace('_', ' '), includeSupply)}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">Loading report...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">No report data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">SUMMARY OF MANPOWER</h1>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                📥 Download Excel
              </button>
              <button
                onClick={handleDeleteData}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                🗑️ Delete Data
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Report Date:</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">{formatDate(reportDate)}</span>
          </div>

          <div className="mt-2 text-sm text-gray-600">
            HEAD OFFICE - BUSINESS BAY & SILICON OFFICE
          </div>
        </div>

        {/* Report Sections */}
        {renderSection('HEAD OFFICE', reportData.sections.HEAD_OFFICE)}
        {renderSection('MEP SITES', reportData.sections.MEP_SITES, true)}
        {renderSection('CIVIL SITES', reportData.sections.CIVIL_SITES, true)}
        {renderSection('OTHER SITES', reportData.sections.OTHER_SITES)}
        {renderSection('SUPPORT TEAM', reportData.sections.SUPPORT_TEAM)}
        {renderSection('OUTSOURCED SITES', reportData.sections.OUTSOURCED_SITES)}

        {/* TOTAL ACTIVE EMPLOYEES */}
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4 bg-green-200 px-4 py-2">TOTAL ACTIVE EMPLOYEES</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 border border-gray-300">Category</th>
                  <th className="px-4 py-2 border border-gray-300">Present</th>
                  <th className="px-4 py-2 border border-gray-300">Absent</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">MBM - STAFF</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.MBM_STAFF.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.MBM_STAFF.absent}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">SUPPORTING - STAFF</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.SUPPORTING_STAFF.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.SUPPORTING_STAFF.absent}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">DOCUMENT CONTROLLER</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.DOCUMENT_CONTROLLER.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.DOCUMENT_CONTROLLER.absent}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">SUPERVISOR/FOREMAN</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.SUPERVISOR_FOREMAN.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.SUPERVISOR_FOREMAN.absent}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">CHARGEHAND</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.CHARGEHAND.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.CHARGEHAND.absent}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">OFFICE BOY/SECURITY</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.OFFICE_BOY_SECURITY.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.OFFICE_BOY_SECURITY.absent}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">LABOUR</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.LABOUR.present}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.LABOUR.absent}</td>
                </tr>
                <tr className="bg-yellow-100 font-bold">
                  <td className="px-4 py-2 border border-gray-300">TOTAL</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.totalPresent}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.totalAbsent}</td>
                </tr>
                <tr className="bg-yellow-100 font-bold">
                  <td className="px-4 py-2 border border-gray-300">TOTAL ABSENT</td>
                  <td colSpan={2} className="px-4 py-2 text-center border border-gray-300">
                    {reportData.grandTotal.totalAbsent} ({reportData.grandTotal.absentPercentage}% Absent)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* TOTAL ABSENT BREAKDOWN */}
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4 bg-red-100 px-4 py-2">TOTAL ABSENT BREAKDOWN</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 border border-gray-300">Category</th>
                  <th className="px-4 py-2 border border-gray-300">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">MANAGEMENT</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.absentBreakdown.MANAGEMENT}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">MD REFERENCE</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.absentBreakdown.MD_REFERENCE}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">VACATION</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.absentBreakdown.VACATION}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">INACTIVE</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.absentBreakdown.INACTIVE}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 border border-gray-300">ABSCONDED - RUN AWAY</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.absentBreakdown.ABSCONDED}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* GRAND TOTAL */}
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4 bg-green-300 px-4 py-2">GRAND TOTAL</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 border border-gray-300">Total Employees</th>
                  <th className="px-4 py-2 border border-gray-300">Labour Supply</th>
                  <th className="px-4 py-2 border border-gray-300">Sub-Cont (Present)</th>
                  <th className="px-4 py-2 border border-gray-300">Sub-Cont (Total)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-green-200 font-bold">
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.grandTotal.total}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.labourSupplyTotal}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.subContPresentTotal}</td>
                  <td className="px-4 py-2 text-center border border-gray-300">{reportData.subContTotalTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}






