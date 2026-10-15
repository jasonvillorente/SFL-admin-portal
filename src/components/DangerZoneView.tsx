import React, { useState, useEffect } from 'react';
import { DangerZone, getReportImage, getAllReportImages, resolveLocationName, safeString } from '../types';
import InteractiveMap from './InteractiveMap';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  MapPin, 
  Check, 
  X, 
  AlertTriangle, 
  RotateCcw, 
  Camera, 
  Image as ImageIcon, 
  Maximize2, 
  Upload, 
  Clock, 
  ShieldAlert, 
  Info,
  Calendar,
  Layers,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertToast from './AlertToast';
import CsvImportModal, { ImportSummaryResult } from './CsvImportModal';
import { 
  PALANAN_CENTER, 
  STUDY_AREA_BOUNDS, 
  HIGH_INCIDENT_THRESHOLD, 
  ZONE_COLOR,
  PRIVACY_DATA_HINT,
  STANDARD_CATEGORIES,
  DEFAULT_NIGHT_HOURS,
  DEFAULT_DAY_HOURS,
  DEFAULT_ALL_DAY_HOURS
} from '../utils/zoneConstants';
import { 
  isInsideStudyArea, 
  suggestActiveTime, 
  getDefaultHoursForActiveTime,
  parseCrimeTypesString,
  serializeCrimeTypes,
  deduplicateDangerZones,
  hasValidCoordinates
} from '../utils/zoneUtils';

interface DangerZoneViewProps {
  dangerZones: DangerZone[];
  initialPrefill?: Partial<DangerZone> | null;
  onClearPrefill?: () => void;
  onAddDangerZone: (zone: Omit<DangerZone, 'id'>) => Promise<void>;
  onUpdateDangerZone: (id: string, zone: Partial<DangerZone>) => Promise<void>;
  onDeleteDangerZone: (id: string) => Promise<void>;
  onBatchImport?: (
    toAdd: Omit<DangerZone, 'id'>[],
    toUpdate: { id: string; changes: Partial<DangerZone> }[],
    skippedCount: number,
    batchId?: string,
    importedAt?: string
  ) => Promise<ImportSummaryResult>;
  onUndoBatchImport?: (batchId: string) => Promise<{ deletedCount: number }>;
}

