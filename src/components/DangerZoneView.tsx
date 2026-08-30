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
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Camera,
  Image as ImageIcon,
  Maximize2,
  ExternalLink,
  Upload
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertToast from './AlertToast';

interface DangerZoneViewProps {
  dangerZones: DangerZone[];
  initialPrefill?: Partial<DangerZone> | null;
  onClearPrefill?: () => void;
  onAddDangerZone: (zone: Omit<DangerZone, 'id'>) => Promise<void>;
  onUpdateDangerZone: (id: string, zone: Partial<DangerZone>) => Promise<void>;
  onDeleteDangerZone: (id: string) => Promise<void>;
}

const CATEGORIES = [
  'Crime',
  'Poor Lighting',
  'Flood Risk',
  'Accident-Prone Area',
  'Construction Area',
  'Suspicious Activity'
] as const;

const RISK_LEVELS = ['Low', 'Moderate', 'High', 'Critical'] as const;

// Internal mappings for color representation
const DANGER_LEVEL_COLORS: Record<'Low' | 'Moderate' | 'High' | 'Critical', { hex: string; name: string; bgClass: string; borderClass: string; textClass: string }> = {
  Low: {
    hex: '#10B981',
    name: 'Green',
    bgClass: 'bg-emerald-50 text-emerald-700',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-600'
  },
  Moderate: {
    hex: '#F59E0B',
    name: 'Yellow',
    bgClass: 'bg-amber-50 text-amber-700',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-600'
  },
  High: {
    hex: '#F97316',
    name: 'Orange',
    bgClass: 'bg-orange-50 text-orange-700',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-600'
  },
  Critical: {
    hex: '#EF4444',
    name: 'Red',
    bgClass: 'bg-rose-50 text-rose-700',
    borderClass: 'border-rose-200',
    textClass: 'text-rose-600'
  }
};

