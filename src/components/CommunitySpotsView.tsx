import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Sparkles, 
  MapPin, 
  Check, 
  X, 
  Trash2, 
  Plus, 
  Search, 
  Filter, 
  ThumbsUp, 
  Calendar, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  Crosshair,
  ShieldCheck,
  Compass
} from 'lucide-react';
import { 
  CommunitySpot, 
  CommunitySpotCategory, 
  COMMUNITY_SPOT_CATEGORIES 
} from '../types';
import { 
  PALANAN_CENTER, 
  PALANAN_BOUNDS, 
  STUDY_AREA_BOUNDS 
} from '../utils/zoneConstants';
import { 
  filterCommunitySpots, 
  isSpotInStudyArea, 
  getCategoryMeta 
} from '../utils/communitySpotUtils';
import ConfirmDialog from './ConfirmDialog';

interface CommunitySpotsViewProps {
  spots: CommunitySpot[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddSpot: (spot: Omit<CommunitySpot, 'id'>) => Promise<void>;
}

export default function CommunitySpotsView({
  spots,
  onApprove,
  onReject,
  onDelete,
  onAddSpot
}: CommunitySpotsViewProps) {
  // Filters state
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // Dialog & Modal states
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
    isDestructive: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
    isDestructive: false
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [newSpotForm, setNewSpotForm] = useState<{
    title: string;
    description: string;
    category: CommunitySpotCategory;
    lat: number;
    lng: number;
    address: string;
  }>({
    title: '',
    description: '',
    category: 'well_lit',
    lat: PALANAN_CENTER[0],
    lng: PALANAN_CENTER[1],
    address: ''
  });
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lightbox for photos
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);

  // Filtered spots
  const filteredSpots = filterCommunitySpots(spots, statusFilter, categoryFilter, searchQuery);
  const pendingCount = spots.filter(s => (s.status || 'pending').toLowerCase() === 'pending').length;
  const approvedCount = spots.filter(s => s.status === 'approved').length;
  const rejectedCount = spots.filter(s => s.status === 'rejected').length;

  // Selected spot object
  const selectedSpot = spots.find(s => s.id === selectedSpotId) || null;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: PALANAN_CENTER,
        zoom: 16,
        minZoom: 14,
        maxZoom: 19,
        maxBounds: [
          [14.545, 120.985],
          [14.575, 121.015]
        ],
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Draw Palanan Study Area Boundary
      L.rectangle(
        [
          [STUDY_AREA_BOUNDS.minLat, STUDY_AREA_BOUNDS.minLng],
          [STUDY_AREA_BOUNDS.maxLat, STUDY_AREA_BOUNDS.maxLng]
        ],
        {
          color: '#2563EB',
          weight: 2,
          dashArray: '5, 5',
          fillColor: '#3B82F6',
          fillOpacity: 0.04
        }
      ).addTo(map);

