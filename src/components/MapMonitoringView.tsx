import React, { useState } from 'react';
import { DangerZone, IncidentReport, UserAccount, getResidentName, formatPhoneNumber, getReportImage, resolveLocationName, safeString } from '../types';
import InteractiveMap from './InteractiveMap';
import { Filter, Search, AlertTriangle, ShieldAlert, Layers, MapPin, Eye, Compass, RefreshCw, Phone, Camera } from 'lucide-react';

interface MapMonitoringViewProps {
  dangerZones: DangerZone[];
  incidentReports: IncidentReport[];
  users?: UserAccount[];
  selectedMarker: { type: 'zone' | 'report'; id: string } | null;
  onSelectMarker: (marker: { type: 'zone' | 'report'; id: string } | null) => void;
}

const CATEGORIES = [
  'Crime', 
  'Poor Lighting', 
  'Flood Risk', 
  'Accident-Prone Area', 
  'Construction Area', 
  'Suspicious Activity'
];

export default function MapMonitoringView({
  dangerZones,
  incidentReports,
  users = [],
  selectedMarker,
  onSelectMarker
}: MapMonitoringViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showReports, setShowReports] = useState(true);

  // Helper to cross-reference reporter names
  const getReporterDisplayName = (report: IncidentReport) => {
    if (users && users.length > 0) {
      const match = users.find(u => 
        (report.userId && (u.uid === report.userId || u.id === report.userId)) ||
        (report.reporterEmail && u.email && report.reporterEmail.toLowerCase() === u.email.toLowerCase()) ||
        (report.phoneNumber && u.phoneNumber && report.phoneNumber.replace(/\D/g, '') === u.phoneNumber.replace(/\D/g, ''))
      );
      if (match) return getResidentName(match);
    }
    return getResidentName(report, 'Anonymous Citizen');
  };

  // Filters danger zones
  const filteredZones = dangerZones.filter(z => {
    const matchCategory = selectedCategory === 'all' || z?.category === selectedCategory;
    const locName = (z?.locationName || '').toLowerCase();
    const desc = (z?.description || '').toLowerCase();
    const query = (searchQuery || '').toLowerCase();
    const matchSearch = !query || locName.includes(query) || desc.includes(query);
    return z?.status === 'active' && matchCategory && matchSearch;
  });

  // Filters incident reports
  const filteredReports = incidentReports.filter(r => {
    const matchCategory = selectedCategory === 'all' || r?.category === selectedCategory;
    const locName = (r?.locationName || '').toLowerCase();
    const desc = (r?.description || '').toLowerCase();
    const repName = getReporterDisplayName(r).toLowerCase();
    const phone = (r?.phoneNumber || r?.reporterPhone || '').toLowerCase();
    const query = (searchQuery || '').toLowerCase();
    const matchSearch = !query || locName.includes(query) || desc.includes(query) || repName.includes(query) || phone.includes(query);
    return matchCategory && matchSearch;
  });

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] space-y-4" id="map-monitoring-layout">
      {/* Search & Global Category Filtering Bar */}
      <div className="bg-white border border-gray-200 p-4 rounded shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center font-display">
            <Compass className="w-5 h-5 mr-2 text-[#1E3A5F] shrink-0" />
            Barangay Safety GIS Map Controller
          </h2>
          <p className="text-xs text-gray-400 mt-0.5 font-sans">Filter hazards, incidents, and localized threat indicators across Palanan grids.</p>
        </div>

        {/* Filters Panel controls */}
        <div className="flex flex-wrap items-center gap-3 font-sans">
          <div className="relative">
            <input
              type="text"
              placeholder="Filter names/details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-gray-300 rounded px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-[#1E3A5F] w-48 pl-8 font-medium"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="font-semibold text-slate-600 flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Category:
            </span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-gray-300 rounded px-2 py-1.5 text-xs text-slate-800 font-medium focus:outline-[#1E3A5F]"
            >
              <option value="all">Display All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showReports}
              onChange={(e) => setShowReports(e.target.checked)}
              className="rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F] w-4 h-4"
            />
            <span>Show Incident Pinpoints</span>
          </label>
        </div>
      </div>

      {/* Main Split Grid Overlay */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch min-h-[480px]">
        
        {/* Left Side: Dynamic HUD Sidebar listings (4 Cols) */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col justify-start font-sans">
          <div className="p-3.5 border-b border-gray-100 bg-[#1E3A5F] text-white flex items-center justify-between">
            <h3 className="font-bold text-xs tracking-wider uppercase flex items-center font-display">
              <Layers className="w-4 h-4 mr-2 text-yellow-500" />
              Active Target Listings
            </h3>
            <span className="bg-yellow-500 text-slate-950 font-bold px-1.5 py-0.5 rounded text-[10px] font-mono leading-none">
              {filteredZones.length + (showReports ? filteredReports.length : 0)} TARGETS
            </span>
          </div>

          {/* Combined listing scroll box */}
          <div className="flex-1 overflow-y-auto max-h-[500px] p-2 space-y-2">
            
            {/* 1. Danger Zones Listings */}
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-bold text-slate-400 tracking-widest uppercase px-1 font-display">Danger Zones ({filteredZones.length})</h4>
              {filteredZones.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic px-2">No active danger zones match parameters.</p>
              ) : (
                filteredZones.map(zone => {
                  const isSelected = selectedMarker?.type === 'zone' && selectedMarker?.id === zone.id;
                  const zoneImg = getReportImage(zone);

                  return (
                    <button
                      key={`list-z-${zone.id}`}
                      onClick={() => onSelectMarker({ type: 'zone', id: zone.id })}
                      className={`w-full text-left p-2.5 rounded border transition-all flex items-start space-x-2.5 text-xs cursor-pointer ${
                        isSelected 
                          ? 'bg-red-50 border-red-300 ring-1 ring-red-300' 
                          : 'bg-slate-50 border-gray-200 hover:bg-slate-100'
                      }`}
                    >
                      {zoneImg ? (
                        <div className="w-9 h-9 rounded overflow-hidden border border-red-200 shrink-0 bg-slate-200">
                          <img src={zoneImg} alt="Hazard" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        </div>
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 truncate pr-2">{resolveLocationName(zone)}</span>
                          <span className={`text-[9px] font-bold px-1 rounded uppercase shrink-0 ${
                            zone.riskLevel === 'Critical' ? 'bg-red-100 text-red-800' :
                            zone.riskLevel === 'High' ? 'bg-orange-100 text-orange-850' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {zone.riskLevel}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{safeString(zone.description) || 'No notes provided'}</p>
                        <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1 font-mono">
                          <span>{zone.category}</span>
                          <span className="text-[9px] text-[#1E3A5F] font-bold">CLICK TO LOCATE</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* 2. Resident Incident Reports Listings */}
            {showReports && (
              <div className="space-y-1.5 border-t border-gray-100 pt-3 mt-3">
                <h4 className="text-[10px] font-bold text-slate-400 tracking-widest uppercase px-1 font-display">Citizen Submissions ({filteredReports.length})</h4>
                {filteredReports.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic px-2">No submitted reports match parameters.</p>
                ) : (
                  filteredReports.map(report => {
                    const isSelected = selectedMarker?.type === 'report' && selectedMarker?.id === report.id;
                    const reporterDisplayName = getReporterDisplayName(report);
                    const phone = report.phoneNumber || report.reporterPhone || report.phone;
                    const formattedPhone = formatPhoneNumber(phone);
                    const repImg = getReportImage(report);

                    return (
                      <button
                        key={`list-rep-${report.id}`}
                        onClick={() => onSelectMarker({ type: 'report', id: report.id })}
                        className={`w-full text-left p-2.5 rounded border transition-all flex items-start space-x-2.5 text-xs cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' 
                            : 'bg-slate-50 border-gray-200 hover:bg-slate-100'
                        }`}
                      >
                        {repImg ? (
                          <div className="w-9 h-9 rounded overflow-hidden border border-indigo-200 shrink-0 bg-slate-200">
                            <img src={repImg} alt="Evidence" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                          </div>
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 truncate pr-2">{reporterDisplayName}</span>
                            <span className={`text-[9px] font-bold px-1 rounded uppercase shrink-0 ${
                              report.status === 'pending' ? 'bg-yellow-100 text-yellow-800 font-semibold' : 'bg-green-100 text-green-800'
                            }`}>
                              {report.status}
                            </span>
                          </div>
                          
                          {formattedPhone && (
                            <div className="flex items-center space-x-1 text-[10px] text-indigo-600 font-mono mt-0.5">
                              <Phone className="w-2.5 h-2.5 shrink-0" />
                              <span>{formattedPhone}</span>
                            </div>
                          )}

                          <p className="text-[11px] text-slate-700 italic truncate mt-0.5">"{resolveLocationName(report)}"</p>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">{safeString(report.description)}</p>
                          <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1 font-mono">
                            <span>{report.category}</span>
                            <span className="text-[9px] text-[#1E3A5F] font-bold">CLICK TO GEOLOCATE</span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Map Canvas Component (8 Cols) */}
        <div className="lg:col-span-8 h-full flex flex-col min-h-[480px]">
          <InteractiveMap
            dangerZones={dangerZones}
            incidentReports={incidentReports}
            selectedCategory={selectedCategory}
            onSelectCategory={() => {}}
            selectedMarker={selectedMarker}
            onSelectMarker={onSelectMarker}
            showReports={showReports}
          />
        </div>

      </div>
    </div>
  );
}
