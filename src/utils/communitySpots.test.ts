import { 
  isSpotInStudyArea, 
  createSpotApprovalPayload, 
  createSpotRejectionPayload, 
  filterCommunitySpots, 
  countPendingCommunitySpots,
  getCategoryMeta 
} from './communitySpotUtils';
import { 
  normalizeCommunitySpot, 
  CommunitySpot, 
  COMMUNITY_SPOT_CATEGORIES 
} from '../types';
import { STUDY_AREA_BOUNDS } from './zoneConstants';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n--- Community Spots Unit Tests ---\n');

// 1. Data Contract Normalization & Fallbacks
console.log('Test Suite 1: Data Normalization and Fallbacks');
{
  // Test fallback: title from name
  const rawMobileDoc = {
    name: 'Palanan Community Center Hub',
    details: 'Well lit safe place with 24/7 security outpost',
    category: 'safe_haven',
    location: { lat: 14.5580, lng: 121.0015 },
    upvotes: 7,
    votedUsers: ['user_1', 'user_2'],
    reporterId: 'resident_001',
    reporterName: 'Maria Santos',
    createdAt: '2026-10-20T10:00:00.000Z'
    // missing: title, photoUrls, approvedByAdmin, active, status
  };

  const normalized = normalizeCommunitySpot(rawMobileDoc, 'spot_101');
  assert(normalized.id === 'spot_101', 'Assigns document ID');
  assert(normalized.title === 'Palanan Community Center Hub', 'Fallback to name when title is missing');
  assert(normalized.location.lat === 14.5580 && normalized.location.lng === 121.0015, 'Extracts location coordinates');
  assert(Array.isArray(normalized.photoUrls) && normalized.photoUrls.length === 0, 'Treats missing photoUrls as empty array []');
  assert(normalized.approvedByAdmin === false, 'Treats missing approvedByAdmin as false');
  assert(normalized.status === 'pending', 'Defaults status to pending when missing');
  assert(normalized.upvotes === 7, 'Preserves upvotes count');

  // Test fallback: lat/lng from latitude/longitude
  const rawLegacyDoc = {
    title: 'Well-lit corner Dian st',
    latitude: 14.5590,
    longitude: 121.0025,
    category: 'well_lit',
    photoUrl: 'https://example.com/spot.jpg',
    approvedByAdmin: true,
    active: true,
    status: 'approved'
  };

  const normalizedLegacy = normalizeCommunitySpot(rawLegacyDoc, 'spot_102');
  assert(normalizedLegacy.title === 'Well-lit corner Dian st', 'Preserves explicit title');
  assert(normalizedLegacy.location.lat === 14.5590 && normalizedLegacy.location.lng === 121.0025, 'Falls back to latitude/longitude when location object missing');
  assert(normalizedLegacy.photoUrls.length === 1 && normalizedLegacy.photoUrls[0] === 'https://example.com/spot.jpg', 'Normalizes photoUrl into photoUrls array');
  assert(normalizedLegacy.approvedByAdmin === true, 'Preserves approvedByAdmin: true');
  assert(normalizedLegacy.status === 'approved', 'Preserves approved status');
}

// 2. Study Area Boundary Validation
console.log('\nTest Suite 2: Study Area Boundary Check (SW [14.5510, 120.9930], NE [14.5670, 121.0080])');
{
  assert(isSpotInStudyArea(14.5585, 121.0020), 'Barangay Palanan center is inside study area');
  assert(isSpotInStudyArea(14.5510, 120.9930), 'SW corner [14.5510, 120.9930] is inside study area');
  assert(isSpotInStudyArea(14.5670, 121.0080), 'NE corner [14.5670, 121.0080] is inside study area');

  assert(!isSpotInStudyArea(14.5505, 121.0000), 'Latitude below 14.5510 is outside study area');
  assert(!isSpotInStudyArea(14.5680, 121.0020), 'Latitude above 14.5670 is outside study area');
  assert(!isSpotInStudyArea(14.5580, 120.9920), 'Longitude below 120.9930 is outside study area');
  assert(!isSpotInStudyArea(14.5580, 121.0090), 'Longitude above 121.0080 is outside study area');
  assert(!isSpotInStudyArea(0, 0), 'Zero coordinates are rejected');
}

