import React, { useState } from 'react';
import { 
  IncidentReport, 
  DangerZone,
  UserAccount, 
  getResidentName, 
  formatPhoneNumber, 
  getReportImage, 
  getAllReportImages, 
  resolveLocationName, 
  safeString,
  isReportConvertedToZone,
  getMatchingZoneForReport
} from '../types';
import { 
  Check, 
  X, 
  Search, 
  AlertTriangle, 
  Clock, 
  User, 
  Mail, 
  MapPin, 
  Share2, 
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Phone,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Camera,
  Image as ImageIcon,
  Maximize2,
  ExternalLink,
  Trash2,
  Sparkles,
  RefreshCw,
  Compass,
  CheckCircle2
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertToast from './AlertToast';

interface IncidentReportsViewProps {
  incidentReports: IncidentReport[];
  dangerZones?: DangerZone[];
  users?: UserAccount[];
  onApproveReport: (id: string) => Promise<void>;
  onRejectReport: (id: string) => Promise<void>;
  onDeleteReport: (id: string) => Promise<void>;
  onPurgeTestReports?: (reportIds: string[]) => Promise<void>;
  onConvertToDangerZone: (report: IncidentReport) => void;
  onQuickConvertToDangerZone?: (report: IncidentReport) => Promise<void>;
}

export default function IncidentReportsView({
  incidentReports,
  dangerZones = [],
  users = [],
  onApproveReport,
  onRejectReport,
  onDeleteReport,
  onPurgeTestReports,
  onConvertToDangerZone,
  onQuickConvertToDangerZone
}: IncidentReportsViewProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [hideGeofenced, setHideGeofenced] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDestructive?: boolean;
  } | null>(null);

  const [toastConfig, setToastConfig] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Helper to cross-reference and resolve the reporter identity
  const resolveReporterInfo = (rep: IncidentReport) => {
    let matchedUser: UserAccount | undefined;
    if (users && users.length > 0) {
      matchedUser = users.find(u => {
        if (rep.userId && (u.uid === rep.userId || u.id === rep.userId)) return true;
        if (rep.userUid && (u.uid === rep.userUid || u.id === rep.userUid)) return true;
        if (rep.reporterUid && (u.uid === rep.reporterUid || u.id === rep.reporterUid)) return true;
        if (rep.reporterEmail && u.email && rep.reporterEmail.toLowerCase() === u.email.toLowerCase()) return true;
        if (rep.email && u.email && rep.email.toLowerCase() === u.email.toLowerCase()) return true;
        
        const rPhone = rep.reporterPhone || rep.phoneNumber || rep.phone || rep.contactNumber;
        const uPhone = u.phoneNumber || u.phone || u.contactNumber || u.mobile;
        if (rPhone && uPhone) {
          const rDigits = String(rPhone).replace(/\D/g, '');
          const uDigits = String(uPhone).replace(/\D/g, '');
          if (rDigits && uDigits && (rDigits.endsWith(uDigits.slice(-9)) || uDigits.endsWith(rDigits.slice(-9)))) {
            return true;
          }
        }
        return false;
      });
    }

    // Resolution priority for name
    const resolvedName = matchedUser ? getResidentName(matchedUser) : getResidentName(rep);
    const rawPhone = matchedUser?.phoneNumber || matchedUser?.phone || rep.reporterPhone || rep.phoneNumber || rep.phone || rep.contactNumber;
    const formattedPhone = formatPhoneNumber(rawPhone);
    const email = matchedUser?.email || rep.reporterEmail || rep.email || '';
    const isRegistered = Boolean(matchedUser);
    const isPhoneAuth = Boolean(rawPhone && (!email || matchedUser?.provider === 'phone' || matchedUser?.authType === 'phone'));

    return {
      name: resolvedName,
      rawPhone,
      phone: formattedPhone,
      email,
      isRegistered,
      isPhoneAuth,
      matchedUser
    };
  };

  // Check if a report is already inputted into a danger zone
  const isGeofenced = (rep: IncidentReport) => isReportConvertedToZone(rep, dangerZones);

  // Counter metrics
  const geofencedReports = incidentReports.filter(r => isGeofenced(r));
  const activeUngeofencedReports = incidentReports.filter(r => !isGeofenced(r) && r.status !== 'rejected');
  
  const totalActive = activeUngeofencedReports.length;
  const pending = incidentReports.filter(r => !isGeofenced(r) && r.status === 'pending').length;
  const approved = incidentReports.filter(r => !isGeofenced(r) && r.status === 'approved').length;
  const geofencedCount = geofencedReports.length;
  const rejected = incidentReports.filter(r => r.status === 'rejected').length;

  // Filter listings: hides already geofenced reports by default unless specifically selected
  const filteredReports = incidentReports.filter(rep => {
    const reportIsGeofenced = isGeofenced(rep);

    // Status matching
    let matchStatus = false;
    if (filterStatus === 'all') {
      // By default hide reports already inputted into danger zones
      matchStatus = hideGeofenced ? !reportIsGeofenced : true;
    } else if (filterStatus === 'geofenced') {
      matchStatus = reportIsGeofenced;
    } else if (filterStatus === 'pending') {
      matchStatus = rep?.status === 'pending' && (!hideGeofenced || !reportIsGeofenced);
    } else if (filterStatus === 'approved') {
      matchStatus = rep?.status === 'approved' && (!hideGeofenced || !reportIsGeofenced);
    } else if (filterStatus === 'rejected') {
      matchStatus = rep?.status === 'rejected';
    } else {
      matchStatus = rep?.status === filterStatus;
    }

    if (!matchStatus) return false;

    const query = (searchQuery || '').toLowerCase().trim();
    if (!query) return true;

    const repInfo = resolveReporterInfo(rep);
    const name = repInfo.name.toLowerCase();
    const email = repInfo.email.toLowerCase();
    const phone = repInfo.phone.toLowerCase();
    const locName = (rep?.locationName || '').toLowerCase();
    const category = (rep?.category || '').toLowerCase();
    const desc = (rep?.description || '').toLowerCase();

    return name.includes(query) ||
           email.includes(query) ||
           phone.includes(query) ||
           locName.includes(query) ||
           category.includes(query) ||
           desc.includes(query);
  });

  const selectedReport = incidentReports.find(r => r.id === selectedReportId);
  const selectedReporterInfo = selectedReport ? resolveReporterInfo(selectedReport) : null;

  const handleApprove = (id: string) => {
    setConfirmConfig({
      title: "Approve Incident Report",
      message: "Approve this incident report? This validates the resident's warning and marks it as verified.",
      onConfirm: async () => {
        try {
          await onApproveReport(id);
          setToastConfig({ message: "Incident report has been officially APPROVED.", type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Error executing database update: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const handleProceedToGeofence = async (report: IncidentReport) => {
    if (report.status === 'pending') {
      try {
        await onApproveReport(report.id);
      } catch (_) {}
    }
    onConvertToDangerZone(report);
  };

  const handleReject = (id: string) => {
    setConfirmConfig({
      title: "Reject Incident Report",
      message: "Reject this incident report? This marks it as spurious/unverified and archives it.",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await onRejectReport(id);
          setToastConfig({ message: "Incident report has been officially REJECTED.", type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Error executing database update: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const handleDelete = (id: string, locationOrName?: string) => {
    setConfirmConfig({
      title: "Permanently Delete Report",
      message: `Are you sure you want to permanently delete this report ${locationOrName ? `("${locationOrName}")` : ''}? This will remove the document from Firestore and cannot be undone.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await onDeleteReport(id);
          if (selectedReportId === id) {
            setSelectedReportId(null);
          }
          setToastConfig({ message: "Incident report permanently deleted from database.", type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to delete report: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const handlePurgeAllTestReports = () => {
    // Collect test or pending reports, or all reports if requested
    const testOrPendingReports = incidentReports.filter(r => {
      if (r.status === 'pending' || r.status === 'rejected') return true;
      const desc = (r.description || '').toLowerCase();
      const loc = (r.locationName || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      return desc.includes('test') || desc.includes('spam') || desc.includes('ouihuihi') ||
             loc.includes('test') || cat.includes('test') || !desc.trim();
    });

    const targetIds = testOrPendingReports.length > 0 ? testOrPendingReports.map(r => r.id) : incidentReports.map(r => r.id);
    const count = targetIds.length;

    if (count === 0) {
      setToastConfig({ message: "No test or pending incident reports found to purge.", type: 'info' });
      return;
    }

    setConfirmConfig({
      title: "Purge All Test & Pending Reports",
      message: `Are you sure you want to delete all pending/test incident reports? This will permanently remove ${count} report submission(s) to leave a clean slate.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          if (onPurgeTestReports) {
            await onPurgeTestReports(targetIds);
          } else {
            for (const id of targetIds) {
              await onDeleteReport(id);
            }
          }
          setSelectedReportId(null);
          setToastConfig({ message: `Successfully purged ${count} test incident reports.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Purge operation encountered an error: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  return (
    <div className="space-y-6" id="incident-reports-layout">
      {/* View Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">Resident Incident Reports Registry</h2>
          <p className="text-xs text-gray-400 mt-0.5 font-sans">Evaluate, verify, delete spam submissions, or convert verified reports into active geofenced Danger Zones.</p>
        </div>

        {/* Purge Test Data Top-Level Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePurgeAllTestReports}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="Clean out test and spam report submissions"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>🧹 Purge All Test Reports</span>
            {pending > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-red-200 text-red-800 text-[10px] rounded-full font-mono">
                {pending}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Summary Indicator Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-sans">
        <div className="bg-white border border-gray-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-500 font-bold uppercase block">ACTIVE CITIZEN REPORTS</span>
            <span className="text-xl font-bold text-slate-900 block mt-1">{totalActive} active</span>
          </div>
          <div className="p-2 bg-slate-100 rounded text-slate-700">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase block">PENDING VERIFICATION</span>
            <span className="text-xl font-bold text-amber-600 block mt-1">{pending} reviews</span>
          </div>
          <div className="p-2 bg-amber-50 rounded text-amber-700">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-blue-600 font-bold uppercase block">GEOFENCED TO DANGER ZONES</span>
            <span className="text-xl font-bold text-blue-700 block mt-1">{geofencedCount} geofenced</span>
          </div>
          <div className="p-2 bg-blue-50 rounded text-blue-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-red-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-red-500 font-bold uppercase block">REJECTED / ARCHIVED</span>
            <span className="text-xl font-bold text-red-600 block mt-1">{rejected} reports</span>
          </div>
          <div className="p-2 bg-red-50 rounded text-red-700">
            <X className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Two Panes split layout: report list (left 8cols), details dashboard evaluation panel (right 4cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Reports Grid List (8 columns) */}
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col">
          {/* Top filtering controller */}
          <div className="p-4 border-b border-gray-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-sans">
            {/* Search query box */}
            <div className="relative max-w-xs w-full">
              <input
                type="text"
                placeholder="Search reporter, phone, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded pl-8 pr-3 py-1.5 focus:outline-[#1E3A5F] text-xs font-medium"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            {/* Status tab selectors and hideGeofenced toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1 border border-gray-200 p-1 bg-white rounded">
                {[
                  { id: 'all', label: `Active (${totalActive})` },
                  { id: 'pending', label: `Pending (${pending})` },
                  { id: 'approved', label: `Approved (${approved})` },
                  { id: 'geofenced', label: `Geofenced (${geofencedCount})` },
                  { id: 'rejected', label: `Rejected (${rejected})` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterStatus(tab.id)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors whitespace-nowrap ${
                      filterStatus === tab.id 
                        ? 'bg-[#1E3A5F] text-white shadow-xs' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center space-x-1.5 text-[10px] font-semibold text-slate-600 select-none cursor-pointer bg-white border border-gray-200 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={hideGeofenced}
                  onChange={(e) => setHideGeofenced(e.target.checked)}
                  className="rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F] w-3.5 h-3.5"
                />
                <span>Hide Converted</span>
              </label>
            </div>
          </div>

          {/* Table List representation */}
          {filteredReports.length === 0 ? (
            <div className="p-12 text-center text-gray-400 italic font-medium text-xs">
              No incident reports found matching active parameters.
            </div>
          ) : (
            <div className="overflow-x-auto text-xs">
              <table className="w-full min-w-[860px] text-left border-collapse font-sans">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-slate-500 text-[10px] font-bold uppercase tracking-widest font-display">
                    <th className="py-3 px-4 min-w-[200px]">Reporter Details</th>
                    <th className="py-3 px-4 min-w-[70px]">Photo Proof</th>
                    <th className="py-3 px-4 min-w-[160px]">Location</th>
                    <th className="py-3 px-4 min-w-[110px]">Classification</th>
                    <th className="py-3 px-4 min-w-[110px]">Submitted Date</th>
                    <th className="py-3 px-4 min-w-[90px]">Status</th>
                    <th className="py-3 px-4 min-w-[150px] text-right">Evaluation & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-slate-700">
                  {filteredReports.map(rep => {
                    const reporterInfo = resolveReporterInfo(rep);
                    const reportImg = getReportImage(rep);
                    const isSpamOrTest = (rep.description || '').toLowerCase().includes('test') || 
                                         (rep.description || '').toLowerCase().includes('ouihuihi') || 
                                         (rep.locationName || '').toLowerCase().includes('test');
                    return (
                      <tr 
                        key={rep.id} 
                        onClick={() => setSelectedReportId(rep.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedReportId === rep.id ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900">{reporterInfo.name}</span>
                            {reporterInfo.isRegistered && (
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" title="Verified Registered Profile" />
                            )}
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {reporterInfo.phone && (
                              <span className="inline-flex items-center space-x-1 font-mono text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded font-medium">
                                <Phone className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                <span>{reporterInfo.phone}</span>
                              </span>
                            )}
                            {reporterInfo.email && !reporterInfo.phone && (
                              <span className="text-[10px] text-gray-400 font-mono">{reporterInfo.email}</span>
                            )}
                            {!reporterInfo.email && !reporterInfo.phone && (
                              <span className="text-[10px] text-gray-400 font-mono italic">Mobile Resident</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4" onClick={(e) => { if (reportImg) { e.stopPropagation(); setPreviewImage(reportImg); } }}>
                          {reportImg ? (
                            <div className="relative group w-12 h-12 rounded border border-gray-200 overflow-hidden bg-slate-100 flex items-center justify-center hover:ring-2 hover:ring-indigo-500 transition-all cursor-zoom-in shadow-xs">
                              <img 
                                src={reportImg} 
                                alt="Incident Photo Proof" 
                                className="w-full h-full object-cover" 
                                onError={(e) => { 
                                  const target = e.target as HTMLElement;
                                  if (target.parentElement) {
                                    target.parentElement.innerHTML = '<span class="text-[9px] text-gray-400 font-mono italic">Failed to load</span>';
                                  }
                                }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                <Maximize2 className="w-4 h-4" />
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-full whitespace-nowrap">
                              <Camera className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>No photo attached</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate font-medium" title={resolveLocationName(rep)}>
                          {resolveLocationName(rep)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-800 font-medium px-2 py-0.5 rounded text-[10px]">
                            {rep.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 font-mono text-[10px] whitespace-nowrap">{rep.dateSubmitted}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isGeofenced(rep) ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-blue-100 text-blue-800 border border-blue-200">
                              🛡️ Geofenced
                            </span>
                          ) : (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              rep.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              rep.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              'bg-red-100 text-red-800 border border-red-250'
                            }`}>
                              {rep.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1.5">
                            {!isGeofenced(rep) && rep.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(rep.id)}
                                  className="p-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 font-bold text-[10px] uppercase transition-colors cursor-pointer"
                                  title="Verify/Approve Submission"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReject(rep.id)}
                                  className="p-1 px-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded border border-amber-200 font-bold text-[10px] uppercase transition-colors cursor-pointer"
                                  title="Reject Spurious Warning"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {!isGeofenced(rep) && (
                              <button
                                type="button"
                                onClick={() => handleProceedToGeofence(rep)}
                                className="inline-flex items-center space-x-0.5 py-1 px-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#1E3A5F] rounded font-bold text-[10px] transition-colors cursor-pointer"
                                title="Go to exact pinpoint on map and configure Danger Zone"
                              >
                                <span>Geofence</span>
                                <ArrowUpRight className="w-3 h-3 text-[#1E3A5F]" />
                              </button>
                            )}

                            {isGeofenced(rep) && (
                              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                                ✓ In Danger Zone
                              </span>
                            )}

                            {/* Quick Delete spam/test button on every row */}
                            <button
                              type="button"
                              onClick={() => handleDelete(rep.id, resolveLocationName(rep))}
                              className="p-1 px-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded border border-red-200 transition-colors cursor-pointer"
                              title={isSpamOrTest ? "Delete spam/test report" : "Delete report permanently"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Evaluation Panel Drawer (4 columns) */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded shadow-sm p-4 flex flex-col justify-start font-sans">
          <h3 className="font-bold text-slate-900 border-b border-gray-100 pb-2 mb-4 flex items-center text-xs tracking-wider uppercase font-display">
            <Share2 className="w-4.5 h-4.5 mr-1.5 text-[#1E3A5F]" />
            Incident Review Board
          </h3>

          {!selectedReport || !selectedReporterInfo ? (
            <div className="my-auto py-12 text-center text-slate-400 text-xs italic">
              Select or click any submitted record on the table to view the detailed citizen dossier.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-gray-150">
                <span className="text-[9px] font-mono text-slate-400 block uppercase">Report Ref: {selectedReport.id ? selectedReport.id.slice(0, 8) : 'N/A'}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                  isGeofenced(selectedReport) ? 'bg-blue-100 text-blue-900 border border-blue-200' :
                  selectedReport.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                  selectedReport.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {isGeofenced(selectedReport) ? '🛡️ GEOFENCED' : String(selectedReport.status || '').toUpperCase()}
                </span>
              </div>

              {/* Citizen Identity Card */}
              <div className="space-y-2.5 p-3 bg-slate-50 border border-gray-200 rounded">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-display">Reporter Info</span>
                
                <div className="flex items-center space-x-2 text-slate-900 font-bold">
                  <User className="w-4 h-4 text-[#1E3A5F]" />
                  <span>{selectedReporterInfo.name}</span>
                  {selectedReporterInfo.isRegistered && (
                    <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.2 rounded font-bold uppercase">
                      Registered Resident
                    </span>
                  )}
                </div>

                {selectedReporterInfo.phone && (
                  <div className="flex items-center space-x-2 text-indigo-700 bg-indigo-50 border border-indigo-150 px-2 py-1 rounded">
                    <Phone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="font-mono font-semibold text-[11px]">{selectedReporterInfo.phone}</span>
                    <span className="text-[9px] text-indigo-500 uppercase font-bold ml-auto">Mobile Auth</span>
                  </div>
                )}

                {selectedReporterInfo.email && (
                  <div className="flex items-center space-x-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="font-mono text-[11px] truncate">{selectedReporterInfo.email}</span>
                  </div>
                )}
              </div>

              {/* Location Specification Coordinates */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-display">Stated Incident Point</span>
                <p className="font-semibold text-slate-900">{resolveLocationName(selectedReport)}</p>
                <div className="flex items-center justify-between font-mono text-[10px] bg-slate-50 p-2 rounded border border-gray-200">
                  <div className="flex items-center space-x-1.5 text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>Lat: {typeof selectedReport.latitude === 'number' && !isNaN(selectedReport.latitude) ? selectedReport.latitude.toFixed(5) : 'N/A'}, Lng: {typeof selectedReport.longitude === 'number' && !isNaN(selectedReport.longitude) ? selectedReport.longitude.toFixed(5) : 'N/A'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleProceedToGeofence(selectedReport)}
                    className="inline-flex items-center space-x-1 px-2 py-1 bg-[#1E3A5F] hover:bg-[#132844] text-white rounded font-sans font-bold text-[9px] uppercase tracking-wide transition-colors cursor-pointer shrink-0 shadow-xs"
                    title="Jump to exact pinpoint on map and configure Danger Zone"
                  >
                    <Compass className="w-3 h-3 text-yellow-400" />
                    <span>Pinpoint on Map</span>
                  </button>
                </div>
              </div>

              {/* Categorization & User Text Details */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-display">Reporter Description Warning</span>
                <div className="p-3 bg-slate-100 rounded text-slate-800 leading-relaxed italic border-l-2 border-[#1E3A5F]">
                  "{safeString(selectedReport.description) || 'No descriptive context provided.'}"
                </div>
              </div>

              {/* Attached Photo Evidence Section */}
              <div className="space-y-1.5 font-sans">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-display">
                    Attached Photo Evidence
                  </span>
                  {getReportImage(selectedReport) && (
                    <span className="text-[9px] text-indigo-600 font-bold uppercase bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                      {getAllReportImages(selectedReport).length > 1 ? `${getAllReportImages(selectedReport).length} Photos` : 'Photo Verified'}
                    </span>
                  )}
                </div>

                {getReportImage(selectedReport) ? (
                  <div className="space-y-2">
                    <div 
                      onClick={() => setPreviewImage(getReportImage(selectedReport) || null)}
                      className="relative group rounded border border-gray-200 overflow-hidden bg-slate-900 aspect-video max-h-48 cursor-zoom-in shadow-inner"
                    >
                      <img 
                        src={getReportImage(selectedReport)} 
                        alt="Citizen Photo Evidence" 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2 text-white">
                        <span className="text-[10px] font-medium flex items-center space-x-1">
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Click to Inspect High-Res</span>
                        </span>
                        <a 
                          href={getReportImage(selectedReport)} 
                          target="_blank" 
                          rel="noreferrer" 
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 bg-white/20 hover:bg-white/40 rounded transition-colors"
                          title="Open direct file URL"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Multi-photo thumbnails if multiple exist */}
                    {getAllReportImages(selectedReport).length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {getAllReportImages(selectedReport).map((imgUrl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPreviewImage(imgUrl)}
                            className="w-12 h-12 rounded border border-gray-200 overflow-hidden shrink-0 hover:ring-2 hover:ring-indigo-500 transition-all bg-slate-100 cursor-pointer"
                          >
                            <img src={imgUrl} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-dashed border-gray-200 rounded text-center text-gray-400">
                    <Camera className="w-5 h-5 mx-auto mb-1 text-gray-300" />
                    <p className="text-[11px]">No photographic evidence was attached by the reporter.</p>
                  </div>
                )}
              </div>

              {/* Subm date */}
              <div className="text-[10px] text-gray-400 flex justify-between pt-2 border-t border-gray-100 font-mono">
                <span>Timestamp: {selectedReport.dateSubmitted}</span>
                <span>Type: {selectedReport.category}</span>
              </div>

              {/* Evaluation & Deletion Action Panel buttons */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {selectedReport.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(selectedReport.id)}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-center space-x-1 shadow-sm transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(selectedReport.id)}
                      className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-center space-x-1 shadow-sm transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {/* Primary Proceed to Geofence & Pinpoint Button */}
                {!isGeofenced(selectedReport) ? (
                  <div className="space-y-2">
                    {onQuickConvertToDangerZone && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onQuickConvertToDangerZone(selectedReport);
                            setToastConfig({ 
                              message: `Successfully converted "${resolveLocationName(selectedReport)}" into an active Danger Zone!`, 
                              type: 'success' 
                            });
                          } catch (err: any) {
                            setToastConfig({ message: `Failed to create danger zone: ${err.message}`, type: 'error' });
                          }
                        }}
                        className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold tracking-wider text-xs flex items-center justify-center space-x-1.5 shadow transition-colors cursor-pointer"
                        title="Instantly convert this citizen report into a Danger Zone with 1 click"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-100" />
                        <span>QUICK CREATE DANGER ZONE</span>
                        <Sparkles className="w-4 h-4 text-yellow-300" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleProceedToGeofence(selectedReport)}
                      className="w-full py-2.5 px-3 bg-[#1E3A5F] hover:bg-[#152a44] text-white rounded font-bold tracking-wider text-xs flex items-center justify-center space-x-1.5 shadow transition-colors cursor-pointer"
                      title="Navigate to Danger Zone map and center on this exact reported pin point"
                    >
                      <MapPin className="w-4 h-4 text-yellow-400" />
                      <span>CUSTOMIZE GEOFENCE ON MAP</span>
                      <ArrowUpRight className="w-4 h-4 text-yellow-400" />
                    </button>
                    <p className="text-[10px] text-slate-500 italic mt-1 text-center leading-normal font-sans">
                      Automatically centres map on exact reported GPS coordinates & preloads photos.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 space-y-1">
                    <div className="flex items-center space-x-1.5 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Converted to Active Danger Zone</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-normal">
                      This incident warning has already been verified and input into an active Danger Zone. Residents receive safety warnings when entering this area.
                    </p>
                    {(() => {
                      const matchedZone = getMatchingZoneForReport(selectedReport, dangerZones);
                      if (matchedZone) {
                        return (
                          <div className="bg-white/80 p-2 rounded border border-emerald-150 text-[10px] font-mono mt-1 space-y-0.5 text-slate-700">
                            <div><strong>Zone:</strong> {matchedZone.locationName}</div>
                            <div><strong>Risk Level:</strong> {matchedZone.riskLevel} ({matchedZone.radius || 150}m radius)</div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Permanent Delete Report Button */}
                <button
                  type="button"
                  onClick={() => handleDelete(selectedReport.id, resolveLocationName(selectedReport))}
                  className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Delete Report Permanently</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* High-Resolution Photo Evidence Lightbox Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700 text-white">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold font-display uppercase tracking-wider">Citizen Evidence Inspection</span>
              </div>
              <div className="flex items-center space-x-3">
                <a 
                  href={previewImage} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center space-x-1 text-[11px] text-slate-300 hover:text-white bg-slate-700/60 px-2 py-1 rounded transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Full File</span>
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/50">
              <img 
                src={previewImage} 
                alt="Enlarged Citizen Evidence" 
                className="max-h-[72vh] w-auto max-w-full object-contain rounded shadow-md"
              />
            </div>

            <div className="px-4 py-2 bg-slate-800/80 border-t border-slate-700 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Press anywhere outside or the close icon to dismiss.</span>
              <span className="font-mono text-[10px] text-slate-500 truncate max-w-md">{previewImage}</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      <ConfirmDialog
        isOpen={confirmConfig !== null}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        onCancel={() => setConfirmConfig(null)}
        isDestructive={confirmConfig?.isDestructive}
      />

      {/* Alert toast */}
      <AlertToast
        isOpen={toastConfig !== null}
        message={toastConfig?.message || ""}
        type={toastConfig?.type}
        onClose={() => setToastConfig(null)}
      />
    </div>
  );
}
