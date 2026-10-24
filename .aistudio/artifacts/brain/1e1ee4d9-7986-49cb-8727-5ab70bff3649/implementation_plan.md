# Community Spots Management Implementation Plan (Revised)

Add a dedicated Community Spots view to the SafeRoute Admin Portal for Barangay Palanan, matching the mobile app's data contract with dual-collection synchronization (`community_spots` and `communitySpots`), robust fallback parsing, study-area boundary enforcement, map-click creation, integration with the portal's existing `logActivity` helper, and automated verification.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Plan Revisions & Specific Adjustments**:
> 1. **Existing `logActivity` Helper**: Audit entries will strictly use the portal's existing `logActivity(adminName, adminEmail, action, details)` function and its exact field shape (`adminName`, `adminEmail`, `action`, `timestamp`, `details`). No separate format or unauthorized fields (such as `adminId`) will be introduced.
> 2. **Field Parsing & Robust Fallbacks**:
>    - `title` with fallback to `name` (and fallback to "Untitled Community Spot").
>    - Coordinates from `location.lat` / `location.lng` with fallback to top-level `latitude` / `longitude`.
>    - Missing or undefined `photoUrls` treated as empty array `[]`.
>    - Missing or undefined `approvedByAdmin` treated as `false`.
> 3. **Dual-Collection Approval Mutation**: Approval writes `{ status: 'approved', active: true, approvedByAdmin: true }` simultaneously to **both** collections (`community_spots` and `communitySpots`) using `updateDoc` (with fallback to `setDoc(..., { merge: true })`).
> 4. **Strict Isolation & Zero Modifications**:
>    - Zero touches to Danger Zones (`DangerZoneView.tsx`, danger zone constants, CSV import modal / parser).
>    - Zero touches to `firestore.rules` (live security rules remain untouched).
>    - Zero touches to authentication & login flows.

---

## 1. Overview & Core Concept

- **What It Does**: Provides barangay administrators and safety dispatchers with a comprehensive interface to review, verify, approve, reject, delete, and add positive community safety infrastructure (such as well-lit streets, safe havens, friendly businesses, community hubs, and enjoyed spots).
- **Target Audience**: Barangay Palanan administrative officers, desk dispatchers, and community safety reviewers managing resident-contributed safety spots.
- **Key Value**: Residents contribute real-time safety spots from their mobile app. Admins need immediate visibility into pending submissions, spatial verification inside the official Palanan study bounds, one-click approval (which sets `status: 'approved'`, `active: true`, `approvedByAdmin: true` so mobile apps display them and prevent auto-deletion), and the ability to pin verified municipal safe havens directly onto the map.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Review Pending Spots**:
   - The Sidebar displays a distinct orange pending badge count next to "Community Spots".
   - The Dashboard shows a metric card: "Pending Spots to Review" with an alert highlight if `pendingCount > 0`. Clicking navigates straight to the Community Spots tab.
   - The view defaults to the "Pending" tab, presenting resident submissions awaiting moderation.
2. **Inspect & Spatial Preview**:
   - Each spot card displays the category badge, reporter details (`reporterName`), submission timestamp, upvote tally, uploaded photo thumbnails (empty state if no photos), and description.
   - Fallback resolution is applied cleanly: display `title || name || 'Untitled Spot'`, and coordinates from `location?.lat ?? latitude`, `location?.lng ?? longitude`.
   - Selecting a spot opens an interactive preview or pans the embedded Leaflet mini-map directly to the coordinates, displaying the spot with its category icon and confirming it falls safely within the Barangay Palanan study bounds.
3. **Approve / Reject Action**:
   - **Approve**: Clicking "Approve Spot" updates both Firestore collections (`community_spots` and `communitySpots`) with `{ status: 'approved', active: true, approvedByAdmin: true }`. A confirmation toast appears, and an entry is recorded via the existing `logActivity(operatorSession.name, operatorSession.email, 'Approved Community Spot', \`Approved spot "\${spotTitle}" (\${spotId})\`)`.
   - **Reject**: Clicking "Reject" prompts for confirmation, setting `{ status: 'rejected', active: false, approvedByAdmin: false }` across both collections and logging via `logActivity`.
