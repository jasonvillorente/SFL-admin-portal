// Barangay Palanan, Makati City - Safety Portal Zone Constants
// Reusing exact study-area bounding box from mobile app geofencing

export const PALANAN_CENTER: [number, number] = [14.5585, 121.0020];

// Study-area bounding box: overlap of the portal's and mobile app's boxes
// Southwest: [14.5510, 120.9930], Northeast: [14.5670, 121.0080]
export const STUDY_AREA_BOUNDS = {
  minLat: 14.5510,
  maxLat: 14.5670,
  minLng: 120.9930,
  maxLng: 121.0080
} as const;

// Exact boundary bounds (locked map pane bounds coordinates to Barangay Palanan)
export const PALANAN_BOUNDS: [[number, number], [number, number]] = [
  [STUDY_AREA_BOUNDS.minLat, STUDY_AREA_BOUNDS.minLng], // Southwest (minLat, minLng)
  [STUDY_AREA_BOUNDS.maxLat, STUDY_AREA_BOUNDS.maxLng]  // Northeast (maxLat, maxLng)
];

// Universal zone color: all zone circles, preview radius, and markers use single brand color
export const ZONE_COLOR = '#EA580C';

// Shared operational threshold for High Incident classification
export const HIGH_INCIDENT_THRESHOLD = 5;

// Duplicate proximity distance in meters
export const DUPLICATE_DISTANCE_METERS = 20;

// Maximum batch write size allowed by Firestore
export const MAX_BATCH_SIZE = 500;

// Active time window hours
export const DEFAULT_NIGHT_HOURS = {
  startHour: 18,
  endHour: 5
} as const;

export const DEFAULT_DAY_HOURS = {
  startHour: 5,
  endHour: 18
} as const;

// For all_day, hours are logically ignored by the app; using 0 and 24 to cover full 24h day safely
export const DEFAULT_ALL_DAY_HOURS = {
  startHour: 0,
  endHour: 24
} as const;

// Standard danger zone categories
export const STANDARD_CATEGORIES = [
  'Crime',
  'Poor Lighting',
  'Flood Risk',
  'Accident-Prone Area',
  'Construction Area',
  'Suspicious Activity'
] as const;

export type StandardCategory = typeof STANDARD_CATEGORIES[number];

// Privacy reminder hint
export const PRIVACY_DATA_HINT = 
  'Enter aggregated incident numbers only. Do not record names, case numbers, victim details, or personally identifiable information.';
