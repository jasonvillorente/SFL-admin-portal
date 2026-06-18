import React, { useState } from 'react';
import { IncidentReport, DangerZone } from '../types';
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
  ShieldAlert
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertToast from './AlertToast';

interface IncidentReportsViewProps {
  incidentReports: IncidentReport[];
  onApproveReport: (id: string) => Promise<void>;
  onRejectReport: (id: string) => Promise<void>;
  onConvertToDangerZone: (report: IncidentReport) => void;
}

export default function IncidentReportsView({
  incidentReports,
  onApproveReport,
  onRejectReport,
  onConvertToDangerZone
}: IncidentReportsViewProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  const [toastConfig, setToastConfig] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Counter metrics
  const total = incidentReports.length;
  const pending = incidentReports.filter(r => r.status === 'pending').length;
  const approved = incidentReports.filter(r => r.status === 'approved').length;
  const rejected = incidentReports.filter(r => r.status === 'rejected').length;

  // Filter listings
  const filteredReports = incidentReports.filter(rep => {
    const matchStatus = filterStatus === 'all' || rep.status === filterStatus;
    const matchSearch = rep.reporter.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        rep.locationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        rep.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const selectedReport = incidentReports.find(r => r.id === selectedReportId);

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

  return (
    <div className="space-y-6" id="incident-reports-layout">
      {/* View Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Resident Incident Reports Registry</h2>
          <p className="text-xs text-gray-400 mt-0.5">Evaluate, verify, or archive hazard notifications submitted by residents using the Mobile Webapp.</p>
        </div>
      </div>

      {/* Summary Indicator Metics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase block">TOTAL SEEDED REPORTS</span>
            <span className="text-xl font-bold text-slate-900 block mt-1">{total} submitted</span>
          </div>
          <div className="p-2 bg-slate-100 rounded text-slate-700">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-amber-500 font-bold uppercase block">PENDING VERIFICATION</span>
            <span className="text-xl font-bold text-amber-600 block mt-1">{pending} reviews</span>
          </div>
          <div className="p-2 bg-amber-50 rounded text-amber-700">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-500 font-bold uppercase block">APPROVED INCIDENTS</span>
            <span className="text-xl font-bold text-emerald-600 block mt-1">{approved} verified</span>
          </div>
          <div className="p-2 bg-emerald-50 rounded text-emerald-700">
            <Check className="w-5 h-5" />
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
          <div className="p-4 border-b border-gray-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            {/* Search query box */}
            <div className="relative max-w-xs w-full">
              <input
                type="text"
                placeholder="Search reporter, location category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded pl-8 pr-3 py-1.5 focus:outline-[#1E3A5F]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            {/* Status tab selectors */}
            <div className="flex items-center space-x-1 border border-gray-200 p-1 bg-white rounded">
              {['all', 'pending', 'approved', 'rejected'].map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
                    filterStatus === st 
                      ? 'bg-[#1E3A5F] text-white' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Table List representation */}
          {filteredReports.length === 0 ? (
            <div className="p-12 text-center text-gray-400 italic font-medium text-xs">
              No incident reports found matching active parameters.
            </div>
          ) : (
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse font-sans">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                    <th className="py-3 px-4">Reporter Details</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Classification</th>
                    <th className="py-3 px-4">Submitted Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Evaluation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-slate-700">
                  {filteredReports.map(rep => (
                    <tr 
                      key={rep.id} 
                      onClick={() => setSelectedReportId(rep.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedReportId === rep.id ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{rep.reporter}</div>
                        <div className="text-[10px] text-gray-400">{rep.reporterEmail || 'unknown@citizen.org'}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate font-medium">
                        {rep.locationName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-slate-100 text-slate-800 font-medium px-2 py-0.5 rounded text-[10px]">
                          {rep.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 font-mono text-[10px]">{rep.dateSubmitted}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          rep.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          rep.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          'bg-red-100 text-red-800 border border-red-250'
                        }`}>
                          {rep.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {rep.status === 'pending' ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleApprove(rep.id)}
                              className="p-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 font-bold text-[10px] uppercase transition-colors"
                              title="Verify/Approve Submission"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(rep.id)}
                              className="p-1 px-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded border border-red-155 font-bold text-[10px] uppercase transition-colors"
                              title="Reject Spurious Warning"
                            >
                              Reject
                            </button>
                          </div>
                        ) : rep.status === 'approved' && !rep.convertedToDangerZoneId ? (
                          <button
                            onClick={() => onConvertToDangerZone(rep)}
                            className="inline-flex items-center space-x-0.5 py-1 px-2 border border-yellow-300 hover:bg-yellow-50 text-yellow-700 rounded font-semibold text-[10px] transition-colors"
                            title="Convert Verified Incident to map Danger Zone"
                          >
                            <span>Deploy Geofence</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        ) : rep.convertedToDangerZoneId ? (
                          <span className="text-[10px] text-gray-400 font-medium italic">Geofenced Deployment</span>
                        ) : (
                          <span className="text-[10px] text-red-500 font-bold">Rejected Archival</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Evaluation Panel Drawer (4 columns) */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded shadow-sm p-4 flex flex-col justify-start">
          <h3 className="font-bold text-slate-900 border-b border-gray-100 pb-2 mb-4 flex items-center text-xs tracking-wider uppercase">
            <Share2 className="w-4.5 h-4.5 mr-1.5 text-[#1E3A5F]" />
            Incident Review Board
          </h3>

          {!selectedReport ? (
            <div className="my-auto py-12 text-center text-slate-400 text-xs italic">
              Select or click any submitted record on the table to view the detailed citizen dossier.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-gray-150">
                <span className="text-[9px] font-mono text-slate-400 block uppercase">Report Ref: {selectedReport.id.slice(0, 8)}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                  selectedReport.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                  selectedReport.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {selectedReport.status.toUpperCase()}
                </span>
              </div>

              {/* Citizen Identity */}
              <div className="space-y-2.5 p-3 bg-slate-50 border border-gray-200 rounded">
                <div className="flex items-center space-x-2 text-slate-800 font-bold">
                  <User className="w-4 h-4 text-[#1E3A5F]" />
                  <span>Reporter: {selectedReport.reporter}</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-500">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="font-mono">{selectedReport.reporterEmail || 'anonymous_citizen@gmail.com'}</span>
                </div>
              </div>

              {/* Location Specification Coordinates */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Stated Incident Point</span>
                <p className="font-semibold text-slate-900">{selectedReport.locationName}</p>
                <div className="flex items-center space-x-1.5 font-mono text-[10px] text-gray-400">
                  <MapPin className="w-3.5 h-3.5 text-red-500" />
                  <span>Lat: {selectedReport.latitude.toFixed(5)}, Lng: {selectedReport.longitude.toFixed(5)}</span>
                </div>
              </div>

              {/* Categorization & User Text Details */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Reporter Description Warning</span>
                <div className="p-3 bg-slate-100 rounded text-slate-800 leading-relaxed italic border-l-2 border-[#1E3A5F]">
                  "{selectedReport.description || 'No descriptive context provided.'}"
                </div>
              </div>

              {/* Subm date */}
              <div className="text-[10px] text-gray-400 flex justify-between pt-2 border-t border-gray-100 font-mono">
                <span>Timestamp: {selectedReport.dateSubmitted}</span>
                <span>Type: {selectedReport.category}</span>
              </div>

              {/* Evaluation Action Panel buttons */}
              {selectedReport.status === 'pending' && (
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <button
                    onClick={() => handleApprove(selectedReport.id)}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-center space-x-1 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleReject(selectedReport.id)}
                    className="py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded font-bold uppercase tracking-wider text-[10px] flex items-center justify-center space-x-1 shadow-sm"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              )}

              {selectedReport.status === 'approved' && !selectedReport.convertedToDangerZoneId && (
                <div className="pt-2">
                  <button
                    onClick={() => onConvertToDangerZone(selectedReport)}
                    className="w-full py-2 px-3 bg-[#1E3A5F] hover:bg-[#152a44] text-white rounded font-bold tracking-wider text-xs flex items-center justify-center space-x-1.5 shadow"
                  >
                    <ArrowUpRight className="w-4.5 h-4.5 text-yellow-400" />
                    <span>PROCEED WITH GEOFENCE DEPLOYMENT</span>
                  </button>
                  <p className="text-[10px] text-amber-700 italic mt-1.5 text-center leading-normal">
                    This will copy coordinates and details onto the Danger Zones setup screen immediately.
                  </p>
                </div>
              )}

              {selectedReport.convertedToDangerZoneId && (
                <div className="p-3 bg-gray-50 border border-gray-150 rounded text-center text-gray-500 italic mt-2">
                  ✓ Geofence deployment has been executed and linked to Danger Zone ID {selectedReport.convertedToDangerZoneId.slice(0, 8)}.
                </div>
              )}

            </div>
          )}
        </div>

      </div>

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

      <AlertToast
        isOpen={toastConfig !== null}
        message={toastConfig?.message || ""}
        type={toastConfig?.type}
        onClose={() => setToastConfig(null)}
      />

    </div>
  );
}
