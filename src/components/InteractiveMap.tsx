import React, { useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DangerZone, IncidentReport, getResidentName, formatPhoneNumber, resolveLocationName, safeString, isReportConvertedToZone } from '../types';
import { PALANAN_CENTER, PALANAN_BOUNDS, HIGH_INCIDENT_THRESHOLD, ZONE_COLOR } from '../utils/zoneConstants';
import { Compass } from 'lucide-react';

interface InteractiveMapProps {
  dangerZones: DangerZone[];
  incidentReports?: IncidentReport[];
  selectedCategory: string;
  onSelectCategory?: (category: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerDrag?: (lat: number, lng: number) => void;
  selectedMarker?: { type: 'zone' | 'report'; id: string } | null;
  onSelectMarker?: (marker: { type: 'zone' | 'report'; id: string } | null) => void;
  showReports?: boolean;
  isCreating?: boolean;
  createLat?: number | null;
  createLng?: number | null;
  createRadius?: number;
  createColor?: string;
}

// Fallback color configurations for backwards compatibility
const MAP_RISK_COLORS: Record<string, string> = {
  Low: '#10B981',
  Moderate: '#F59E0B',
  High: '#F97316',
  Critical: '#EF4444',
  LOW: '#10B981',
  MEDIUM: '#F97316',
};

export default function InteractiveMap({
  dangerZones,
  incidentReports = [],
  selectedCategory,
  onMapClick,
  onMarkerDrag,
  selectedMarker,
  onSelectMarker,
  showReports = true,
  isCreating = false,
  createLat = null,
  createLng = null,
  createRadius = 100,
  createColor = '#EF4444'
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const zonesGroupRef = useRef<L.FeatureGroup | null>(null);
  const reportsGroupRef = useRef<L.FeatureGroup | null>(null);
  const creationMarkerRef = useRef<L.Marker | null>(null);
  const creationCircleRef = useRef<L.Circle | null>(null);

  // Helper function to check if coordinate pair is valid (skips null, undefined, NaN, and 0,0)
  const isValidCoord = (lat: any, lng: any): boolean => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    return !isNaN(nLat) && !isNaN(nLng) && isFinite(nLat) && isFinite(nLng) &&
      !(nLat === 0 && nLng === 0) &&
      nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
  };

  // 1. Initialize Map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstance.current) return;

    // Create Map bounded strictly to Barangay Palanan settings
    const map = L.map(mapContainerRef.current, {
      center: PALANAN_CENTER,
      zoom: 16,
      minZoom: 14,
      maxZoom: 19,
      zoomControl: true,
      maxBounds: PALANAN_BOUNDS,
      maxBoundsViscosity: 1.0
    });

    mapInstance.current = map;

    // Add high quality OpenStreetMap tiles Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Initialize layers
    const zonesGroup = new L.FeatureGroup();
    zonesGroup.addTo(map);
    zonesGroupRef.current = zonesGroup;

    const reportsGroup = new L.FeatureGroup();
    reportsGroup.addTo(map);
    reportsGroupRef.current = reportsGroup;

    // User click handler on map triggers location placement back to parent state
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClick && e?.latlng && isValidCoord(e.latlng.lat, e.latlng.lng)) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });

    // ResizeObserver to prevent visual breakages in container scale-ups
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // 2. Reactively handle draggable creation elements
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous creation layers
    if (creationMarkerRef.current) {
      map.removeLayer(creationMarkerRef.current);
      creationMarkerRef.current = null;
    }
    if (creationCircleRef.current) {
      map.removeLayer(creationCircleRef.current);
      creationCircleRef.current = null;
    }

    if (isCreating && isValidCoord(createLat, createLng)) {
      const lat = Number(createLat);
      const lng = Number(createLng);

      // Create a nice draggable marker
      const dragIcon = L.divIcon({
        html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-[#1E3A5F] ring-4 ring-[#1E3A5F]/30 text-white border-2 border-white shadow-xl">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                   <circle cx="12" cy="10" r="3"/>
                 </svg>
               </div>`,
        className: 'creation-draggable-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      const marker = L.marker([lat, lng], {
        icon: dragIcon,
        draggable: true
      }).addTo(map);

      marker.on('dragend', (e) => {
        const newLatLng = e.target.getLatLng();
        if (onMarkerDrag && newLatLng && isValidCoord(newLatLng.lat, newLatLng.lng)) {
          onMarkerDrag(newLatLng.lat, newLatLng.lng);
        }
      });

      creationMarkerRef.current = marker;

      // Create the live preview circle around it with single shared ZONE_COLOR
      const circleHexColor = ZONE_COLOR;
      const circle = L.circle([lat, lng], {
        radius: Number(createRadius) || 100,
        color: circleHexColor,
        fillColor: circleHexColor,
        weight: 3,
        opacity: 0.85,
        fillOpacity: 0.22,
        dashArray: '5, 5'
      }).addTo(map);

      creationCircleRef.current = circle;

      // Pan & center map view directly to the exact pinpoint coordinates
      map.setView([lat, lng], Math.max(map.getZoom(), 17), { animate: true });
    }
  }, [isCreating, createLat, createLng, createRadius, createColor, onMarkerDrag]);

  // 3. Reactively populate Danger Circle Zones & optional report pinpoints
  useEffect(() => {
    const map = mapInstance.current;
    const zonesGroup = zonesGroupRef.current;
    const reportsGroup = reportsGroupRef.current;

    if (!map || !zonesGroup || !reportsGroup) return;

    // Clear previous elements
    zonesGroup.clearLayers();
    reportsGroup.clearLayers();

    // A. Filter danger zones according to category classifying preferences
    const activeZones = selectedCategory === 'all'
      ? dangerZones.filter(z => z.status === 'active')
      : dangerZones.filter(z => z.status === 'active' && z.category === selectedCategory);

    activeZones.forEach(zone => {
      if (zone.needsLocation || !isValidCoord(zone.latitude, zone.longitude)) {
        return;
      }

      const lat = Number(zone.latitude);
      const lng = Number(zone.longitude);
      const isSelected = selectedMarker?.type === 'zone' && selectedMarker?.id === zone.id;
      const isInactive = zone.status === 'inactive' || zone.needsLocation === true;
      const isHighIncident = (zone.crimeCount ?? 0) >= HIGH_INCIDENT_THRESHOLD;

      // Universal single color ZONE_COLOR = '#EA580C' used by all zone circles
      const hexColor = ZONE_COLOR;
      const radiusMeters = Number(zone.radius) || 100;

      // Inactive & needsLocation zones use the same color, dashed and lighter
      const circle = L.circle([lat, lng], {
        radius: radiusMeters,
        color: hexColor,
        fillColor: hexColor,
        dashArray: isInactive ? '6, 6' : undefined,
        weight: isSelected ? 4 : (isInactive ? 1.5 : 2),
        opacity: isInactive ? 0.5 : (isSelected ? 0.95 : 0.85),
        fillOpacity: isInactive ? 0.08 : 0.22
      });

      // Click listener reports target node selection back to parent
      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (onSelectMarker) {
          onSelectMarker({ type: 'zone', id: zone.id });
        }
      });

      const dateString = zone.createdAt ? new Date(zone.createdAt).toLocaleDateString() : 'N/A';
      const resolvedLocName = resolveLocationName(zone);
      const activeTimeText = zone.activeTime === 'night_only' 
        ? `Night Only (${zone.startHour ?? 18}:00 - ${zone.endHour ?? 5}:00)`
        : zone.activeTime === 'day_only'
        ? `Day Only (${zone.startHour ?? 5}:00 - ${zone.endHour ?? 18}:00)`
        : `All Day (24 Hours)`;
      const sourceText = zone.source === 'barangay_data'
        ? 'Barangay Official Data'
        : zone.source === 'resident_report'
        ? 'Resident Report'
        : 'Both (Verified)';

      const totalCrimes = zone.crimeCount ?? ((zone.nightCrimeCount ?? 0) + (zone.dayCrimeCount ?? 0));

      const popupHtml = `
        <div class="p-2.5 max-w-xs text-xs font-sans" id="popup-zone-${zone.id}">
          <div class="flex items-center space-x-1.5 font-bold border-b border-gray-100 pb-1.5 mb-1.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${hexColor}"></span>
            <h4 class="font-bold text-slate-900 text-xs leading-snug">${resolvedLocName}</h4>
            ${isHighIncident ? '<span class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 font-bold uppercase tracking-wider">High Incident</span>' : ''}
          </div>
          <table class="w-full text-left font-sans text-[11px] space-y-0.5">
            <tr>
              <td class="font-bold text-slate-400 w-20 uppercase text-[9px] tracking-wider">Category:</td>
              <td class="text-slate-800 font-medium">${safeString(zone.category)}</td>
            </tr>
            <tr>
              <td class="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Incidents:</td>
              <td class="font-bold text-slate-800">
                ${totalCrimes} recorded
                ${zone.nightCrimeCount !== undefined || zone.dayCrimeCount !== undefined ? `<span class="text-[10px] text-slate-500 font-normal"> (Night: ${zone.nightCrimeCount ?? 0}, Day: ${zone.dayCrimeCount ?? 0})</span>` : ''}
              </td>
            </tr>
            <tr>
              <td class="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Active:</td>
              <td class="text-slate-700 font-medium">${activeTimeText}</td>
            </tr>
            <tr>
              <td class="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Source:</td>
              <td class="text-slate-700">${sourceText}</td>
            </tr>
            <tr>
              <td class="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Radius:</td>
              <td class="text-slate-700 font-mono">${radiusMeters}m</td>
            </tr>
            ${zone.dataPeriod ? `
            <tr>
              <td class="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Period:</td>
              <td class="text-slate-600 text-[10px]">${safeString(zone.dataPeriod)}</td>
            </tr>` : ''}
          </table>
          <p class="text-[11px] text-slate-600 bg-slate-50 border border-gray-200 p-2 rounded mt-2 italic max-h-16 overflow-y-auto">
            "${safeString(zone.description) || 'No safety remarks registered.'}"
          </p>
        </div>
      `;

      circle.bindPopup(popupHtml, { maxWidth: 300, closeButton: true });
      circle.addTo(zonesGroup);

    });

    // B. Incident pinpoints if toggle is on (excluding reports already converted to active danger zones)
    if (showReports && incidentReports.length > 0) {
      const activeReports = (selectedCategory === 'all'
        ? incidentReports
        : incidentReports.filter(r => r.category === selectedCategory)
      ).filter(r => !isReportConvertedToZone(r, dangerZones));

      activeReports.forEach(report => {
        if (!isValidCoord(report.latitude, report.longitude)) {
          console.warn('Skipping incident report with invalid coordinates:', report);
          return;
        }

        const lat = Number(report.latitude);
        const lng = Number(report.longitude);
        const isSelected = selectedMarker?.type === 'report' && selectedMarker?.id === report.id;

        // Leaflet standard marker with nice inline html icon representing report point
        const customIcon = L.divIcon({
          html: `<div class="flex items-center justify-center w-6 h-6 rounded-full ${isSelected ? 'bg-indigo-700 ring-4 ring-indigo-200 scale-125' : 'bg-indigo-500'} text-white border-2 border-white shadow-md transition-all">
                   <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                   </svg>
                 </div>`,
          className: 'custom-report-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker([lat, lng], { icon: customIcon });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (onSelectMarker) {
            onSelectMarker({ type: 'report', id: report.id });
          }
        });

        const reporterDisplayName = getResidentName(report, 'Anonymous Citizen');
        const phone = report.reporterPhone || report.phoneNumber || report.phone;
        const formattedPhone = formatPhoneNumber(phone);
        const contactLine = formattedPhone 
          ? `<div><span class="font-semibold text-slate-500">Contact:</span> <span class="font-mono text-indigo-700">${formattedPhone}</span></div>` 
          : (report.reporterEmail ? `<div><span class="font-semibold text-slate-500">Email:</span> <span class="font-mono">${report.reporterEmail}</span></div>` : '');

        const reportPopup = `
          <div class="p-2 max-w-xs text-xs font-sans">
            <h4 class="font-bold text-indigo-900 border-b pb-1 mb-1 font-display">Citizen Report Pinpoint</h4>
            <div><span class="font-semibold text-slate-500">Reporter:</span> <strong class="text-slate-800">${reporterDisplayName}</strong></div>
            ${contactLine}
            <div><span class="font-semibold text-slate-500">Type:</span> ${safeString(report.category) || 'Incident'}</div>
            <div><span class="font-semibold text-slate-500">Location:</span> <span class="text-slate-700">${resolveLocationName(report)}</span></div>
            <p class="text-[11px] text-slate-600 bg-slate-50 border p-1 rounded mt-1.5 italic">"${safeString(report.description) || 'No details provided.'}"</p>
          </div>
        `;

        marker.bindPopup(reportPopup);
        marker.addTo(reportsGroup);
      });
    }

  }, [dangerZones, incidentReports, selectedCategory, selectedMarker, showReports]);

  // 3. Auto-pan mapping focus when selection updates
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !selectedMarker) return;

    if (selectedMarker.type === 'zone') {
      const zone = dangerZones.find(z => z.id === selectedMarker.id);
      if (zone && isValidCoord(zone.latitude, zone.longitude)) {
        const lat = Number(zone.latitude);
        const lng = Number(zone.longitude);
        map.setView([lat, lng], 17, { animate: true });
        
        // Find existing layer to open its popup in real-time
        zonesGroupRef.current?.eachLayer((layer: any) => {
          if (layer instanceof L.Circle) {
            const center = layer.getLatLng();
            if (center && Math.abs(center.lat - lat) < 0.0001 && Math.abs(center.lng - lng) < 0.0001) {
              layer.openPopup();
            }
          }
        });
      }
    } else if (selectedMarker.type === 'report') {
      const report = incidentReports.find(r => r.id === selectedMarker.id);
      if (report && isValidCoord(report.latitude, report.longitude)) {
        const lat = Number(report.latitude);
        const lng = Number(report.longitude);
        map.setView([lat, lng], 17, { animate: true });
      }
    }
  }, [selectedMarker, dangerZones, incidentReports]);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden min-h-[380px]" id="leaflet-circle-gis-system">
      {/* Mini Info Strip */}
      <div className="bg-[#1E3A5F] text-white p-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-emerald-400 animate-spin-slow shrink-0" />
          <div>
            <h3 className="font-bold text-[11px] tracking-wider uppercase font-display text-white">Palanan Circles Safety Registry</h3>
            <p className="text-[9px] text-gray-300 font-mono">Makati PH • Circle-Based Risk Map</p>
          </div>
        </div>

        <div className="text-[9px] text-[#22C55E] bg-[#142844] px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1 border border-emerald-950">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse"></span>
          <span>ONLINE FEED</span>
        </div>
      </div>

      {/* Actual Map element */}
      <div className="flex-1 relative" style={{ minHeight: '340px' }}>
        <div ref={mapContainerRef} className="absolute inset-0 z-10 w-full h-full" id="circle-map-box" />

        {/* Floating Minimalist Legend */}
        <div className="absolute bottom-3 right-3 z-20 bg-white/95 border border-gray-200 p-2.5 rounded shadow-md text-[9px] font-sans flex flex-col space-y-1.5 pointer-events-auto w-36 backdrop-blur-xs">
          <h4 className="font-bold text-slate-800 border-b pb-1 text-[8px] tracking-wider uppercase">Circles Legend</h4>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] opacity-70 block shrink-0" />
            <span className="text-slate-700 font-medium text-[9px]">Low Risk (50m)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] opacity-70 block shrink-0" />
            <span className="text-slate-700 font-medium text-[9px]">Moderate (100m)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] opacity-70 block shrink-0" />
            <span className="text-slate-700 font-medium text-[9px]">High Risk (150m)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] opacity-70 block shrink-0" />
            <span className="text-slate-700 font-medium text-[9px]">Critical (200m)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