4. **Add Spot by Map Click**:
   - Admin clicks "+ Add Community Spot" or clicks directly on the interactive map inside the study area.
   - Coordinates are automatically validated against `STUDY_AREA_BOUNDS` (`minLat: 14.5510, maxLat: 14.5670, minLng: 120.9930, maxLng: 121.0080`).
   - Admin selects the category (`well_lit`, `safe_haven`, `friendly_business`, `community_hub`, `enjoyed_spot`), enters title & description, and submits. The spot is immediately created across both collections with `status: 'approved'`, `active: true`, `approvedByAdmin: true`, and `reporterName: 'Barangay Admin'`, then logged with `logActivity`.
5. **Delete Spot**:
   - Permanent removal from both Firestore collections with admin confirmation and audit trail via `logActivity`.

### Visual Styling & Theme Consistency

- Follows the existing Tailwind UI system: clean slate backgrounds (`bg-slate-50`, `bg-white`), slate borders (`border-slate-200`), dark navy typography (`text-slate-900`, `text-slate-600`), and category-specific semantic badges:
  - `well_lit`: Amber/Yellow badge (`bg-amber-50 text-amber-700 border-amber-200`) with Lightbulb icon.
  - `safe_haven`: Emerald/Green badge (`bg-emerald-50 text-emerald-700 border-emerald-200`) with ShieldCheck icon.
  - `friendly_business`: Blue badge (`bg-blue-50 text-blue-700 border-blue-200`) with Store icon.
  - `community_hub`: Purple badge (`bg-purple-50 text-purple-700 border-purple-200`) with Users icon.
  - `enjoyed_spot`: Rose/Pink badge (`bg-rose-50 text-rose-700 border-rose-200`) with Heart icon.
- Interactive feedback includes loading skeletons, modal overlays, empty states for zero pending spots, and smooth badge count updates.

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Audit Logging Format** | Reuse existing `logActivity` helper writing `{ adminName, adminEmail, action, timestamp, details }` to `activity_logs`. | Matches existing portal audit schema, conforms to Firestore rules, and eliminates schema drift. | Introducing a new logging helper with conflicting fields like `adminId`. |
| **Field Normalization & Fallbacks** | Standardize spot object in memory with fallbacks: `title ?? name`, `location.lat ?? latitude`, `photoUrls ?? []`, `approvedByAdmin ?? false`. | Transparently handles records written by older or newer mobile app revisions without data loss. | Strict schema rejection of legacy documents lacking newer field keys. |
| **Dual Collection Synchronization** | Listen to and write to both `community_spots` and `communitySpots`. De-duplicate in memory by document ID. | The live mobile app writes and reads across both collections depending on version. Dual-writing ensures zero divergence or ghost records. | Reading only one collection (would miss documents submitted by conflicting mobile versions). |
| **Study Area Bounds Validation** | Reuse `STUDY_AREA_BOUNDS` from `src/utils/zoneConstants.ts`. | Centralizes Palanan boundaries (`SW [14.5510, 120.9930]`, `NE [14.5670, 121.0080]`). Prevents accidental submissions outside the barangay. | Hardcoding duplicate boundary constants in the new view. |
| **Auto-Delete Protection** | Explicitly set `approvedByAdmin: true` and `active: true` upon approval. | Protects spots from mobile app client-side cleanup timers and distinguishes municipal spots from unverified resident pins. | Leaving `approvedByAdmin` undefined. |

---

## 4. Technical Architecture & Data Strategy

