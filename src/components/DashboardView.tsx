import React from 'react';
import { 
  AlertTriangle, 
  FileText, 
  CheckCircle, 
  Megaphone, 
  Users, 
  History, 
  TrendingUp, 
  ArrowRight,
  Shield,
  Clock,
  MapPin
} from 'lucide-react';
import { DangerZone, IncidentReport, CommunityAlert, ActivityLog } from '../types';
import InteractiveMap from './InteractiveMap';

interface DashboardViewProps {
  dangerZones: DangerZone[];
  incidentReports: IncidentReport[];
  communityAlerts: CommunityAlert[];
  usersCount: { residents: number; admins: number };
  recentLogs: ActivityLog[];
  onNavigateToView: (view: string) => void;
}

export default function DashboardView({
  dangerZones,
  incidentReports,
  communityAlerts,
  usersCount,
  recentLogs,
  onNavigateToView
}: DashboardViewProps) {
  
  // Calculate critical stat counts
  const activeDangerZonesCount = dangerZones.filter(z => z.status === 'active').length;
  const highRiskZonesCount = dangerZones.filter(
    z => (z.riskLevel === 'HIGH' || z.riskLevel === 'High' || z.riskLevel === 'Critical') && z.status === 'active'
  ).length;
  const pendingReportsCount = incidentReports.filter(r => r.status === 'pending').length;
  const totalResidentsCount = usersCount.residents;

  // Render quick metric card definitions to match instructions:
  // Registered Users, Active Danger Zones, High Risk Zones, Recent Reports
  const metrics = [
    {
      id: 'users',
      label: 'Registered Users',
      value: totalResidentsCount,
      icon: Users,
      color: 'text-[#1E3A5F] bg-slate-50 border-slate-200',
      description: totalResidentsCount === 0 
        ? '⚠️ No mobile database linked' 
        : 'Synchronized mobile app profiles'
    },
    {
      id: 'danger',
      label: 'Active Danger Zones',
      value: activeDangerZonesCount,
      icon: AlertTriangle,
      color: 'text-[#1E3A5F] bg-[#1E3A5F]/5 border-slate-200',
      description: 'Active warning geofences'
    },
    {
      id: 'danger_high',
      label: 'High Risk Zones',
      value: highRiskZonesCount,
      icon: AlertTriangle,
      color: 'text-red-650 bg-red-50 border-red-200',
      description: 'Critical / High danger classifications'
    },
    {
      id: 'reports',
      label: 'Recent Reports',
      value: incidentReports.length,
      icon: FileText,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      description: 'Total user incident submissions'
    }
  ];

  return (
    <div className="space-y-6" id="dashboard-view">
      
      {/* Welcome Banner Row */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white border border-gray-200 p-5 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-950">Operations Overview</h2>
          <p className="text-xs text-gray-500 mt-0.5">Barangay Palanan municipal safety command center telemetries.</p>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <div className="bg-slate-100 px-3 py-1.5 rounded border border-gray-200 flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-600 font-mono font-medium">SYS DATE: {new Date().toLocaleDateString()}</span>
          </div>
          <div className="bg-emerald-50 text-emerald-950 px-3 py-1.5 rounded border border-emerald-200 flex items-center space-x-1 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>REAL-TIME COUPLING</span>
          </div>
        </div>
      </div>

      {/* Grid: 5 Operational Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div 
              key={m.label} 
              className="bg-white border select-none border-gray-200 rounded p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all active:scale-[0.98] duration-150 cursor-pointer"
              onClick={() => onNavigateToView(m.id === 'danger_high' ? 'danger' : m.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">{m.label}</span>
                <div className={`p-1.5 rounded border ${m.color}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold font-display text-slate-900 block leading-none">{m.value}</span>
                <span className="text-[10px] text-gray-400 mt-1 block">{m.description}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Split Row: GIS Small Preview (Left) & Incident/Audit Logs (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SMALL MAP PREVIEW PANEL (7 COLS) */}
        <div className="lg:col-span-7 bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center">
                <MapPin className="w-4 h-4 mr-1.5 text-[#1E3A5F]" />
                Geospatial Tactical Map Preview
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Barangay Palanan containment grid, visual marker locations.</p>
            </div>
            <button 
              onClick={() => onNavigateToView('map')}
              className="text-xs text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white font-semibold flex items-center space-x-1 border border-slate-200 bg-white px-2.5 py-1 rounded transition-colors"
            >
              <span>Full Screen Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 p-3">
            <div className="h-[360px] relative rounded overflow-hidden">
              <InteractiveMap 
                dangerZones={dangerZones} 
                incidentReports={incidentReports} 
                selectedCategory="all" 
                onSelectCategory={() => {}} 
                showReports={true}
              />
            </div>
          </div>
        </div>

        {/* RECENT ACTIVITIES & TELEMETRY (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* Quick Stats Panel */}
          <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
            <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center border-b border-gray-100 pb-2">
              <TrendingUp className="w-4 h-4 mr-1.5 text-[#1E3A5F]" />
              Community Risk Index Analytics
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-slate-50 p-2.5 rounded border border-gray-100">
                <span className="text-[9px] text-gray-500 block">TOTAL REPORT SEED</span>
                <span className="text-sm font-bold text-slate-800 block mt-0.5">{dangerZones.length}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-gray-100">
                <span className="text-[9px] text-gray-500 block">CITIZEN RESPONSE RATIO</span>
                <span className="text-sm font-bold text-emerald-600 block mt-0.5">100% SECURE</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-gray-100">
                <span className="text-[9px] text-gray-500 block">CRITICAL THREATS</span>
                <span className="text-sm font-bold text-red-600 block mt-0.5">
                  {dangerZones.filter(z => (z.riskLevel === 'HIGH' || z.riskLevel === 'High' || z.riskLevel === 'Critical') && z.status === 'active').length}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded border border-gray-100">
                <span className="text-[9px] text-gray-500 block">PENDING CITIZEN REPORTS</span>
                <span className="text-sm font-bold text-amber-600 block mt-0.5">{pendingReportsCount} Reports</span>
              </div>
            </div>
          </div>

          {/* Recent Audits Panel */}
          <div className="bg-white border border-gray-200 rounded shadow-sm p-4 flex-1 flex flex-col">
            <div className="border-b border-gray-100 pb-2 mb-3 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center">
                <History className="w-4 h-4 mr-1.5 text-[#1E3A5F]" />
                Recent Master Audit Log
              </h3>
              <button 
                onClick={() => onNavigateToView('logs')}
                className="text-[11px] text-[#1E3A5F] hover:underline font-bold"
              >
                View Logs
              </button>
            </div>
            
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[220px] pr-1">
              {recentLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  <Shield className="w-8 h-8 mx-auto text-slate-200 mb-1.5" />
                  No audit operations logged yet.
                </div>
              ) : (
                recentLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="p-2 bg-slate-50 border border-slate-200 rounded flex items-start space-x-2.5 text-xs">
                    <span className="bg-[#1E3A5F] text-white rounded px-1.5 py-0.5 font-mono text-[9px] mt-0.5 font-semibold">AUDIT</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 truncate">{log.action}</p>
                      <p className="text-[10px] text-gray-500 truncate">Agent: {log.adminName} ({log.adminEmail})</p>
                      <span className="text-[9px] text-gray-400 font-mono block mt-1">
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