// 3. Approval & Rejection Payloads
console.log('\nTest Suite 3: Approval and Rejection Contract Payloads');
{
  const adminEmail = 'admin@makati.gov.ph';
  const approvalPayload = createSpotApprovalPayload(adminEmail);
  assert(approvalPayload.status === 'approved', 'Approval payload status is "approved"');
  assert(approvalPayload.active === true, 'Approval payload active is true');
  assert(approvalPayload.approvedByAdmin === true, 'Approval payload approvedByAdmin is true');
  assert(approvalPayload.reviewedBy === adminEmail, 'Approval payload sets reviewedBy to admin email');
  assert(typeof approvalPayload.updatedAt === 'string', 'Approval payload includes updatedAt ISO string');

  const rejectionPayload = createSpotRejectionPayload(adminEmail, 'Insufficient verification details');
  assert(rejectionPayload.status === 'rejected', 'Rejection payload status is "rejected"');
  assert(rejectionPayload.active === false, 'Rejection payload active is false');
  assert(rejectionPayload.approvedByAdmin === false, 'Rejection payload approvedByAdmin is false');
  assert(rejectionPayload.rejectionReason === 'Insufficient verification details', 'Rejection payload records reason');
  assert(rejectionPayload.reviewedBy === adminEmail, 'Rejection payload sets reviewedBy to admin email');
}

// 4. Dual Collection Write Simulation & Document Deduplication
console.log('\nTest Suite 4: Dual Collection Write Simulation & Deduplication');
{
  // Mock Firestore collections
  const mockDb: {
    community_spots: Map<string, any>;
    communitySpots: Map<string, any>;
  } = {
    community_spots: new Map(),
    communitySpots: new Map()
  };

  // Seed two pending spots into both collections
  const spotA: CommunitySpot = {
    id: 'spot_pending_1',
    title: 'Bautista St. Safe Haven Store',
    description: 'Convenience store open 24/7 with CCTV and lighting',
    category: 'safe_haven',
    location: { lat: 14.5585, lng: 121.0010 },
    status: 'pending',
    active: false,
    approvedByAdmin: false,
    upvotes: 4,
    votedUsers: [],
    photoUrls: ['https://example.com/store.jpg']
  };

  const spotB: CommunitySpot = {
    id: 'spot_pending_2',
    title: 'Zobel Roxas Well-Lit Walkway',
    description: 'Newly installed LED street lamps',
    category: 'well_lit',
    location: { lat: 14.5620, lng: 121.0030 },
    status: 'pending',
    active: false,
    approvedByAdmin: false,
    upvotes: 2,
    votedUsers: [],
    photoUrls: []
  };

  mockDb.community_spots.set(spotA.id, { ...spotA });
  mockDb.community_spots.set(spotB.id, { ...spotB });
  mockDb.communitySpots.set(spotA.id, { ...spotA });
  mockDb.communitySpots.set(spotB.id, { ...spotB });

  // Simulate approval of spot_pending_1 writing to both collections with merge
  const approvalPatch = createSpotApprovalPayload('operator@makati.gov.ph');
  const targetId = 'spot_pending_1';

  // Apply to both collections
  mockDb.community_spots.set(targetId, {
    ...mockDb.community_spots.get(targetId),
    ...approvalPatch
  });
  mockDb.communitySpots.set(targetId, {
    ...mockDb.communitySpots.get(targetId),
    ...approvalPatch
  });

  const updatedSnake = mockDb.community_spots.get(targetId);
  const updatedCamel = mockDb.communitySpots.get(targetId);

  assert(updatedSnake.status === 'approved', 'community_spots receives status: approved');
  assert(updatedSnake.active === true, 'community_spots receives active: true');
  assert(updatedSnake.approvedByAdmin === true, 'community_spots receives approvedByAdmin: true');

  assert(updatedCamel.status === 'approved', 'communitySpots receives status: approved');
  assert(updatedCamel.active === true, 'communitySpots receives active: true');
  assert(updatedCamel.approvedByAdmin === true, 'communitySpots receives approvedByAdmin: true');

  // Verify deduplication across both collections by document ID
  const rawMerged: CommunitySpot[] = [
    ...Array.from(mockDb.community_spots.values()),
    ...Array.from(mockDb.communitySpots.values())
  ];
  assert(rawMerged.length === 4, 'Combined list before deduplication has 4 items');

  const deduplicated = new Map<string, CommunitySpot>();
  rawMerged.forEach(item => {
    deduplicated.set(item.id, item);
  });
  assert(deduplicated.size === 2, 'Deduplication by document ID produces exactly 2 spots');
  assert(deduplicated.get('spot_pending_1')?.status === 'approved', 'spot_pending_1 is approved in merged registry');
  assert(deduplicated.get('spot_pending_2')?.status === 'pending', 'spot_pending_2 remains pending');
}