### System Layout & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                                App.tsx                                 │
│  - Dual-collection Firestore snapshot listener                         │
│    ('community_spots' and 'communitySpots')                            │
│  - Normalized, de-duplicated spots state (by doc.id)                   │
│  - pendingSpotsCount calculation                                       │
│  - Existing logActivity helper passed or invoked for audit logs        │
└──────────────┬───────────────────────────┬─────────────────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────────┐ ┌──────────────────────────────────────┐
│         Sidebar.tsx          │ │          DashboardView.tsx           │
│ - "Community Spots" item     │ │ - "Pending Spots" metric card        │
│ - Orange badge (pendingCount)│ │ - Quick action redirect to spots tab │
└──────────────────────────────┘ └──────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        CommunitySpotsView.tsx                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Filters: Status (All/Pending/Approved/Rejected) & Category Filter  │ │
│ ├──────────────────────────────────┬─────────────────────────────────┤ │
│ │ Spot Cards List                  │ Interactive Map (Leaflet)       │ │
│ │ - Title (fallback: name)         │ - Pins for all filtered spots   │
│ │ - Category badge, photoUrls      │ - Click-to-pin coordinate picker│ │
│ │ - Upvotes, reporter, timestamp   │ - Palanan study area polygon    │ │
│ │ - Approve / Reject / Delete btns │                                 │ │
│ └──────────────────────────────────┴─────────────────────────────────┘ │
│ Modal: Add Community Spot Form (Validated with STUDY_AREA_BOUNDS)      │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Firestore Synchronization                          │
│ - updateDoc / setDoc(..., { merge: true }) to 'community_spots'        │
│ - updateDoc / setDoc(..., { merge: true }) to 'communitySpots'         │
│ - logActivity(adminName, adminEmail, action, details)                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Exact Normalized Data Model

```typescript
export interface CommunitySpot {
  id: string;
  title: string;
  description: string;
  category: 'well_lit' | 'safe_haven' | 'friendly_business' | 'community_hub' | 'enjoyed_spot';
  location: {
    lat: number;
    lng: number;
  };
  status: 'pending' | 'approved' | 'rejected';
  active: boolean;
  approvedByAdmin: boolean;
  upvotes: number;
  votedUsers: string[];
  reporterId: string;
  reporterName: string;
  createdAt: any;
  photoUrls: string[];
  // Legacy / Raw fallback keys preserved for reference:
  name?: string;
  latitude?: number;
  longitude?: number;
  votes?: number;
  addedBy?: string;
}
```

### Normalization Logic (`normalizeCommunitySpot`)

```typescript
export function normalizeCommunitySpot(id: string, data: Record<string, any>): CommunitySpot {
  const lat = typeof data.location?.lat === 'number' 
    ? data.location.lat 
    : typeof data.latitude === 'number' ? data.latitude : 0;
  const lng = typeof data.location?.lng === 'number' 
    ? data.location.lng 
    : typeof data.longitude === 'number' ? data.longitude : 0;

  return {
    id,
    title: (data.title || data.name || 'Untitled Spot').trim(),
    description: (data.description || '').trim(),
    category: data.category || 'well_lit',
    location: { lat, lng },
    status: data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending',
    active: data.active !== false,
    approvedByAdmin: Boolean(data.approvedByAdmin),
    upvotes: typeof data.upvotes === 'number' ? data.upvotes : (typeof data.votes === 'number' ? data.votes : 0),
    votedUsers: Array.isArray(data.votedUsers) ? data.votedUsers : [],
    reporterId: data.reporterId || data.addedBy || '',
    reporterName: data.reporterName || data.addedBy || 'Resident',
    createdAt: data.createdAt || new Date().toISOString(),
    photoUrls: Array.isArray(data.photoUrls) ? data.photoUrls : [],
    // Preserve raw fields if present:
    name: data.name,
    latitude: data.latitude,
    longitude: data.longitude,
  };
}
```

---

## 5. Files to Change & Isolated Scope

1. **`src/types.ts`**:
   - Add `CommunitySpot` and `CommunitySpotCategory` definitions matching the mobile contract.
2. **`src/utils/spotLogic.ts`** *(New)*:
   - Export `normalizeCommunitySpot` (with fallback logic).
   - Export `validateSpotCoordinates` (using `STUDY_AREA_BOUNDS`).
   - Export `buildApprovalPayload` (`{ status: 'approved', active: true, approvedByAdmin: true }`).
   - Export `buildRejectionPayload` (`{ status: 'rejected', active: false, approvedByAdmin: false }`).
   - Export `deduplicateSpots(spotsA, spotsB)`.
