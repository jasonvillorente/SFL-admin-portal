import { STUDY_AREA_BOUNDS } from './zoneConstants';
import { 
  CommunitySpot, 
  CommunitySpotCategory, 
  CommunitySpotStatus, 
  COMMUNITY_SPOT_CATEGORIES 
} from '../types';

/**
 * Validates whether the given coordinates fall within the Palanan study area bounding box.
 * Uses the exact study area bounds: SW [14.5510, 120.9930], NE [14.5670, 121.0080].
 */
export function isSpotInStudyArea(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return false;
  return (
    lat >= STUDY_AREA_BOUNDS.minLat &&
    lat <= STUDY_AREA_BOUNDS.maxLat &&
    lng >= STUDY_AREA_BOUNDS.minLng &&
    lng <= STUDY_AREA_BOUNDS.maxLng
  );
}

/**
 * Generates the payload to approve a spot according to the mobile app & portal contract.
 * Sets status: 'approved', active: true, approvedByAdmin: true.
 */
export function createSpotApprovalPayload(adminEmail?: string): {
  status: 'approved';
  active: true;
  approvedByAdmin: true;
  reviewedBy?: string;
  updatedAt: string;
} {
  return {
    status: 'approved',
    active: true,
    approvedByAdmin: true,
    ...(adminEmail ? { reviewedBy: adminEmail } : {}),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Generates the payload to reject a spot.
 * Sets status: 'rejected', active: false, approvedByAdmin: false.
 */
export function createSpotRejectionPayload(adminEmail?: string, reason?: string): {
  status: 'rejected';
  active: false;
  approvedByAdmin: false;
  rejectionReason?: string;
  reviewedBy?: string;
  updatedAt: string;
} {
  return {
    status: 'rejected',
    active: false,
    approvedByAdmin: false,
    ...(reason ? { rejectionReason: reason } : {}),
    ...(adminEmail ? { reviewedBy: adminEmail } : {}),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Filters a list of community spots based on status, category, and text search.
 */
export function filterCommunitySpots(
  spots: CommunitySpot[],
  statusFilter: string = 'all',
  categoryFilter: string = 'all',
  searchQuery: string = ''
): CommunitySpot[] {
  const query = searchQuery.trim().toLowerCase();

  return spots.filter(spot => {
    // Status filter
    if (statusFilter !== 'all') {
      const spotStatus = (spot.status || 'pending').toLowerCase();
      if (statusFilter === 'pending' && spotStatus !== 'pending') return false;
      if (statusFilter === 'approved' && spotStatus !== 'approved') return false;
      if (statusFilter === 'rejected' && spotStatus !== 'rejected') return false;
    }

    // Category filter
    if (categoryFilter !== 'all') {
      if (spot.category !== categoryFilter) return false;
    }

    // Text search filter
    if (query.length > 0) {
      const matchTitle = (spot.title || '').toLowerCase().includes(query);
      const matchDesc = (spot.description || '').toLowerCase().includes(query);
      const matchReporter = (spot.reporterName || '').toLowerCase().includes(query);
      const matchAddress = (spot.address || '').toLowerCase().includes(query);
      if (!matchTitle && !matchDesc && !matchReporter && !matchAddress) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Counts spots with 'pending' status.
 */
export function countPendingCommunitySpots(spots: CommunitySpot[]): number {
  return spots.filter(s => (s.status || 'pending').toLowerCase() === 'pending').length;
}

/**
 * Retrieves styling and display metadata for a community spot category.
 */
export function getCategoryMeta(categoryId: string) {
  const found = COMMUNITY_SPOT_CATEGORIES.find(c => c.id === categoryId);
  if (found) return found;
  return {
    id: categoryId as CommunitySpotCategory,
    label: categoryId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: 'Community designated location',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    markerColor: '#64748B'
  };
}