// 5. Filtering and Pending Count
console.log('\nTest Suite 5: Filtering and Pending Count');
{
  const spotsList: CommunitySpot[] = [
    {
      id: 'spot_1',
      title: 'Barangay Palanan Hall Outpost',
      description: 'Official hall outpost',
      category: 'community_hub',
      location: { lat: 14.5585, lng: 121.0020 },
      status: 'approved',
      active: true,
      approvedByAdmin: true,
      upvotes: 12,
      votedUsers: []
    },
    {
      id: 'spot_2',
      title: 'Dian Street Pharmacy',
      description: 'Well-lit entrance',
      category: 'friendly_business',
      location: { lat: 14.5590, lng: 121.0025 },
      status: 'pending',
      active: false,
      approvedByAdmin: false,
      upvotes: 3,
      votedUsers: []
    },
    {
      id: 'spot_3',
      title: 'Casino Street Corner Light',
      description: 'Street light repair verified',
      category: 'well_lit',
      location: { lat: 14.5570, lng: 121.0010 },
      status: 'pending',
      active: false,
      approvedByAdmin: false,
      upvotes: 1,
      votedUsers: []
    },
    {
      id: 'spot_4',
      title: 'Unverified alleyway',
      description: 'Dark alley',
      category: 'enjoyed_spot',
      location: { lat: 14.5560, lng: 121.0000 },
      status: 'rejected',
      active: false,
      approvedByAdmin: false,
      upvotes: 0,
      votedUsers: []
    }
  ];

  // Count pending
  const pendingCount = countPendingCommunitySpots(spotsList);
  assert(pendingCount === 2, 'Correctly counts 2 pending spots');

  // Filter pending only
  const pendingFiltered = filterCommunitySpots(spotsList, 'pending');
  assert(pendingFiltered.length === 2, 'Filters to exactly 2 pending spots');
  assert(pendingFiltered.every(s => s.status === 'pending'), 'All items in pending filter have status "pending"');

  // Filter approved only
  const approvedFiltered = filterCommunitySpots(spotsList, 'approved');
  assert(approvedFiltered.length === 1 && approvedFiltered[0].id === 'spot_1', 'Filters to approved spot');

  // Filter rejected only
  const rejectedFiltered = filterCommunitySpots(spotsList, 'rejected');
  assert(rejectedFiltered.length === 1 && rejectedFiltered[0].id === 'spot_4', 'Filters to rejected spot');

  // Filter by category
  const wellLit = filterCommunitySpots(spotsList, 'all', 'well_lit');
  assert(wellLit.length === 1 && wellLit[0].id === 'spot_3', 'Filters by category "well_lit"');

  // Filter by search query
  const searchResults = filterCommunitySpots(spotsList, 'all', 'all', 'pharmacy');
  assert(searchResults.length === 1 && searchResults[0].id === 'spot_2', 'Filters by text search match "pharmacy"');
}

// 6. Activity Log Schema Conformance
console.log('\nTest Suite 6: Activity Log Schema Format (adminName, adminEmail, action, timestamp, details)');
{
  const logEntry = {
    adminName: 'Chief Operator Santos',
    adminEmail: 'santos@makati.gov.ph',
    action: 'Community Spot Approved',
    timestamp: new Date().toISOString(),
    details: 'Approved community safe haven spot "Bautista St. Safe Haven Store" (ID: spot_pending_1) for public map visibility.'
  };

  assert(typeof logEntry.adminName === 'string' && logEntry.adminName.length > 0, 'adminName is valid string');
  assert(typeof logEntry.adminEmail === 'string' && logEntry.adminEmail.includes('@'), 'adminEmail is valid email');
  assert(typeof logEntry.action === 'string' && logEntry.action === 'Community Spot Approved', 'action is specified');
  assert(typeof logEntry.timestamp === 'string' && !isNaN(Date.parse(logEntry.timestamp)), 'timestamp is ISO formatted');
  assert(typeof logEntry.details === 'string' && logEntry.details.includes('spot_pending_1'), 'details contains spot ID');
}

console.log(`\n========================================`);
console.log(`Community Spots Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