      const markersGroup = L.featureGroup().addTo(map);
      markersGroupRef.current = markersGroup;

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (isPickingLocation) {
          setNewSpotForm(prev => ({
            ...prev,
            lat: parseFloat(lat.toFixed(6)),
            lng: parseFloat(lng.toFixed(6))
          }));
          setIsPickingLocation(false);
          setIsAddModalOpen(true);
        }
      });

      mapInstanceRef.current = map;
    }

    return () => {
      // Map cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map markers when filteredSpots or selectedSpotId changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    filteredSpots.forEach(spot => {
      const lat = spot.location?.lat ?? spot.latitude;
      const lng = spot.location?.lng ?? spot.longitude;
      if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;

      const isSelected = spot.id === selectedSpotId;
      const meta = getCategoryMeta(spot.category);
      const isApproved = spot.status === 'approved';
      const isPending = spot.status === 'pending' || !spot.status;

      const markerColor = isPending ? '#F59E0B' : (isApproved ? '#10B981' : '#EF4444');

      const customIcon = L.divIcon({
        className: 'custom-spot-marker',
        html: `
          <div style="
            position: relative;
            width: ${isSelected ? '36px' : '28px'};
            height: ${isSelected ? '36px' : '28px'};
            border-radius: 50%;
            background: ${markerColor};
            border: 3px solid #ffffff;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: bold;
            font-size: 13px;
            cursor: pointer;
            transition: transform 0.2s;
          ">
            <span>★</span>
          </div>
        `,
        iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
        iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      marker.on('click', () => {
        setSelectedSpotId(spot.id);
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; min-width: 180px;">
          <div style="font-weight: 700; color: #0F172A; margin-bottom: 4px;">${spot.title}</div>
          <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">${spot.description || 'No description provided'}</div>
          <div style="font-size: 10px; color: #64748B;">
            <b>Category:</b> ${meta.label}<br/>
            <b>Status:</b> ${spot.status.toUpperCase()}<br/>
            <b>Upvotes:</b> ${spot.upvotes}
          </div>
        </div>
      `);

      marker.addTo(markersGroup);

      if (isSelected) {
        marker.openPopup();
      }
    });
  }, [filteredSpots, selectedSpotId]);

  // Handle Pan to Spot
  const handleFocusSpot = (spot: CommunitySpot) => {
    setSelectedSpotId(spot.id);
    const lat = spot.location?.lat ?? spot.latitude;
    const lng = spot.location?.lng ?? spot.longitude;
    if (lat && lng && mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 17, { animate: true });
    }
  };

  // Approval handler
  const handleApproveClick = (spot: CommunitySpot) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Approve Community Spot',
      message: `Are you sure you want to approve "${spot.title}"? It will become visible as an active safe community location for all residents.`,
      isDestructive: false,
      action: async () => {
        await onApprove(spot.id);
      }
    });
  };

  // Rejection handler
  const handleRejectClick = (spot: CommunitySpot) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Reject Community Spot',
      message: `Reject "${spot.title}"? This location will be marked rejected and hidden from public active navigation.`,
      isDestructive: true,
      action: async () => {
        await onReject(spot.id, 'Administrative review rejection');
      }
    });
  };

  // Delete handler
  const handleDeleteClick = (spot: CommunitySpot) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Community Spot',
      message: `Are you sure you want to permanently remove "${spot.title}"? This action synchronizes deletion across community collections.`,
      isDestructive: true,
      action: async () => {
        await onDelete(spot.id);
        if (selectedSpotId === spot.id) {
          setSelectedSpotId(null);
        }
      }
    });
  };

  // Add Spot Form Submission
  const handleCreateSpotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFormError(null);

    const title = newSpotForm.title.trim();
    if (!title) {
      setAddFormError('Please enter a spot title or name.');
      return;
    }

    if (!isSpotInStudyArea(newSpotForm.lat, newSpotForm.lng)) {
      setAddFormError(
        `Coordinates (${newSpotForm.lat.toFixed(4)}, ${newSpotForm.lng.toFixed(4)}) fall outside the Palanan study area [Lat ${STUDY_AREA_BOUNDS.minLat} - ${STUDY_AREA_BOUNDS.maxLat}, Lng ${STUDY_AREA_BOUNDS.minLng} - ${STUDY_AREA_BOUNDS.maxLng}].`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddSpot({
        title,
        name: title,
        description: newSpotForm.description.trim(),
        category: newSpotForm.category,
        location: { lat: newSpotForm.lat, lng: newSpotForm.lng },
        latitude: newSpotForm.lat,
        longitude: newSpotForm.lng,
        status: 'approved',
        active: true,
        approvedByAdmin: true,
        upvotes: 0,
        votedUsers: [],
        reporterId: 'admin_portal',
        reporterName: 'Barangay Administrator',
        address: newSpotForm.address.trim() || 'Barangay Palanan, Makati City'
      });
      setIsAddModalOpen(false);
      setNewSpotForm({
        title: '',
        description: '',
        category: 'well_lit',
        lat: PALANAN_CENTER[0],
        lng: PALANAN_CENTER[1],
        address: ''
      });
    } catch (err: any) {
      setAddFormError(err?.message || 'Failed to create community spot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="community-spots-view">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white border border-gray-200 p-5 rounded shadow-sm gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold font-display text-slate-950">Community Spots</h2>
            <span className="text-xs bg-blue-100 text-blue-800 font-mono font-semibold px-2 py-0.5 rounded-full">
              {spots.length} Total
            </span>
            {pendingCount > 0 && (
              <span className="text-xs bg-amber-500 text-slate-950 font-mono font-bold px-2 py-0.5 rounded-full animate-pulse">
                {pendingCount} Pending Review
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Resident-submitted safe havens, well-lit thoroughfares, friendly businesses, and neighborhood hubs in Barangay Palanan.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setNewSpotForm({
                title: '',
                description: '',
                category: 'well_lit',
                lat: PALANAN_CENTER[0],
                lng: PALANAN_CENTER[1],
                address: ''
              });
              setAddFormError(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#1E3A5F] hover:bg-[#162a45] text-white rounded text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Community Spot</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-gray-200 rounded p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-md text-xs font-medium">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded transition-colors ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 font-bold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({spots.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded transition-colors flex items-center space-x-1.5 ${
              statusFilter === 'pending'
                ? 'bg-white text-amber-700 font-bold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Pending</span>
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded transition-colors ${
              statusFilter === 'approved'
                ? 'bg-white text-emerald-700 font-bold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded transition-colors ${
              statusFilter === 'rejected'
                ? 'bg-white text-rose-700 font-bold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>

        {/* Category & Search Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] w-full sm:w-44"
            >
              <option value="all">All Categories</option>
              {COMMUNITY_SPOT_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search spots, reporter, details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-slate-50 border border-gray-200 rounded pl-8 pr-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Spot List (Left 60%) & Tactical Map Preview (Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Spots Cards List (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          {filteredSpots.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded p-12 text-center shadow-sm">
              <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Community Spots Found</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                No spots match the selected status, category, or search filters.
              </p>
            </div>
          ) : (
            filteredSpots.map((spot) => {
              const meta = getCategoryMeta(spot.category);
              const lat = spot.location?.lat ?? spot.latitude ?? 0;
              const lng = spot.location?.lng ?? spot.longitude ?? 0;
              const inStudyArea = isSpotInStudyArea(lat, lng);
              const isSelected = spot.id === selectedSpotId;
              const isPending = (spot.status || 'pending').toLowerCase() === 'pending';
              const isApproved = spot.status === 'approved';
              const isRejected = spot.status === 'rejected';

              return (
                <div
                  key={spot.id}
                  onClick={() => handleFocusSpot(spot)}
                  className={`bg-white border rounded-lg p-4 shadow-sm transition-all cursor-pointer relative hover:border-[#1E3A5F]/50 ${
                    isSelected ? 'ring-2 ring-[#1E3A5F] border-[#1E3A5F]' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Category Badge & Status Pill */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badgeBg} ${meta.badgeText}`}>
                          {meta.label}
                        </span>

                        {isPending && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>Pending Review</span>
                          </span>
                        )}
                        {isApproved && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approved & Active</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center space-x-1">
                            <X className="w-3 h-3" />
                            <span>Rejected</span>
                          </span>
                        )}

                        {spot.approvedByAdmin && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 flex items-center space-x-1">
                            <ShieldCheck className="w-2.5 h-2.5 text-blue-600" />
                            <span>Verified</span>
                          </span>
                        )}
                      </div>

                      {/* Spot Title */}
                      <h4 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                        {spot.title || spot.name || 'Untitled Spot'}
                      </h4>

                      {/* Description */}
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                        {spot.description || <span className="italic text-gray-400">No description provided</span>}
                      </p>

                      {/* Coordinates & Study Area verification */}
                      <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] text-gray-500">
                        <div className="flex items-center space-x-1 font-mono">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                        </div>

                        {inStudyArea ? (
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Inside Palanan Study Area
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Outside Palanan Bounds
                          </span>
                        )}

                        {/* Upvotes */}
                        <div className="flex items-center space-x-1 font-medium text-slate-700">
                          <ThumbsUp className="w-3 h-3 text-blue-600" />
                          <span>{spot.upvotes} upvotes</span>
                        </div>
                      </div>

                      {/* Reporter & Date */}
                      <div className="flex items-center space-x-3 mt-2 text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                        <div className="flex items-center space-x-1">
                          <User className="w-3 h-3" />
                          <span className="text-gray-600 font-medium">{spot.reporterName || 'Anonymous Resident'}</span>
                        </div>
                        {spot.createdAt && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {spot.createdAt?.seconds 
                                ? new Date(spot.createdAt.seconds * 1000).toLocaleDateString()
                                : (spot.createdAt ? new Date(spot.createdAt).toLocaleDateString() : 'Recent')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Photo Thumbnails */}
                      {spot.photoUrls && spot.photoUrls.length > 0 && (
                        <div className="flex items-center space-x-2 mt-2.5">
                          {spot.photoUrls.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`Spot ${i + 1}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxImg(url);
                              }}
                              className="w-12 h-12 object-cover rounded border border-gray-200 hover:scale-105 transition-transform"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Column */}
                    <div className="flex flex-col space-y-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isPending ? (
                        <>
                          <button
                            onClick={() => handleApproveClick(spot)}
                            className="flex items-center justify-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                            title="Approve this spot"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleRejectClick(spot)}
                            className="flex items-center justify-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 rounded text-xs font-medium transition-colors"
                            title="Reject this spot"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : isApproved ? (
                        <button
                          onClick={() => handleRejectClick(spot)}
                          className="flex items-center justify-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 rounded text-[11px] font-medium transition-colors"
                        >
                          <X className="w-3 h-3" />
                          <span>Revoke</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApproveClick(spot)}
                          className="flex items-center justify-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 rounded text-[11px] font-medium transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          <span>Re-approve</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteClick(spot)}
                        className="flex items-center justify-center space-x-1 px-2.5 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded text-[11px] transition-colors"
                        title="Delete spot document"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Embedded Tactical Leaflet Map (5 Cols) */}
        <div className="lg:col-span-5 sticky top-4 space-y-3">
          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col">
            <div className="p-3.5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xs text-slate-900 flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1 text-[#1E3A5F]" />
                  Palanan Community Map View
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Showing {filteredSpots.length} filtered pins inside Barangay study area.
                </p>
              </div>

              {isPickingLocation ? (
                <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-bold animate-pulse">
                  Click Map to Set Point
                </span>
              ) : (
                <button
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setView(PALANAN_CENTER, 16);
                    }
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-900 flex items-center space-x-1 bg-slate-100 px-2 py-1 rounded"
                >
                  <Compass className="w-3 h-3" />
                  <span>Center Grid</span>
                </button>
              )}
            </div>

            <div className="relative">
              <div 
                ref={mapContainerRef} 
                className="w-full h-[420px] bg-slate-100" 
                style={{ zIndex: 1 }}
              />

              {/* Map Legend overlay */}
              <div className="absolute bottom-2 left-2 z-[400] bg-white/95 backdrop-blur-xs p-2 rounded border border-gray-200 text-[9px] space-y-1 shadow-sm">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[8px]">Category Pin Types</div>
                {COMMUNITY_SPOT_CATEGORIES.map(c => (
                  <div key={c.id} className="flex items-center space-x-1.5">
                    <span 
                      className="w-2 h-2 rounded-full shrink-0" 
                      style={{ backgroundColor: c.markerColor }} 
                    />
                    <span className="text-slate-600">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Info Box for Selected Spot */}
          {selectedSpot && (
            <div className="bg-white border border-gray-200 rounded p-4 shadow-sm text-xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                <span className="font-bold text-slate-900">Selected Spot Telemetry</span>
                <span className="font-mono text-[10px] text-gray-400">ID: {selectedSpot.id.slice(0, 10)}...</span>
              </div>
              <div className="space-y-1.5 text-slate-700">
                <div className="flex justify-between">
                  <span className="text-gray-400">Title:</span>
                  <span className="font-semibold">{selectedSpot.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Category:</span>
                  <span>{getCategoryMeta(selectedSpot.category).label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span className="font-semibold uppercase">{selectedSpot.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Reporter:</span>
                  <span>{selectedSpot.reporterName || 'Resident'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Coordinates:</span>
                  <span className="font-mono">
                    {(selectedSpot.location?.lat ?? selectedSpot.latitude ?? 0).toFixed(5)}, 
                    {(selectedSpot.location?.lng ?? selectedSpot.longitude ?? 0).toFixed(5)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Spot Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-lg border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Plus className="w-4 h-4 mr-1.5 text-[#1E3A5F]" />
                Add Official Community Spot
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSpotSubmit} className="p-5 space-y-4 text-xs">
              {addFormError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{addFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Spot Title / Place Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Palanan Barangay Hall, Well-lit Casino St Walkway"
                  value={newSpotForm.title}
                  onChange={(e) => setNewSpotForm({ ...newSpotForm, title: e.target.value })}
                  className="w-full bg-slate-50 border border-gray-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={newSpotForm.category}
                  onChange={(e) => setNewSpotForm({ ...newSpotForm, category: e.target.value as CommunitySpotCategory })}
                  className="w-full bg-slate-50 border border-gray-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-[#1E3A5F] focus:outline-none"
                >
                  {COMMUNITY_SPOT_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label} ({cat.description})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Description / Amenities
                </label>
                <textarea
                  rows={2}
                  placeholder="Details on safety features, lighting, 24/7 security, or assistance offered..."
                  value={newSpotForm.description}
                  onChange={(e) => setNewSpotForm({ ...newSpotForm, description: e.target.value })}
                  className="w-full bg-slate-50 border border-gray-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-[#1E3A5F] focus:outline-none"
                />
              </div>

              {/* Coordinates Picker Row */}
              <div className="space-y-2 bg-slate-50 p-3 rounded border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Geographic Coordinates</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setIsPickingLocation(true);
                    }}
                    className="flex items-center space-x-1 text-[11px] text-[#1E3A5F] hover:underline font-semibold"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Pick on Map</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">
                      Latitude ({STUDY_AREA_BOUNDS.minLat} - {STUDY_AREA_BOUNDS.maxLat})
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newSpotForm.lat}
                      onChange={(e) => setNewSpotForm({ ...newSpotForm, lat: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">
                      Longitude ({STUDY_AREA_BOUNDS.minLng} - {STUDY_AREA_BOUNDS.maxLng})
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newSpotForm.lng}
                      onChange={(e) => setNewSpotForm({ ...newSpotForm, lng: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-[#1E3A5F] focus:outline-none"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-gray-400">
                  Coordinates are validated against the Barangay Palanan boundary box.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Street / Address Landmark
                </label>
                <input
                  type="text"
                  placeholder="e.g. Casino St corner Arellano Ave"
                  value={newSpotForm.address}
                  onChange={(e) => setNewSpotForm({ ...newSpotForm, address: e.target.value })}
                  className="w-full bg-slate-50 border border-gray-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded bg-white hover:bg-slate-50 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#1E3A5F] hover:bg-[#162a45] text-white rounded font-semibold shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving Spot...' : 'Create Spot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div 
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in cursor-pointer"
        >
          <div className="relative max-w-2xl max-h-[85vh] overflow-hidden rounded shadow-2xl">
            <img src={lightboxImg} alt="Enlarged spot photo" className="object-contain w-full h-full" />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDestructive={confirmDialog.isDestructive}
        confirmText={confirmDialog.isDestructive ? 'Proceed' : 'Confirm'}
        onConfirm={async () => {
          await confirmDialog.action();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