export default function DangerZoneView({
  dangerZones,
  initialPrefill,
  onClearPrefill,
  onAddDangerZone,
  onUpdateDangerZone,
  onDeleteDangerZone
}: DangerZoneViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Custom modal and toast states
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

  // Form states
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('Crime');
  const [riskLevel, setRiskLevel] = useState<typeof RISK_LEVELS[number]>('Moderate');
  const [radius, setRadius] = useState<number>(150);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const [formError, setFormError] = useState<string | null>(null);

  // React to initialPrefill from incident reports
  useEffect(() => {
    if (initialPrefill) {
      setIsAdding(true);
      setEditingZoneId(null);
      if (initialPrefill.locationName) setLocationName(initialPrefill.locationName);
      if (initialPrefill.latitude !== undefined && initialPrefill.latitude !== null) {
        setLatitude(Number(initialPrefill.latitude));
      }
      if (initialPrefill.longitude !== undefined && initialPrefill.longitude !== null) {
        setLongitude(Number(initialPrefill.longitude));
      }
      if (initialPrefill.category && CATEGORIES.includes(initialPrefill.category as any)) {
        setCategory(initialPrefill.category as any);
      }
      if (initialPrefill.riskLevel && RISK_LEVELS.includes(initialPrefill.riskLevel as any)) {
        setRiskLevel(initialPrefill.riskLevel as any);
      }
      if (initialPrefill.radius) setRadius(Number(initialPrefill.radius));
      if (initialPrefill.description) setDescription(initialPrefill.description);
      const img = initialPrefill.imageUrl || initialPrefill.photoUrl || (initialPrefill.photos && initialPrefill.photos[0]);
      if (img) setImageUrl(img);
    }
  }, [initialPrefill]);

  const resetForm = () => {
    setLocationName('');
    setLatitude(null);
    setLongitude(null);
    setCategory('Crime');
    setRiskLevel('Moderate');
    setRadius(150);
    setDescription('');
    setImageUrl('');
    setStatus('active');
    setFormError(null);
    onClearPrefill?.();
  };

  const handleMapClick = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    setFormError(null);
  };

  const handleMarkerDrag = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const startEdit = (zone: DangerZone) => {
    setEditingZoneId(zone.id);
    setIsAdding(false);
    setLocationName(zone.locationName);
    setLatitude(zone.latitude !== undefined && zone.latitude !== null && !isNaN(Number(zone.latitude)) ? Number(zone.latitude) : null);
    setLongitude(zone.longitude !== undefined && zone.longitude !== null && !isNaN(Number(zone.longitude)) ? Number(zone.longitude) : null);
    setCategory(zone.category as any);
    
    // Normalize risk level from incoming database format
    let legacyLevel: typeof RISK_LEVELS[number] = 'Moderate';
    const rawLevel = String(zone.riskLevel).toLowerCase();
    if (rawLevel === 'low') legacyLevel = 'Low';
    else if (rawLevel === 'moderate' || rawLevel === 'medium') legacyLevel = 'Moderate';
    else if (rawLevel === 'high') legacyLevel = 'High';
    else if (rawLevel === 'critical') legacyLevel = 'Critical';

    setRiskLevel(legacyLevel);
    setRadius(zone.radius || 150);
    setDescription(zone.description || '');
    const img = zone.imageUrl || zone.photoUrl || (zone.photos && zone.photos[0]) || '';
    setImageUrl(img);
    setStatus(zone.status);
    setFormError(null);
  };

  const cancelAction = () => {
    setIsAdding(false);
    setEditingZoneId(null);
    resetForm();
  };

  const handleRadiusChange = (val: number) => {
    const freshVal = Math.max(10, Math.min(1000, val));
    setRadius(freshVal);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) {
      setFormError('Please yield a descriptive Location Name.');
      return;
    }
    if (latitude === null || longitude === null) {
      setFormError('Please select or drag a geocentric location directly on the map first.');
      return;
    }

    const colorConfig = DANGER_LEVEL_COLORS[riskLevel];

    const payload: Omit<DangerZone, 'id'> = {
      zoneId: editingZoneId || '',
      locationName: locationName.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      category,
      riskLevel,
      description: description.trim(),
      radius: Number(radius),
      color: colorConfig.name, // "Green", "Orange", "Red"
      imageUrl: imageUrl.trim() || undefined,
      photoUrl: imageUrl.trim() || undefined,
      photos: imageUrl.trim() ? [imageUrl.trim()] : [],
      createdAt: new Date().toISOString(),
      createdBy: '', // Filled in server or app wrapper session
      status
    };

    try {
      if (editingZoneId) {
        // Exclude original fields that shouldn't be overridden if undefined
        const { createdAt, ...updatePayload } = payload as any;
        await onUpdateDangerZone(editingZoneId, updatePayload);
      } else {
        await onAddDangerZone(payload);
      }
      cancelAction();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving danger zone.');
    }
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      title: "Delete Danger Zone",
      message: `Are you sure you want to permanently delete the "${name}" danger zone? This will immediately remove it from all resident maps.`,
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
    const nextStatus = zone.status === 'active' ? 'inactive' : 'active';
    const confirmMsg = nextStatus === 'inactive' 
      ? `Deactivate and suspend danger zone warnings for "${zone.locationName}"? Residents will no longer see warnings on this zone.`
      : `Re-activate danger zone warning geofence for "${zone.locationName}"? All residents will immediately receive alerts.`;

    setConfirmConfig({
      title: nextStatus === 'inactive' ? "Deactivate Danger Zone" : "Activate Danger Zone",
      message: confirmMsg,
      isDestructive: nextStatus === 'inactive',
      onConfirm: async () => {
        try {
          await onUpdateDangerZone(zone.id, { status: nextStatus });
          setToastConfig({ message: `Zone operational status successfully set to ${nextStatus.toUpperCase()}.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to toggle status: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  // Helper styles for tables
  const getRiskColorClass = (level: string) => {
    const norm = String(level).toUpperCase();
    if (norm === 'LOW' || norm === 'LOW RISK' || norm === 'LOW_RISK') {
      return 'text-emerald-700 bg-emerald-50 border border-emerald-200';
    }
    if (norm === 'MEDIUM' || norm === 'MODERATE' || norm === 'MEDIUM RISK' || norm === 'MEDIUM_RISK') {
      return 'text-orange-700 bg-orange-50 border border-orange-200';
    }
    return 'text-rose-700 bg-rose-50 border border-rose-200';
  };

  const selectedColorHex = DANGER_LEVEL_COLORS[riskLevel].hex;

  return (
    <div className="space-y-6" id="danger-zones-view-root">
      {/* View Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">Danger Zone Management</h2>
          <p className="text-xs text-gray-400 mt-0.5">Define, edit, and project circular geofenced zones to warning maps of mobile clients in real-time.</p>
        </div>
        {!isAdding && !editingZoneId && (
          <button
            onClick={() => { setIsAdding(true); resetForm(); }}
            className="px-4 py-2 bg-[#1E3A5F] hover:bg-[#132844] text-white text-xs font-semibold rounded shadow-sm transition-colors flex items-center space-x-1.5 uppercase tracking-wide shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Danger Zone</span>
          </button>
        )}
      </div>

      {/* Interactive Geofence Editor */}
      {(isAdding || editingZoneId) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="geofence-interactive-editor">
          {/* Map canvas pane (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4 bg-white border border-gray-200 rounded p-4 shadow-sm h-[520px]">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center border border-blue-200">
                  <MapPin className="w-4.5 h-4.5 text-[#1E3A5F]" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Interactive Geofence Picker</h4>
                  <p className="text-[10px] text-gray-400">Click to place marker, drag map PIN to adjust exact geolocational coordinates</p>
                </div>
              </div>
              <div className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold">
                Locked: Barangay Palanan
              </div>
            </div>

            <div className="flex-1 relative rounded border border-gray-200 overflow-hidden shadow-inner">
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
                createColor={selectedColorHex}
              />
            </div>
            
            {latitude !== null && longitude !== null ? (
              <div className="p-2.5 bg-blue-50/50 rounded border border-blue-100 flex items-center justify-between text-[11px] text-slate-700 font-mono">
                <span className="font-bold uppercase tracking-wider text-[9px] text-[#1E3A5F]">Active Captured Pinpoint:</span>
                <span>LAT: {latitude.toFixed(6)} | LNG: {longitude.toFixed(6)}</span>
              </div>
            ) : (
              <div className="p-2.5 bg-yellow-50 rounded border border-yellow-100 text-center text-xs text-yellow-800 animate-pulse font-medium">
                ⚠️ Click on the map above to select the geocentered safety breach location
              </div>
            )}
          </div>

          {/* Form and Live preview pane (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            {/* Live Preview Card */}
            <div className="bg-slate-900 text-white rounded p-4 shadow-md border border-slate-800 relative overflow-hidden flex flex-col justify-between h-[150px]">
              <div className="absolute top-0 right-0 p-8 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">LIVE WARNING PREVIEW</span>
                  <p className="text-sm font-bold text-white mt-1">{locationName ? locationName : "Untitled Pinpoint Target"}</p>
                </div>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase ${DANGER_LEVEL_COLORS[riskLevel].bgClass}`}>
                  {riskLevel} RISK
                </span>
              </div>

              <div className="flex items-end justify-between pt-4 border-t border-slate-800">
                <div className="grid grid-cols-2 gap-x-4 text-[11px]">
                  <div>
                    <span className="text-[9px] text-slate-500 font-mono block uppercase">TYPE</span>
                    <span className="font-semibold text-slate-200">{category}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-mono block uppercase">RADIUS EFFECT</span>
                    <span className="font-semibold text-slate-200 font-mono">{radius} meters</span>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <span className="block uppercase text-[8px]">GEOFENCE COLOR</span>
                  <div className="flex items-center justify-end space-x-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full block animate-pulse" style={{ backgroundColor: selectedColorHex }} />
                    <span className="font-bold text-slate-300 font-mono">{DANGER_LEVEL_COLORS[riskLevel].name}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Parameter configuration parameters */}
            <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded p-4 shadow-sm flex flex-col space-y-3.5 h-[354px] justify-between">
              <div>
                <h4 className="font-bold text-xs text-slate-800 uppercase tracking-widest border-b pb-2 mb-3">
                  Configure Hazard Area Settings
                </h4>

                {formError && (
                  <div className="p-2 border border-red-200 bg-red-50 text-[11px] text-red-700 rounded font-medium mb-3">
                    {formError}
                  </div>
                )}

                <div className="space-y-3">
                  {/* Location name input */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Location Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Taft Avenue near Cash & Carry"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F] placeholder-slate-400 font-sans"
                    />
                  </div>

                  {/* Danger type dropdown */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Danger Type</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F] font-sans"
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    {/* Danger level selector */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Danger Level</label>
                      <select
                        value={riskLevel}
                        onChange={(e) => setRiskLevel(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F] font-bold font-sans"
                        style={{ color: selectedColorHex }}
                      >
                        {RISK_LEVELS.map(level => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Adjustable Radius Tool */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <span>Adjustable Radius Tool</span>
                      <span className="font-mono text-[#1E3A5F] bg-blue-50 px-1.5 rounded">{radius} meters</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Plus Minus buttons */}
                      <button
                        type="button"
                        onClick={() => handleRadiusChange(radius - 50)}
                        className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold border border-slate-200 text-xs shrink-0 select-none"
                      >
                        -50
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRadiusChange(radius - 10)}
                        className="p-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold border border-slate-200 text-xs shrink-0 select-none"
                      >
                        -10
                      </button>

                      {/* Slider Input */}
                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="5"
                        value={radius}
                        onChange={(e) => handleRadiusChange(Number(e.target.value))}
                        className="flex-1 accent-[#1E3A5F] h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />

                      <button
                        type="button"
                        onClick={() => handleRadiusChange(radius + 10)}
                        className="p-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold border border-slate-200 text-xs shrink-0 select-none"
                      >
                        +10
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRadiusChange(radius + 50)}
                        className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold border border-slate-200 text-xs shrink-0 select-none"
                      >
                        +50
                      </button>
                    </div>

                    {/* Numeric Input & Quick Radii selection */}
                    <div className="flex items-center justify-between text-xs space-x-2 mt-2">
                      <div className="flex items-center space-x-1">
                        <span className="text-[9px] text-gray-400 font-bold uppercase">Quick Selection:</span>
                        {[50, 100, 200, 300, 500].map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => handleRadiusChange(r)}
                            className={`p-0.5 px-2.5 text-[10px] rounded border transition-colors ${
                              radius === r 
                                ? 'bg-[#1E3A5F] text-white border-[#1E3A5F] font-bold' 
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {r}m
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <input
                          type="number"
                          min="10"
                          max="1000"
                          value={radius}
                          onChange={(e) => handleRadiusChange(Number(e.target.value))}
                          className="w-16 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-center font-mono font-bold focus:outline-[#1E3A5F]"
                        />
                        <span className="text-[10px] text-gray-400 font-semibold font-mono">meters</span>
                      </div>
                    </div>
                  </div>

                  {/* Safety remarks specifications */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Advisory Remarks</label>
                    <textarea
                      rows={2}
                      maxLength={180}
                      placeholder="Add descriptions or actionable warning advisories for nearby mobile residents..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-[#1E3A5F] resize-none font-sans"
                    />
                  </div>

                  {/* Hazard / Incident Photo Evidence */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Hazard / Evidence Photo URL
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                          <ImageIcon className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="url"
                          placeholder="https://... or uploaded image URL"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-[#1E3A5F] placeholder-slate-400 font-sans"
                        />
                      </div>
                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                          title="Clear image URL"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Image Preview Thumbnail */}
                    {imageUrl && (
                      <div className="mt-2 relative group w-full h-20 bg-slate-900 rounded border border-slate-200 overflow-hidden flex items-center justify-center">
                        <img
                          src={imageUrl}
                          alt="Hazard Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                        <div 
                          onClick={() => setPreviewImage(imageUrl)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                        >
                          <span className="text-[10px] font-medium flex items-center space-x-1">
                            <Maximize2 className="w-3 h-3" />
                            <span>Inspect</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3 pt-2 text-xs">
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 bg-[#1E3A5F] hover:bg-[#132844] text-white rounded font-bold uppercase transition-colors shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingZoneId ? 'Save Amendments' : 'Publish Zone'}</span>
                </button>
                <button
                  type="button"
                  onClick={cancelAction}
                  className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold border border-gray-200 transition-colors flex items-center justify-center cursor-pointer"
                  title="Cancel changes"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Danger Zones listings registered */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden" id="danger-zones-registry-list animate-slide-in">
        <div className="p-4 border-b border-gray-100 bg-[#1E3A5F] text-white flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-xs tracking-wider uppercase font-display">Active Municipal Warning Geofencing</h3>
          </div>
          <span className="bg-slate-800 text-white font-mono text-[10px] px-2 py-0.5 rounded font-bold">
            {dangerZones.length} Registered Locations
          </span>
        </div>

        {dangerZones.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-400">
            <AlertTriangle className="w-12 h-12 text-slate-200 mx-auto mb-2" />
            No hazard zones registered. Click "Add Danger Zone" to configure your first geofence.
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 uppercase tracking-widest font-bold text-[9px]">
                  <th className="py-3 px-4 w-1/3">Geocentered Target Name</th>
                  <th className="py-3 px-4">Photo / Proof</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Warning Risk Level</th>
                  <th className="py-3 px-4">Captured Position</th>
                  <th className="py-3 px-4">Operational Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-slate-700">
                {dangerZones.map((zone) => {
                  let mappedColorText = String(zone.color || 'Orange').toUpperCase();
                  const levelUpper = String(zone.riskLevel).toUpperCase();
                  if (levelUpper === 'LOW') mappedColorText = 'GREEN';
                  else if (levelUpper === 'MEDIUM' || levelUpper === 'MODERATE') mappedColorText = 'ORANGE';
                  else if (levelUpper === 'HIGH' || levelUpper === 'CRITICAL') mappedColorText = 'RED';

                  const zoneImg = getReportImage(zone);

                  return (
                    <tr key={zone.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{resolveLocationName(zone)}</div>
                        <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">{safeString(zone.description) || 'No safety advisory text is active.'}</p>
                      </td>
                      <td className="py-3 px-4" onClick={(e) => { if (zoneImg) { e.stopPropagation(); setPreviewImage(zoneImg); } }}>
                        {zoneImg ? (
                          <div className="relative group w-12 h-12 rounded border border-gray-200 overflow-hidden bg-slate-100 flex items-center justify-center hover:ring-2 hover:ring-indigo-500 transition-all cursor-zoom-in shadow-xs">
                            <img 
                              src={zoneImg} 
                              alt="Zone Photo" 
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
                      <td className="py-3 px-4 font-medium text-slate-600">
                        {zone.category}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-bold text-[10px] px-2.5 py-0.5 rounded uppercase ${getRiskColorClass(zone.riskLevel)}`}>
                          {zone.riskLevel} ({zone.radius}m • {mappedColorText})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-500">
                        {typeof zone.latitude === 'number' && !isNaN(zone.latitude) ? zone.latitude.toFixed(5) : 'N/A'}, {typeof zone.longitude === 'number' && !isNaN(zone.longitude) ? zone.longitude.toFixed(5) : 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <button
                          onClick={() => toggleStatus(zone)}
                          className={`inline-flex items-center space-x-1.5 font-bold ${
                            zone.status === 'active' ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-500'
                          }`}
                          title="Click to toggle warning publication"
                        >
                          {zone.status === 'active' ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>ONLINE</span>
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              <span>OFFLINE</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2 text-xs">
                          <button
                            onClick={() => startEdit(zone)}
                            className="p-1 px-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded transition-colors flex items-center space-x-1 font-semibold cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(zone.id, zone.locationName)}
                            className="p-1.5 border border-red-200 hover:bg-red-50 text-red-600 rounded transition-colors cursor-pointer"
                            title="Delete Geofence Alert"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
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

      {/* Lightbox inspection modal */}
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
                <span className="text-xs font-bold font-display uppercase tracking-wider">Hazard Area Photo Evidence</span>
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
                alt="Enlarged Hazard Photo" 
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