3. **`src/utils/spotLogic.test.ts`** *(New)*:
   - Comprehensive test suite testing all normalization fallbacks, deduplication, coordinate bounds checks, and approval/rejection payload generation.
4. **`src/components/CommunitySpotsView.tsx`** *(New)*:
   - Dedicated management view with filter tabs (All, Pending, Approved, Rejected), category filters, spot detail cards, photo galleries, map preview, and "+ Add Spot" modal.
5. **`src/components/Sidebar.tsx`**:
   - Add "Community Spots" navigation item with an orange badge displaying `pendingSpotsCount`.
6. **`src/components/DashboardView.tsx`**:
   - Add "Pending Community Spots" metric card with count and one-click navigation to the view.
7. **`src/App.tsx`**:
   - Setup dual Firestore listeners for `community_spots` and `communitySpots`.
   - Wire state, approve/reject/delete handlers dual-writing with `updateDoc` / `setDoc(merge: true)`, and audit logging using the existing `logActivity(adminName, adminEmail, action, details)`.

*Restricted Files Untouched*:
- `src/components/DangerZoneView.tsx` — UNTOUCHED
- `src/utils/zoneConstants.ts` — UNTOUCHED (only read `STUDY_AREA_BOUNDS`)
- `src/utils/zoneLogic.ts` & `src/utils/zoneLogic.test.ts` — UNTOUCHED
- `firestore.rules` — UNTOUCHED
- Login / AuthContext — UNTOUCHED

---

## 6. Automated Verification & Testing Plan

### Automated Test Suite (`src/utils/spotLogic.test.ts`)
Run via `npx tsx src/utils/spotLogic.test.ts` or `npm test`:

1. `test_normalizeCommunitySpot_with_standard_contract`:
   - Verifies correct parsing when modern mobile contract fields are present.
2. `test_normalizeCommunitySpot_with_legacy_fallbacks`:
   - Verifies `title` falls back to `name`.
   - Verifies coordinates fall back from `location.lat/lng` to `latitude/longitude`.
   - Verifies missing `photoUrls` falls back to `[]`.
   - Verifies missing `approvedByAdmin` falls back to `false`.
3. `test_deduplicateSpots_across_collections`:
   - Verifies deduplication by document ID when both `community_spots` and `communitySpots` contain the same record.
4. `test_buildApprovalPayload`:
   - Asserts exact shape `{ status: 'approved', active: true, approvedByAdmin: true }`.
5. `test_buildRejectionPayload`:
   - Asserts exact shape `{ status: 'rejected', active: false, approvedByAdmin: false }`.
6. `test_validateSpotCoordinates_study_area`:
   - Validates in-bounds coordinates pass (`14.5580, 121.0000`) and out-of-bounds coordinates fail (`14.5800, 121.0500`).

### Live Testing with the Two Pending Spots

Once implemented, the feature will be verified against the live environment containing the two existing pending spots:
1. **Navigate**:
   - Confirm the Sidebar shows "Community Spots" with a pending badge count of `2`.
   - Confirm the Dashboard card shows `2` pending spots to review.
2. **List & Fallback Verification**:
   - Click "Community Spots" to open the view.
   - Confirm the tab defaults to "Pending", showing the 2 pending spots.
   - Confirm titles, categories, descriptions, reporter names, and coordinates render accurately using the fallback logic.
   - Confirm photo galleries render without crashing when `photoUrls` is empty or populated.
3. **Approval Flow & Dual-Collection Sync**:
   - Click "Approve" on one of the pending spots.
   - Verify the spot transitions from "Pending" to "Approved" tab.
   - Verify the pending badge in the Sidebar decrements from `2` to `1`.
   - Verify an audit entry is created in `activity_logs` with action `"Approved Community Spot"` and details containing the spot title and ID.
   - Verify both `community_spots` and `communitySpots` collections in Firestore have `{ status: 'approved', active: true, approvedByAdmin: true }`.
4. **Map Verification**:
   - Confirm the approved spot appears on the map preview within the Palanan study bounds.
