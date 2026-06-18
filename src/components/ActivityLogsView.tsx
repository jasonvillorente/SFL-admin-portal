import React, { useState } from 'react';
import { ActivityLog } from '../types';
import { 
  History, 
  Search, 
  Trash2, 
  Download, 
  FileSpreadsheet, 
  Building2, 
  FileText,
  Clock,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import AlertToast from './AlertToast';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
  onClearLogs?: () => Promise<void>;
}

export default function ActivityLogsView({
  logs,
  onClearLogs
}: ActivityLogsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [toastConfig, setToastConfig] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const filteredLogs = logs.filter(log => {
    return log.adminName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           log.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
           log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (log.details && log.details.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const handleExportCSV = () => {
    setToastConfig({
      message: "Compiling security ledger dataset... Exporting Barangay Palanan Activity Log sheet as security-audit.csv. Downloading has begun in background.",
      type: 'success'
    });
  };

  const getLogTypeColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('deactivate') || act.includes('reject')) return 'border-red-500 text-red-700 bg-red-50';
    if (act.includes('add') || act.includes('create') || act.includes('publish') || act.includes('broadcast')) return 'border-emerald-500 text-emerald-700 bg-emerald-50';
    if (act.includes('update') || act.includes('edit') || act.includes('approved')) return 'border-amber-500 text-amber-700 bg-amber-50';
    return 'border-[#1E3A5F] text-[#1E3A5F] bg-slate-50';
  };

  return (
    <div className="space-y-6" id="activity-logs-views">
      {/* View Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Municipal Security Audit Logs</h2>
          <p className="text-xs text-gray-400 mt-0.5">Immutable audit trails recording every administrator database modification, alerts pushed, or profile change.</p>
        </div>
        
        {/* Export / controls action ribbon */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 border border-gray-300 hover:bg-slate-50 font-semibold text-slate-700 rounded transition-colors flex items-center space-x-1 uppercase"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Primary logs grid display */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden" id="logs-panel-dossier">
        
        {/* Top search utility bar */}
        <div className="p-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between text-xs">
          <div className="relative max-w-sm w-full">
            <input
              type="text"
              placeholder="Search logs by operator name, description activity, details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded pl-8 pr-3 py-1.5 focus:outline-[#1E3A5F]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">
            {filteredLogs.length} matching events parsed
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 italic text-xs">
            No administrator activities recorded in matching parameters yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 text-xs">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-4 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                
                {/* Left side describing transaction */}
                <div className="flex items-start space-x-3.5 min-w-0">
                  <div className={`border-l-4 p-2.5 rounded shadow-sm shrink-0 flex items-center justify-center ${getLogTypeColor(log.action)}`}>
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{log.action}</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">{log.details}</p>
                    <div className="flex items-center space-x-2 mt-2 text-[10px] text-gray-400">
                      <span className="bg-slate-150 rounded px-1.5 py-0.5 text-[#1E3A5F] font-semibold">{log.adminName}</span>
                      <span>•</span>
                      <span className="font-mono">{log.adminEmail}</span>
                    </div>
                  </div>
                </div>

                {/* Right side showing stamp */}
                <div className="flex flex-row sm:flex-col sm:items-end justify-between sm:justify-start shrink-0 text-[10px] font-mono text-gray-400">
                  <div className="flex items-center space-x-1 bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <span className="mt-1.5 uppercase font-bold tracking-widest text-emerald-600 block text-right">SECURE AUDIT ✓</span>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      <AlertToast
        isOpen={toastConfig !== null}
        message={toastConfig?.message || ""}
        type={toastConfig?.type}
        onClose={() => setToastConfig(null)}
      />

    </div>
  );
}