export default function DangerZoneView({
  dangerZones,
  initialPrefill,
  onClearPrefill,
  onAddDangerZone,
  onUpdateDangerZone,
  onDeleteDangerZone,
  onBatchImport,
  onUndoBatchImport
}: DangerZoneViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Strictly deduplicate zones by document ID so registry and maps render exactly one row per document
  const uniqueDangerZones = React.useMemo(() => {
    return deduplicateDangerZones(dangerZones);
  }, [dangerZones]);

  // Track recent import batches
  const availableBatches = React.useMemo(() => {
    const map = new Map<string, number>();
    uniqueDangerZones.forEach(z => {
      if (z.importBatchId) {
        map.set(z.importBatchId, (map.get(z.importBatchId) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([batchId, count]) => ({ batchId, count }));
  }, [uniqueDangerZones]);

  const latestBatch = availableBatches[availableBatches.length - 1];

  const handlePromptUndoBatch = (batchId: string, count: number) => {
    if (!onUndoBatchImport) return;
    setConfirmConfig({
      title: 'Undo Bulk CSV Import',
      message: `Permanently delete all ${count} danger zone records created in import batch "${batchId}"? This cannot be undone.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await onUndoBatchImport(batchId);
          setToastConfig({
            message: `Successfully deleted ${res.deletedCount} danger zone records from batch ${batchId}.`,
            type: 'success'
          });
        } catch (err: any) {
          setToastConfig({
            message: `Failed to undo import: ${err.message || String(err)}`,
            type: 'error'
          });
        }
        setConfirmConfig(null);
      }
    });
  };

  // Filter & Search states for the zone table
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterActiveTime, setFilterActiveTime] = useState<string>('all');
  const [filterNeedsLocationOnly, setFilterNeedsLocationOnly] = useState(false);

  // Modals & Alerts
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

  // Form states: Group 1 - Location
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(150);

  // Form states: Group 2 - Time & Crime Data
  const [noSplitMode, setNoSplitMode] = useState(false); // "No day/night split" mode
  const [nightCrimeCount, setNightCrimeCount] = useState<number>(0);
  const [dayCrimeCount, setDayCrimeCount] = useState<number>(0);
  const [directCrimeCount, setDirectCrimeCount] = useState<number>(0); // typed only when noSplitMode is true
  const [activeTime, setActiveTime] = useState<'night_only' | 'day_only' | 'all_day'>('all_day');
  const [startHour, setStartHour] = useState<number>(0);
  const [endHour, setEndHour] = useState<number>(24);
  const [dataPeriod, setDataPeriod] = useState<string>('Jan 2025 - Sep 2026');
  const [lastIncidentDate, setLastIncidentDate] = useState<string>('');
  const [crimeTypeRows, setCrimeTypeRows] = useState<{ type: string; count: number }[]>([
    { type: 'theft', count: 0 }
  ]);

  // Form states: Group 3 - Details
  const [category, setCategory] = useState<string>('Crime');
  const [source, setSource] = useState<'barangay_data' | 'resident_report' | 'both'>('barangay_data');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [sourceReportId, setSourceReportId] = useState<string | null>(null);
  const [needsLocation, setNeedsLocation] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  // Derived crime count
  const effectiveCrimeCount = noSplitMode 
    ? Math.max(0, directCrimeCount) 
    : Math.max(0, nightCrimeCount) + Math.max(0, dayCrimeCount);

  // Sync initialPrefill from incident reports
  useEffect(() => {
    if (initialPrefill) {
      setIsAdding(true);
      setEditingZoneId(null);
      if (initialPrefill.sourceReportId) setSourceReportId(initialPrefill.sourceReportId);
      if (initialPrefill.locationName) setLocationName(initialPrefill.locationName);
      if (initialPrefill.latitude !== undefined && initialPrefill.latitude !== null) {
        setLatitude(Number(initialPrefill.latitude));
      }
      if (initialPrefill.longitude !== undefined && initialPrefill.longitude !== null) {
        setLongitude(Number(initialPrefill.longitude));
      }
      if (initialPrefill.category) setCategory(initialPrefill.category);
      if (initialPrefill.radius) setRadius(Number(initialPrefill.radius));
      if (initialPrefill.description) setDescription(initialPrefill.description);
      const img = initialPrefill.imageUrl || initialPrefill.photoUrl || (initialPrefill.photos && initialPrefill.photos[0]);
      if (img) setImageUrl(img);

      // Requirement 2: Quick-convert from resident reports: crimeCount 0, no dataPeriod (not 1)
      setSource('resident_report');
      setNightCrimeCount(0);
      setDayCrimeCount(0);
      setDirectCrimeCount(0);
      setNoSplitMode(false);
      setActiveTime('all_day');
      setStartHour(0);
      setEndHour(24);
      setDataPeriod(''); // No dataPeriod for quick-converts
      setCrimeTypeRows([]);
    }
  }, [initialPrefill]);

  // Auto-suggest activeTime when in split mode and total incidents >= 3
  const handleCountsChange = (n: number, d: number) => {
    const validN = Math.max(0, Math.floor(n || 0));
    const validD = Math.max(0, Math.floor(d || 0));
    setNightCrimeCount(validN);
    setDayCrimeCount(validD);

    const suggested = suggestActiveTime(validN, validD);
    if (suggested) {
      setActiveTime(suggested);
      const hrs = getDefaultHoursForActiveTime(suggested);
      setStartHour(hrs.startHour);
      setEndHour(hrs.endHour);
    }
  };

  const handleActiveTimeChange = (newActiveTime: 'night_only' | 'day_only' | 'all_day') => {
    setActiveTime(newActiveTime);
    const hrs = getDefaultHoursForActiveTime(newActiveTime);
    setStartHour(hrs.startHour);
    setEndHour(hrs.endHour);
  };

  const handleToggleNoSplit = (enabled: boolean) => {
    setNoSplitMode(enabled);
    if (enabled) {
      // Lock activeTime to all_day, night/day to 0
      setActiveTime('all_day');
      setStartHour(0);
      setEndHour(24);
      setNightCrimeCount(0);
      setDayCrimeCount(0);
      if (directCrimeCount === 0 && (nightCrimeCount > 0 || dayCrimeCount > 0)) {
        setDirectCrimeCount(nightCrimeCount + dayCrimeCount);
      }
    } else {
      // Return to split mode
      setDirectCrimeCount(0);
      const suggested = suggestActiveTime(nightCrimeCount, dayCrimeCount);
      const chosen = suggested || 'all_day';
      setActiveTime(chosen);
      const hrs = getDefaultHoursForActiveTime(chosen);
      setStartHour(hrs.startHour);
      setEndHour(hrs.endHour);
    }
  };

  const resetForm = (keepStickyFields = false) => {
    setLocationName('');
    setLatitude(null);
    setLongitude(null);
    setRadius(150);
    setDescription('');
    setImageUrl('');
    setStatus('active');
    setSourceReportId(null);
    setNeedsLocation(false);
    setNightCrimeCount(0);
    setDayCrimeCount(0);
    setDirectCrimeCount(0);
    setNoSplitMode(false);
    setActiveTime('all_day');
    setStartHour(0);
    setEndHour(24);
    setLastIncidentDate('');
    setCrimeTypeRows([{ type: 'theft', count: 0 }]);
    setCategory('Crime');
    setFormError(null);

    if (!keepStickyFields) {
      setSource('barangay_data');
      setDataPeriod('Jan 2025 - Sep 2026');
      onClearPrefill?.();
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    setNeedsLocation(false);
    setFormError(null);
  };

  const handleMarkerDrag = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    setNeedsLocation(false);
  };

  const handleRadiusChange = (val: number) => {
    const freshVal = Math.max(10, Math.min(1000, val));
    setRadius(freshVal);
  };

  const startEdit = (zone: DangerZone) => {
    setEditingZoneId(zone.id);
    setIsAdding(false);
    setLocationName(zone.locationName);
    setLatitude(zone.latitude !== undefined && zone.latitude !== null && !isNaN(Number(zone.latitude)) ? Number(zone.latitude) : null);
    setLongitude(zone.longitude !== undefined && zone.longitude !== null && !isNaN(Number(zone.longitude)) ? Number(zone.longitude) : null);
    setCategory(zone.category || 'Crime');
    setRadius(zone.radius || 150);
    setDescription(zone.description || '');
    const img = zone.imageUrl || zone.photoUrl || (zone.photos && zone.photos[0]) || '';
    setImageUrl(img);
    setStatus(zone.status === 'inactive' ? 'inactive' : 'active');
    setSource(zone.source || 'barangay_data');
    setNeedsLocation(zone.needsLocation === true);

    const hasNight = zone.nightCrimeCount !== undefined && zone.nightCrimeCount !== null;
    const hasDay = zone.dayCrimeCount !== undefined && zone.dayCrimeCount !== null;

    if (!hasNight && !hasDay && zone.crimeCount !== undefined) {
      setNoSplitMode(true);
      setDirectCrimeCount(zone.crimeCount);
      setNightCrimeCount(0);
      setDayCrimeCount(0);
      setActiveTime('all_day');
    } else {
      setNoSplitMode(false);
      setNightCrimeCount(Number(zone.nightCrimeCount) || 0);
      setDayCrimeCount(Number(zone.dayCrimeCount) || 0);
      setDirectCrimeCount(0);
      setActiveTime(zone.activeTime || 'all_day');
    }

    setStartHour(zone.startHour !== undefined ? zone.startHour : (zone.activeTime === 'night_only' ? 18 : (zone.activeTime === 'day_only' ? 5 : 0)));
    setEndHour(zone.endHour !== undefined ? zone.endHour : (zone.activeTime === 'night_only' ? 5 : (zone.activeTime === 'day_only' ? 18 : 24)));
    setDataPeriod(zone.dataPeriod || '');
    setLastIncidentDate(zone.lastIncidentDate || '');

    // Crime types map
    if (zone.crimeTypes && Object.keys(zone.crimeTypes).length > 0) {
      setCrimeTypeRows(
        Object.entries(zone.crimeTypes).map(([type, count]) => ({ type, count }))
      );
    } else {
      setCrimeTypeRows([]);
    }

    setFormError(null);
  };

  const cancelAction = () => {
    setIsAdding(false);
    setEditingZoneId(null);
    resetForm(false);
  };

  // Add / Remove Crime Type pairs
  const handleAddCrimeTypeRow = () => {
    setCrimeTypeRows(prev => [...prev, { type: '', count: 1 }]);
  };

  const handleRemoveCrimeTypeRow = (idx: number) => {
    setCrimeTypeRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateCrimeTypeRow = (idx: number, field: 'type' | 'count', val: any) => {
    setCrimeTypeRows(prev => {
      const next = [...prev];
      if (field === 'type') next[idx].type = val;
      if (field === 'count') next[idx].count = Math.max(0, parseInt(val, 10) || 0);
      return next;
    });
  };

  const validateAndBuildPayload = (): Omit<DangerZone, 'id'> | null => {
    // 1. Name required
    if (!locationName.trim()) {
      setFormError('Location Name is required.');
      return null;
    }

    // 2. Coordinates validation
    if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
      setFormError('Please select coordinates on the map or enter valid Latitude and Longitude.');
      return null;
    }

    if (!isInsideStudyArea(latitude, longitude)) {
      setFormError(
        `Coordinates (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) fall outside Barangay Palanan study area [Lat ${STUDY_AREA_BOUNDS.minLat} - ${STUDY_AREA_BOUNDS.maxLat}, Lng ${STUDY_AREA_BOUNDS.minLng} - ${STUDY_AREA_BOUNDS.maxLng}].`
      );
      return null;
    }

    // 3. Radius > 0
    if (!radius || radius <= 0) {
      setFormError('Radius must be a positive number greater than 0.');
      return null;
    }

    // 4. Counts validation (non-negative whole numbers)
    if (noSplitMode) {
      if (directCrimeCount < 0 || isNaN(directCrimeCount)) {
        setFormError('Total crime count must be a non-negative whole number (0 or higher).');
        return null;
      }
    } else {
      if (nightCrimeCount < 0 || isNaN(nightCrimeCount) || dayCrimeCount < 0 || isNaN(dayCrimeCount)) {
        setFormError('Night and Day crime counts must be non-negative whole numbers.');
        return null;
      }
    }

    // Crime types dictionary
    const crimeTypesDict: Record<string, number> = {};
    crimeTypeRows.forEach(r => {
      const trimmed = r.type.trim().toLowerCase();
      if (trimmed && r.count > 0) {
        crimeTypesDict[trimmed] = (crimeTypesDict[trimmed] || 0) + r.count;
      }
    });

    const payload: Omit<DangerZone, 'id'> = {
      zoneId: editingZoneId || '',
      sourceReportId: sourceReportId || undefined,
      locationName: locationName.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      radius: Number(radius),
      category,
      source,
      activeTime,
      startHour: Number(startHour),
      endHour: Number(endHour),
      nightCrimeCount: noSplitMode ? 0 : Math.max(0, Math.floor(nightCrimeCount)),
      dayCrimeCount: noSplitMode ? 0 : Math.max(0, Math.floor(dayCrimeCount)),
      crimeCount: effectiveCrimeCount,
      crimeTypes: crimeTypesDict,
      dataPeriod: dataPeriod.trim() || undefined,
      lastIncidentDate: lastIncidentDate.trim() || undefined,
      description: description.trim(),
      imageUrl: imageUrl.trim() || undefined,
      photoUrl: imageUrl.trim() || undefined,
      photos: imageUrl.trim() ? [imageUrl.trim()] : [],
      status,
      active: status === 'active',
      needsLocation: false, // Valid coordinates verified
      updatedAt: new Date().toISOString()
    };

    return payload;
  };

  const handleSave = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    setFormError(null);

    const payload = validateAndBuildPayload();
    if (!payload) return;

    try {
      if (editingZoneId) {
        await onUpdateDangerZone(editingZoneId, payload);
        setToastConfig({ message: `Danger zone "${payload.locationName}" successfully updated.`, type: 'success' });
      } else {
        await onAddDangerZone(payload);
        setToastConfig({ message: `Danger zone "${payload.locationName}" successfully registered.`, type: 'success' });
      }

      if (addAnother) {
        // "Save and add another" keeps dataPeriod and source
        const savedPeriod = dataPeriod;
        const savedSource = source;
        resetForm(true);
        setDataPeriod(savedPeriod);
        setSource(savedSource);
        setIsAdding(true);
        setEditingZoneId(null);
      } else {
        cancelAction();
      }
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving danger zone.');
    }
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      title: "Delete Danger Zone",
      message: `Permanently delete "${name}"? This removes the geofence alert from all resident maps immediately.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await onDeleteDangerZone(id);
          setToastConfig({ message: "Danger zone has been permanently deleted.", type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to delete danger zone: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const toggleStatus = (zone: DangerZone) => {
    // Requirement 5: Block activation for "Needs Location" rows until valid coordinates exist
    if (zone.needsLocation === true) {
      setToastConfig({
        message: 'Activation blocked: This zone needs valid coordinates inside Barangay Palanan before it can be activated.',
        type: 'error'
      });
      return;
    }

    const nextStatus = zone.status === 'active' ? 'inactive' : 'active';
    const confirmMsg = nextStatus === 'inactive' 
      ? `Deactivate and suspend warnings for "${zone.locationName}"? Residents will no longer see warnings.`
      : `Re-activate warning geofence for "${zone.locationName}"? All residents will immediately receive alerts.`;

    setConfirmConfig({
      title: nextStatus === 'inactive' ? "Deactivate Danger Zone" : "Activate Danger Zone",
      message: confirmMsg,
      isDestructive: nextStatus === 'inactive',
      onConfirm: async () => {
        try {
          await onUpdateDangerZone(zone.id, { status: nextStatus });
          setToastConfig({ message: `Zone operational status set to ${nextStatus.toUpperCase()}.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to toggle status: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  // Filtered table rows - derived strictly from deduplicated zones
  const filteredZones = uniqueDangerZones.filter(zone => {
    if (filterNeedsLocationOnly && !zone.needsLocation) return false;
    if (filterCategory !== 'all' && zone.category !== filterCategory) return false;
    if (filterSource !== 'all' && zone.source !== filterSource) return false;
    if (filterActiveTime !== 'all' && zone.activeTime !== filterActiveTime) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const loc = (zone.locationName || '').toLowerCase();
      const desc = (zone.description || '').toLowerCase();
      if (!loc.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" id="danger-zones-view-root">
      
      {/* Toast and Confirmation modals */}
      {toastConfig && (
        <AlertToast 
          isOpen={!!toastConfig}
          message={toastConfig.message} 
          type={toastConfig.type} 
          onClose={() => setToastConfig(null)} 
        />
      )}

      {confirmConfig && (
        <ConfirmDialog
          isOpen={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          isDestructive={confirmConfig.isDestructive}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)}
        />
      )}

      {/* CSV Import Modal */}
      {isCsvModalOpen && onBatchImport && (
        <CsvImportModal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          existingZones={uniqueDangerZones}
          onExecuteImport={async (toAdd, toUpdate, skippedCount, batchId, importedAt) => {
            const res = await onBatchImport(toAdd, toUpdate, skippedCount, batchId, importedAt);
            return res;
          }}
          onUndoImport={onUndoBatchImport}
        />
      )}

      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">Danger Zone Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Barangay Palanan crime incidence geofencing, temporal schedules, and rapid bulk import.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onUndoBatchImport && latestBatch && (
            <button
              onClick={() => handlePromptUndoBatch(latestBatch.batchId, latestBatch.count)}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-xs font-semibold rounded shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer"
              title={`Undo import batch ${latestBatch.batchId} (${latestBatch.count} zones)`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>Undo Last Import ({latestBatch.count})</span>
            </button>
          )}

          {onBatchImport && (
            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-slate-600" />
              <span>Import CSV</span>
            </button>
          )}

          {!isAdding && !editingZoneId && (
            <button
              onClick={() => { setIsAdding(true); resetForm(false); }}
              className="px-4 py-2 bg-[#1E3A5F] hover:bg-[#132844] text-white text-xs font-semibold rounded shadow-sm transition-colors flex items-center space-x-1.5 uppercase tracking-wide cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Danger Zone</span>
            </button>
          )}
        </div>
      </div>

      {/* Data Privacy Hint Reminder */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-md p-3 flex items-start space-x-2.5">
        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900">
          <span className="font-bold">Fast Data Entry Protocol: </span>
          {PRIVACY_DATA_HINT}
        </div>
      </div>

      {/* Interactive Geofence Editor & Form */}
      {(isAdding || editingZoneId) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="geofence-interactive-editor">
          
          {/* Map picker pane (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-3 bg-white border border-gray-200 rounded p-4 shadow-sm min-h-[500px]">
            <div className="flex items-center justify-between border-b pb-2.5 border-slate-100">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-[#1E3A5F]" />
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Map Location Picker</h4>
              </div>
              <div className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold">
                Barangay Palanan
              </div>
            </div>

            <div className="flex-1 relative rounded border border-gray-200 overflow-hidden shadow-inner min-h-[320px]">
              <InteractiveMap
                dangerZones={dangerZones.filter(z => z.id !== editingZoneId)}
                incidentReports={[]}
                selectedCategory="all"
                onMapClick={handleMapClick}
                onMarkerDrag={handleMarkerDrag}
                showReports={false}
                isCreating={true}
                createLat={latitude}
                createLng={longitude}
                createRadius={radius}
                createColor={ZONE_COLOR}
              />
            </div>
            
            {latitude !== null && longitude !== null ? (
              <div className="p-2.5 bg-blue-50/70 rounded border border-blue-200 flex items-center justify-between text-[11px] text-slate-700 font-mono">
                <span className="font-bold uppercase tracking-wider text-[9px] text-[#1E3A5F]">Captured Pinpoint:</span>
                <span>LAT: {latitude.toFixed(6)} | LNG: {longitude.toFixed(6)}</span>
              </div>
            ) : (
              <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-center text-xs text-amber-800 animate-pulse font-medium">
                ⚠️ Click on the map to set the center point or type coordinates below
              </div>
            )}
          </div>

          {/* Form Pane (7 Cols) - Grouped Fields */}
          <div className="lg:col-span-7 bg-white border border-gray-200 rounded p-5 shadow-sm space-y-5">
            
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h4 className="font-bold text-sm text-slate-900 font-display">
                {editingZoneId ? 'Amend Danger Zone Record' : 'Rapid Danger Zone Entry'}
              </h4>
              <span className="text-[11px] text-gray-500 font-sans">
                {noSplitMode ? '⚡ Total Count Mode' : '🌓 Split Day/Night Mode'}
              </span>
            </div>

            {formError && (
              <div className="p-3 border border-red-200 bg-red-50 text-xs text-red-700 rounded font-medium flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={(e) => handleSave(e, false)} className="space-y-6">

              {/* Group 1: Location */}
              <div className="space-y-3 bg-slate-50/70 p-3.5 rounded border border-slate-200">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wide">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>1. Location Details</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Location Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dian Street corner Buendia Avenue"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Latitude ({STUDY_AREA_BOUNDS.minLat} - {STUDY_AREA_BOUNDS.maxLat}) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      placeholder="14.558500"
                      value={latitude !== null ? latitude : ''}
                      onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-[#1E3A5F]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Longitude ({STUDY_AREA_BOUNDS.minLng} - {STUDY_AREA_BOUNDS.maxLng}) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      placeholder="121.002000"
                      value={longitude !== null ? longitude : ''}
                      onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-[#1E3A5F]"
                    />
                  </div>
                </div>

                {/* Radius Tool with Live Circle sync */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <span>Radius (Meters) <span className="text-red-500">*</span></span>
                    <span className="font-mono text-[#1E3A5F] bg-blue-50 px-2 py-0.5 rounded font-bold">{radius} m</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="5"
                      value={radius}
                      onChange={(e) => handleRadiusChange(Number(e.target.value))}
                      className="flex-1 accent-[#1E3A5F] h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={radius}
                      onChange={(e) => handleRadiusChange(Number(e.target.value))}
                      className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-center font-mono font-bold"
                    />
                  </div>

                  {/* Quick preset buttons */}
                  <div className="flex items-center space-x-1 mt-1.5">
                    <span className="text-[9px] text-gray-400 font-bold uppercase">Presets:</span>
                    {[50, 100, 150, 200, 300].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleRadiusChange(r)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          radius === r 
                            ? 'bg-[#1E3A5F] text-white border-[#1E3A5F] font-bold' 
                            : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Group 2: Time & Crime Data */}
              <div className="space-y-3.5 bg-slate-50/70 p-3.5 rounded border border-slate-200">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 uppercase tracking-wide">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>2. Time & Crime Data</span>
                  </div>

                  {/* "No day/night split" mode toggle */}
                  <label className="flex items-center space-x-1.5 cursor-pointer normal-case text-slate-700 text-xs">
                    <input
                      type="checkbox"
                      checked={noSplitMode}
                      onChange={(e) => handleToggleNoSplit(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-800 text-[11px]">No day/night split</span>
                  </label>
                </div>

                {/* Counts Inputs */}
                {noSplitMode ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Total Crime Count (All Day) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={directCrimeCount}
                      onChange={(e) => setDirectCrimeCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-[#1E3A5F]"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Active hours are locked to All Day in this mode.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Night Crimes
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={nightCrimeCount}
                        onChange={(e) => handleCountsChange(Number(e.target.value), dayCrimeCount)}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Day Crimes
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={dayCrimeCount}
                        onChange={(e) => handleCountsChange(nightCrimeCount, Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Total Crimes (Auto)
                      </label>
                      <div className="bg-slate-200 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 flex items-center justify-between">
                        <span>{effectiveCrimeCount}</span>
                        {effectiveCrimeCount >= HIGH_INCIDENT_THRESHOLD && (
                          <span className="text-[9px] bg-neutral-800 text-neutral-200 border border-neutral-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            High (≥{HIGH_INCIDENT_THRESHOLD})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Time & Operating Hours */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Active Time
                    </label>
                    <select
                      disabled={noSplitMode}
                      value={activeTime}
                      onChange={(e) => handleActiveTimeChange(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F] disabled:bg-slate-100 disabled:text-gray-400 font-medium"
                    >
                      <option value="all_day">All Day (24 hrs)</option>
                      <option value="night_only">Night Only (18:00 - 5:00)</option>
                      <option value="day_only">Day Only (5:00 - 18:00)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Start Hour (0-23)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={startHour}
                      onChange={(e) => setStartHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      End Hour (0-23)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={endHour}
                      onChange={(e) => setEndHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>

                {/* Data Period & Last Incident Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Data Period
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Jan 2025 - Sep 2026"
                      value={dataPeriod}
                      onChange={(e) => setDataPeriod(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Last Incident Date
                    </label>
                    <input
                      type="date"
                      value={lastIncidentDate}
                      onChange={(e) => setLastIncidentDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                </div>

                {/* Crime Types dynamic pairs */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Crime Types Breakdown
                    </label>
                    <button
                      type="button"
                      onClick={handleAddCrimeTypeRow}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Crime Type</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {crimeTypeRows.length === 0 ? (
                      <div className="text-[11px] text-gray-400 italic bg-white p-2 rounded border border-dashed border-gray-200 text-center">
                        No crime types specified. Click "Add Crime Type" to specify breakdown (e.g. theft: 3, snatching: 2).
                      </div>
                    ) : (
                      crimeTypeRows.map((row, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <input
                            type="text"
                            placeholder="Type (e.g. theft, robbery, assault)"
                            value={row.type}
                            onChange={(e) => handleUpdateCrimeTypeRow(idx, 'type', e.target.value)}
                            className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800"
                          />
                          <input
                            type="number"
                            min="0"
                            placeholder="Count"
                            value={row.count}
                            onChange={(e) => handleUpdateCrimeTypeRow(idx, 'count', e.target.value)}
                            className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-center font-mono font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveCrimeTypeRow(idx)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded"
                            title="Remove type"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Group 3: Details */}
              <div className="space-y-3 bg-slate-50/70 p-3.5 rounded border border-slate-200">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wide">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>3. Classification & Remarks</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Hazard Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F]"
                    >
                      {STANDARD_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {!STANDARD_CATEGORIES.includes(category as any) && (
                        <option value={category}>{category}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Data Origin Source
                    </label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F]"
                    >
                      <option value="barangay_data">Barangay Official Data</option>
                      <option value="resident_report">Resident Report</option>
                      <option value="both">Both (Corroborated)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Advisory Description
                  </label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    placeholder="Short safety summary or preventative guidelines..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Evidence Image URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={cancelAction}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>

                <div className="flex items-center space-x-2">
                  {!editingZoneId && (
                    <button
                      type="button"
                      onClick={(e) => handleSave(e, true)}
                      className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs font-semibold cursor-pointer"
                      title="Saves this record and immediately prepares form for next entry with same Period and Source"
                    >
                      Save and Add Another
                    </button>
                  )}

                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#1E3A5F] hover:bg-[#132844] text-white rounded text-xs font-bold uppercase transition-colors shadow-sm flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingZoneId ? 'Save Amendments' : 'Publish Zone'}</span>
                  </button>
                </div>
              </div>

            </form>

          </div>

        </div>
      )}

      {/* Main Danger Zones Listings Registry */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden" id="danger-zones-registry-list">
        
        {/* Table Header & Search Filter Bar */}
        <div className="p-4 border-b border-gray-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-[#1E3A5F]" />
            <h3 className="font-bold text-xs tracking-wider uppercase font-display text-slate-900">
              Barangay Palanan Danger Zones Registry
            </h3>
            <span className="bg-slate-200 text-slate-700 font-mono text-[10px] px-2 py-0.5 rounded font-bold">
              {filteredZones.length} / {uniqueDangerZones.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <input
              type="text"
              placeholder="Filter by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 w-36 focus:outline-[#1E3A5F]"
            />

            {/* Category filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700"
            >
              <option value="all">All Categories</option>
              {STANDARD_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Source filter */}
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700"
            >
              <option value="all">All Sources</option>
              <option value="barangay_data">Barangay Data</option>
              <option value="resident_report">Resident Report</option>
              <option value="both">Both</option>
            </select>

            {/* Active Time filter */}
            <select
              value={filterActiveTime}
              onChange={(e) => setFilterActiveTime(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700"
            >
              <option value="all">All Time Windows</option>
              <option value="night_only">Night Only</option>
              <option value="day_only">Day Only</option>
              <option value="all_day">All Day</option>
            </select>

            {/* Needs Location toggle */}
            <button
              type="button"
              onClick={() => setFilterNeedsLocationOnly(!filterNeedsLocationOnly)}
              className={`px-2 py-1 rounded text-xs font-semibold border ${
                filterNeedsLocationOnly
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Needs Location
            </button>
          </div>
        </div>

        {/* Table Body */}
        {filteredZones.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400">
            <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            No danger zones match current filters.
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="bg-slate-100 border-b border-gray-200 text-slate-600 uppercase tracking-widest font-bold text-[9px]">
                  <th className="py-3 px-4">Location Target</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Crimes Recorded</th>
                  <th className="py-3 px-4">Active Schedule</th>
                  <th className="py-3 px-4">Data Source</th>
                  <th className="py-3 px-4">Radius & Geo</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-slate-700">
                {filteredZones.map((zone) => {
                  const crimes = zone.crimeCount ?? ((zone.nightCrimeCount ?? 0) + (zone.dayCrimeCount ?? 0));
                  const isHighIncident = crimes >= HIGH_INCIDENT_THRESHOLD;
                  const zoneImg = getReportImage(zone);
                  const isNeedsLoc = zone.needsLocation === true;

                  return (
                    <tr key={zone.id} className={`hover:bg-slate-50/80 ${isNeedsLoc ? 'bg-amber-50/30' : ''}`}>
                      
                      {/* Location Target */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center space-x-2">
                          <span 
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isNeedsLoc || zone.status === 'inactive'
                                ? 'border border-dashed border-[#EA580C] bg-[#EA580C]/25 opacity-70'
                                : 'bg-[#EA580C]'
                            }`}
                            title={isNeedsLoc ? 'Needs Location (Unmapped)' : zone.status === 'inactive' ? 'Inactive Zone' : 'Active Zone'}
                          />
                          <span>{resolveLocationName(zone)}</span>
                          {isNeedsLoc && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                              Needs Location
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5 ml-4.5">
                          {safeString(zone.description) || 'No safety remarks registered.'}
                        </p>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {zone.category}
                      </td>

                      {/* Crimes Recorded */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold font-mono text-xs text-slate-900">
                            {crimes}
                          </span>
                          {isHighIncident && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 font-bold uppercase tracking-wider">
                              High Incident
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          N: {zone.nightCrimeCount ?? 0} | D: {zone.dayCrimeCount ?? 0}
                        </div>
                      </td>

                      {/* Active Schedule */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 block text-[11px]">
                          {zone.activeTime === 'night_only' ? 'Night Only' : zone.activeTime === 'day_only' ? 'Day Only' : 'All Day'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {zone.activeTime === 'all_day' 
                            ? 'All Day (24 hrs)' 
                            : `${zone.startHour ?? (zone.activeTime === 'night_only' ? 18 : 5)}:00 - ${zone.endHour ?? (zone.activeTime === 'night_only' ? 5 : 18)}:00`}
                        </span>
                      </td>

                      {/* Data Source */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {zone.source === 'barangay_data' ? 'Barangay' : zone.source === 'resident_report' ? 'Resident' : 'Both'}
                        </span>
                        {zone.dataPeriod && (
                          <div className="text-[9px] text-gray-400 mt-0.5 truncate max-w-[120px]">
                            {zone.dataPeriod}
                          </div>
                        )}
                      </td>

                      {/* Radius & Geo */}
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                        <div>{zone.radius}m zone</div>
                        {isNeedsLoc ? (
                          <span className="text-amber-700 font-semibold italic">Unmapped</span>
                        ) : (
                          <div>
                            {typeof zone.latitude === 'number' && !isNaN(zone.latitude) ? zone.latitude.toFixed(4) : 'N/A'}, 
                            {typeof zone.longitude === 'number' && !isNaN(zone.longitude) ? zone.longitude.toFixed(4) : 'N/A'}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleStatus(zone)}
                          className={`inline-flex items-center space-x-1 font-bold text-[11px] ${
                            isNeedsLoc 
                              ? 'text-amber-600 cursor-not-allowed opacity-80'
                              : zone.status === 'active' 
                              ? 'text-emerald-600 hover:text-emerald-700 cursor-pointer' 
                              : 'text-slate-400 hover:text-slate-500 cursor-pointer'
                          }`}
                          title={isNeedsLoc ? 'Activation blocked until coordinates are set' : 'Toggle online publication'}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isNeedsLoc ? 'bg-amber-400' : zone.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          <span>{isNeedsLoc ? 'NEEDS COORDS' : zone.status === 'active' ? 'ONLINE' : 'OFFLINE'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5 text-xs">
                          {isNeedsLoc && (
                            <button
                              onClick={() => startEdit(zone)}
                              className="p-1 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded font-semibold flex items-center space-x-1 cursor-pointer"
                              title="Set Location Pinpoint"
                            >
                              <MapPin className="w-3 h-3 text-amber-600" />
                              <span>Set Pinpoint</span>
                            </button>
                          )}

                          <button
                            onClick={() => startEdit(zone)}
                            className="p-1 px-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded font-semibold flex items-center space-x-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            onClick={() => handleDelete(zone.id, zone.locationName)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            title="Delete Zone"
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

    </div>
  );
}
