import React from 'react';
import { 
  LayoutDashboard, 
  Map, 
  AlertTriangle, 
  FileText, 
  Megaphone, 
  Users, 
  History, 
  Settings, 
  LogOut,
  ShieldCheck,
  Building2
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  adminName: string;
  adminEmail: string;
  onLogout: () => void;
  counts?: {
    pendingReports?: number;
    totalReports?: number;
    activeZones?: number;
    totalUsers?: number;
  };
}

export default function Sidebar({ 
  currentView, 
  onViewChange, 
  adminName, 
  adminEmail, 
  onLogout,
  counts
}: SidebarProps) {
  
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { 
      id: 'users', 
      label: 'Users', 
      icon: Users,
      badge: counts?.totalUsers !== undefined && counts.totalUsers > 0 ? String(counts.totalUsers) : undefined,
      badgeColor: 'bg-blue-800 text-blue-200'
    },
    { 
      id: 'danger', 
      label: 'Danger Zones', 
      icon: AlertTriangle,
      badge: counts?.activeZones !== undefined && counts.activeZones > 0 ? String(counts.activeZones) : undefined,
      badgeColor: 'bg-amber-800/80 text-amber-200'
    },
    { 
      id: 'reports', 
      label: 'Incident Reports', 
      icon: FileText,
      badge: counts?.pendingReports !== undefined && counts.pendingReports > 0 ? `${counts.pendingReports} pending` : undefined,
      badgeColor: 'bg-amber-500 text-slate-900 font-bold'
    },
    { id: 'logs', label: 'Activity Logs', icon: History },
    { id: 'settings', label: 'Database Settings', icon: Settings }
  ];

  return (
    <aside className="w-64 bg-[#1E3A5F] text-white flex flex-col h-full border-r border-slate-700 shadow-sm select-none shrink-0" id="admin-sidebar">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#2D4D77] flex items-center space-x-3 bg-[#132844]">
        <div className="p-2 rounded bg-white text-[#1E3A5F] border border-slate-200">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wider font-display text-white">BRGY. PALANAN</h1>
          <p className="text-[10px] text-[#B0BCCB] font-semibold tracking-widest font-mono">ADMIN SERVICES</p>
        </div>
      </div>

      {/* Nav Menu Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-xs font-medium transition-all duration-150 relative group ${
                isActive 
                  ? 'bg-[#2D4D77] text-white font-semibold font-display shadow-sm' 
                  : 'text-slate-300 hover:bg-[#2A4974] hover:text-white'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r" />
              )}
              <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'scale-110 text-white' : 'text-slate-400 group-hover:text-white'}`} />
              <span className="truncate flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none ${item.badgeColor || 'bg-slate-700 text-slate-200'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Operator Account Footer Card */}
      <div className="p-4 border-t border-[#2D4D77] bg-[#1a3253]">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-[#2D4D77] text-white border border-slate-500 flex items-center justify-center font-bold text-xs ring-2 ring-slate-700 uppercase">
            {adminName.charAt(0) || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-white truncate">{adminName || 'Admin Operator'}</h4>
            <div className="flex items-center space-x-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
              <p className="text-[9px] text-[#B0BCCB] font-mono truncate">{adminEmail || 'admin@makati.gov.ph'}</p>
            </div>
          </div>
        </div>
        
        {/* Sign Out Button */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 border border-slate-600 rounded-md bg-[#1E3A5F] hover:bg-red-700 hover:border-red-600 font-medium text-xs text-white transition-all duration-150 shadow-sm"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Operator Logout</span>
        </button>
      </div>
    </aside>
  );
}
