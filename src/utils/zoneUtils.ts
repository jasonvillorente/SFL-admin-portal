import {
  STUDY_AREA_BOUNDS,
  DUPLICATE_DISTANCE_METERS,
  DEFAULT_NIGHT_HOURS,
  DEFAULT_DAY_HOURS,
  DEFAULT_ALL_DAY_HOURS,
  STANDARD_CATEGORIES,
  StandardCategory
} from './zoneConstants';
import { DangerZone } from '../types';

/**
 * Calculates geographical distance in meters between two coordinates using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    typeof lat1 !== 'number' || isNaN(lat1) ||
    typeof lon1 !== 'number' || isNaN(lon1) ||
    typeof lat2 !== 'number' || isNaN(lat2) ||
    typeof lon2 !== 'number' || isNaN(lon2) ||
    (lat1 === 0 && lon1 === 0) ||
    (lat2 === 0 && lon2 === 0)
  ) {
    return Infinity;
  }

  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if a zone or candidate coordinate object has valid non-zero coordinates.
 * Returns false if coordinates are omitted, null, undefined, 0,0, or needsLocation is true.
 */
export function hasValidCoordinates(
  zone?: { latitude?: number | null; longitude?: number | null; needsLocation?: boolean; lat?: number | null; lng?: number | null; [key: string]: any } | null
): boolean {
  if (!zone) return false;
  if (zone.needsLocation === true) return false;
  const rawLat = zone.latitude ?? zone.lat;
  const rawLng = zone.longitude ?? zone.lng;
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) return false;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) return false;
  // (0, 0) is placeholder / Null Island - invalid
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Ensures strict uniqueness of Danger Zones by document ID.
 * Never returns the same document twice.
 */
export function deduplicateDangerZones(zones: DangerZone[]): DangerZone[] {
  if (!zones || zones.length === 0) return [];
  const map = new Map<string, DangerZone>();
  for (const zone of zones) {
    if (!zone || !zone.id) continue;
    const existing = map.get(zone.id);
    if (!existing) {
      map.set(zone.id, zone);
    } else {
      map.set(zone.id, {
        ...existing,
        ...zone,
        imageUrl: zone.imageUrl || existing.imageUrl,
        photoUrl: zone.photoUrl || existing.photoUrl,
        photos: (zone.photos && zone.photos.length > 0) ? zone.photos : existing.photos
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Validates whether latitude and longitude lie inside the Barangay Palanan study area bounding box
 */
export function isInsideStudyArea(lat: number, lng: number): boolean {
  if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) {
    return false;
  }
  return (
    lat >= STUDY_AREA_BOUNDS.minLat &&
    lat <= STUDY_AREA_BOUNDS.maxLat &&
    lng >= STUDY_AREA_BOUNDS.minLng &&
    lng <= STUDY_AREA_BOUNDS.maxLng
  );
}

/**
 * Auto-suggests activeTime from crime counts:
 * - Only suggests when total incidents (night + day) >= 3
 * - If nightCrimeCount > dayCrimeCount -> 'night_only'
 * - If dayCrimeCount > nightCrimeCount -> 'day_only'
 * - Otherwise (or equal) -> 'all_day'
 * Returns null if total incidents < 3 (leaving user choice intact or default)
 */
export function suggestActiveTime(
  nightCrimeCount: number,
  dayCrimeCount: number
): 'night_only' | 'day_only' | 'all_day' | null {
  const n = Math.max(0, Math.floor(nightCrimeCount || 0));
  const d = Math.max(0, Math.floor(dayCrimeCount || 0));
  const total = n + d;
  if (total < 3) {
    return null;
  }
  if (n > d) return 'night_only';
  if (d > n) return 'day_only';
  return 'all_day';
}

/**
 * Returns explicit startHour and endHour defaults according to activeTime setting:
 * - night_only: 18 to 5
 * - day_only: 5 to 18
 * - all_day: 0 to 23
 */
export function getDefaultHoursForActiveTime(
  activeTime: 'night_only' | 'day_only' | 'all_day'
): { startHour: number; endHour: number } {
  if (activeTime === 'night_only') {
    return { ...DEFAULT_NIGHT_HOURS };
  }
  if (activeTime === 'day_only') {
    return { ...DEFAULT_DAY_HOURS };
  }
  return { ...DEFAULT_ALL_DAY_HOURS };
}

/**
 * Parses a string of crime types formatted like "theft:3;snatching:2" or comma-delimited
 */
export function parseCrimeTypesString(input: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!input || typeof input !== 'string') return result;

  const pairs = input.split(/[;,]/);
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const type = parts[0].trim().toLowerCase();
      const count = parseInt(parts[1].trim(), 10);
      if (type && !isNaN(count) && count >= 0) {
        result[type] = (result[type] || 0) + count;
      }
    } else if (parts.length === 1 && parts[0].trim()) {
      const type = parts[0].trim().toLowerCase();
      result[type] = (result[type] || 0) + 1;
    }
  }
  return result;
}

/**
 * Serializes a crimeTypes map into a compact string like "theft:3;snatching:2"
 */
export function serializeCrimeTypes(crimeTypes?: Record<string, number>): string {
  if (!crimeTypes || Object.keys(crimeTypes).length === 0) return '';
  return Object.entries(crimeTypes)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => `${type}:${count}`)
    .join(';');
}

/**
 * Duplicate detector:
 * Checks if incoming zone matches an existing zone by exact locationName (case-insensitive, trimmed)
 * OR is within DUPLICATE_DISTANCE_METERS (20 meters) when both have valid coordinates.
 * CRITICAL:
 * - Does NOT skip zones that need location: name matching always runs even when one or both need location!
 * - Proximity match (<= 20m) runs whenever both have valid coordinates.
 */
export function findLikelyDuplicate(
  candidate: { locationName?: string; latitude?: number | null; longitude?: number | null; name?: string; needsLocation?: boolean },
  existingZones: DangerZone[]
): { zone: DangerZone; reason: 'name' | 'distance' | 'both'; distanceMeters?: number } | null {
  const normalize = (val?: string) => (val || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const candName = normalize(candidate.locationName || candidate.name);
  const candHasCoords = hasValidCoordinates(candidate);
  const candLat = candHasCoords ? Number(candidate.latitude ?? (candidate as any).lat) : null;
  const candLng = candHasCoords ? Number(candidate.longitude ?? (candidate as any).lng) : null;

  for (const existing of existingZones) {
    const existName = normalize(existing.locationName || (existing as any).name || (existing as any).title);
    const nameMatch = candName.length > 0 && existName.length > 0 && candName === existName;

    let distanceMeters: number | undefined;
    let distMatch = false;

    if (candHasCoords && hasValidCoordinates(existing)) {
      const existLat = Number(existing.latitude ?? (existing as any).lat);
      const existLng = Number(existing.longitude ?? (existing as any).lng);
      distanceMeters = calculateDistanceMeters(candLat!, candLng!, existLat, existLng);
      if (distanceMeters <= DUPLICATE_DISTANCE_METERS) {
        distMatch = true;
      }
    }

    if (nameMatch && distMatch) {
      return { zone: existing, reason: 'both', distanceMeters };
    }
    if (nameMatch) {
      return { zone: existing, reason: 'name', distanceMeters };
    }
    if (distMatch) {
      return { zone: existing, reason: 'distance', distanceMeters };
    }
  }

  return null;
}

export interface ZoneUpdatePayload extends Partial<DangerZone> {
  source?: 'barangay_data' | 'resident_report' | 'both';
  activeTime?: 'night_only' | 'day_only' | 'all_day';
  startHour?: number;
  endHour?: number;
  nightCrimeCount?: number;
  dayCrimeCount?: number;
  crimeCount?: number;
  crimeTypes?: Record<string, number>;
  dataPeriod?: string;
  lastIncidentDate?: string;
  needsLocation?: boolean;
}

/**
 * Merge rule for duplicates when user chooses "Update existing":
 * - If merging barangay data into an existing resident-report zone, sets source to 'both'
 * - Fills counts and dataPeriod
 * - Does NOT overwrite existing description or photos if incoming values are blank
 * - Preserves existing status unless incoming explicitly updates it
 * - Preserves legacy fields like riskLevel without deleting them
 */
export function mergeZoneData(
  existing: DangerZone,
  incoming: Partial<DangerZone>
): Partial<DangerZone> {
  const isExistingResident = existing.source === 'resident_report' || (!existing.source && existing.sourceReportId);
  const isIncomingBarangay = incoming.source === 'barangay_data' || !incoming.source;

  let mergedSource: 'barangay_data' | 'resident_report' | 'both' = existing.source || 'barangay_data';
  if (isExistingResident && isIncomingBarangay) {
    mergedSource = 'both';
  } else if (incoming.source) {
    mergedSource = incoming.source;
  }

  // Preserve existing description if incoming is blank
  const mergedDescription = (incoming.description && incoming.description.trim().length > 0)
    ? incoming.description.trim()
    : (existing.description || '');

  // Preserve existing photo/photos if incoming is blank
  const mergedImageUrl = incoming.imageUrl?.trim() || existing.imageUrl;
  const mergedPhotoUrl = incoming.photoUrl?.trim() || existing.photoUrl;
  const mergedPhotos = (incoming.photos && incoming.photos.length > 0)
    ? incoming.photos
    : (existing.photos || []);

  const mergedPayload: Partial<DangerZone> = {
    ...incoming,
    source: mergedSource,
    description: mergedDescription,
    imageUrl: mergedImageUrl,
    photoUrl: mergedPhotoUrl,
    photos: mergedPhotos,
    // Ensure coordinates are not overwritten with null/empty
    latitude: (incoming.latitude !== undefined && incoming.latitude !== null && !isNaN(incoming.latitude))
      ? incoming.latitude
      : existing.latitude,
    longitude: (incoming.longitude !== undefined && incoming.longitude !== null && !isNaN(incoming.longitude))
      ? incoming.longitude
      : existing.longitude,
    radius: (incoming.radius !== undefined && incoming.radius !== null && !isNaN(incoming.radius))
      ? incoming.radius
      : existing.radius,
    category: incoming.category || existing.category,
    locationName: incoming.locationName || existing.locationName,
    dataPeriod: incoming.dataPeriod || existing.dataPeriod,
    lastIncidentDate: incoming.lastIncidentDate || existing.lastIncidentDate,
    updatedAt: new Date().toISOString()
  };

  // If existing had valid coordinates, clear needsLocation
  if (
    mergedPayload.latitude !== undefined &&
    mergedPayload.longitude !== undefined &&
    !isNaN(mergedPayload.latitude) &&
    !isNaN(mergedPayload.longitude)
  ) {
    mergedPayload.needsLocation = false;
  }

  return mergedPayload;
}

export interface CsvParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  category: string;
  description: string;
  source: 'barangay_data' | 'resident_report' | 'both';
  activeTime: 'night_only' | 'day_only' | 'all_day';
  startHour: number;
  endHour: number;
  nightCrimeCount: number;
  dayCrimeCount: number;
  crimeCount: number;
  crimeTypes: Record<string, number>;
  dataPeriod: string;
  lastIncidentDate: string;
  needsLocation: boolean;
  status: 'valid' | 'warning' | 'error';
  issues: string[];
  duplicateOf?: {
    zone: DangerZone;
    reason: 'name' | 'distance' | 'both';
    distanceMeters?: number;
  };
  resolution?: 'skip' | 'update' | 'add_anyway';
}

/**
 * Parses raw CSV string handling:
 * - UTF-8 BOM
 * - Quoted commas and escaped quotes
 * - Blank rows
 * - "crimeCount" column used ONLY when both nightCrimeCount and dayCrimeCount are blank
 * - Missing coordinates flagged as needsLocation: true
 * - Unknown categories flagged as warnings
 * - Non-negative count validation
 */
export function parseZoneCsv(
  csvText: string,
  existingZones: DangerZone[] = []
): {
  rows: CsvParsedRow[];
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  needsLocationRows: number;
} {
  // 1. Strip UTF-8 BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  // 2. Parse CSV into matrix with quote-aware splitter
  const lines = splitCsvLines(cleanText);
  if (lines.length < 2) {
    return {
      rows: [],
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      needsLocationRows: 0
    };
  }

  // Parse header
  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
  const headerMap = new Map<string, number>();
  headers.forEach((h, idx) => {
    // Normalise header variations
    const norm = h.replace(/[^a-z0-9]/g, '');
    headerMap.set(norm, idx);
    headerMap.set(h, idx);
  });

  const getCol = (rowArr: string[], ...aliases: string[]): string => {
    for (const alias of aliases) {
      const norm = alias.replace(/[^a-z0-9]/g, '');
      const idx = headerMap.get(norm) ?? headerMap.get(alias);
      if (idx !== undefined && idx < rowArr.length) {
        return rowArr[idx].trim();
      }
    }
    return '';
  };

  const parsedRows: CsvParsedRow[] = [];
  let validCount = 0;
  let warnCount = 0;
  let errCount = 0;
  let needsLocCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue; // Skip blank lines

    const rowCells = parseCsvRow(rawLine);
    // Skip if all cells are blank
    if (rowCells.every(c => !c.trim())) continue;

    const issues: string[] = [];
    let rowStatus: 'valid' | 'warning' | 'error' = 'valid';

    const rawDict: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawDict[h] = rowCells[idx] || '';
    });

    // 1. Location Name (Required)
    const name = getCol(rowCells, 'name', 'locationname', 'location');
    if (!name) {
      issues.push('Missing location name');
      rowStatus = 'error';
    }

    // 2. Coordinates
    const rawLat = getCol(rowCells, 'lat', 'latitude');
    const rawLng = getCol(rowCells, 'lng', 'longitude', 'long');
    let lat: number | null = null;
    let lng: number | null = null;
    let needsLocation = false;

    if (!rawLat && !rawLng) {
      needsLocation = true;
      issues.push('Needs location: no coordinates supplied');
      if (rowStatus !== 'error') rowStatus = 'warning';
    } else {
      const parsedLat = parseFloat(rawLat);
      const parsedLng = parseFloat(rawLng);
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        needsLocation = true;
        issues.push('Invalid coordinates (flagged as needs location)');
        if (rowStatus !== 'error') rowStatus = 'warning';
      } else {
        lat = parsedLat;
        lng = parsedLng;
        // Bounding box validation
        if (!isInsideStudyArea(lat, lng)) {
          issues.push(
            `Coordinates (${lat}, ${lng}) lie outside Barangay Palanan bounds [${STUDY_AREA_BOUNDS.minLat}-${STUDY_AREA_BOUNDS.maxLat}, ${STUDY_AREA_BOUNDS.minLng}-${STUDY_AREA_BOUNDS.maxLng}]`
          );
          rowStatus = 'error';
        }
      }
    }

    // 3. Radius
    const rawRadius = getCol(rowCells, 'radius', 'radiusmeters');
    let radius = 100;
    if (rawRadius) {
      const parsedRadius = parseFloat(rawRadius);
      if (isNaN(parsedRadius) || parsedRadius <= 0) {
        issues.push('Radius must be a positive number greater than 0');
        rowStatus = 'error';
      } else {
        radius = parsedRadius;
      }
    }

    // 4. Category
    const rawCat = getCol(rowCells, 'category');
    let category = 'Crime';
    if (rawCat) {
      category = rawCat;
      const isKnown = STANDARD_CATEGORIES.some(
        c => c.toLowerCase() === rawCat.toLowerCase()
      );
      if (!isKnown) {
        issues.push(`Unknown category "${rawCat}" (will be imported as custom)`);
        if (rowStatus !== 'error') rowStatus = 'warning';
      }
    }

    // 5. Description
    const description = getCol(rowCells, 'description', 'details');

    // 6. Source
    const rawSource = getCol(rowCells, 'source').toLowerCase();
    let source: 'barangay_data' | 'resident_report' | 'both' = 'barangay_data';
    if (rawSource === 'resident_report' || rawSource === 'resident' || rawSource === 'residentreport') {
      source = 'resident_report';
    } else if (rawSource === 'both') {
      source = 'both';
    }

    // 7. Crime Counts & Active Time
    const rawNight = getCol(rowCells, 'nightcrimecount', 'nightcount', 'night');
    const rawDay = getCol(rowCells, 'daycrimecount', 'daycount', 'day');
    const rawTotal = getCol(rowCells, 'crimecount', 'totalcrimecount', 'count', 'total');

    let nightCrimeCount = 0;
    let dayCrimeCount = 0;
    let crimeCount = 0;

    const hasNight = rawNight !== '';
    const hasDay = rawDay !== '';

    if (hasNight || hasDay) {
      // Split mode
      if (hasNight) {
        const n = parseInt(rawNight, 10);
        if (isNaN(n) || n < 0) {
          issues.push('nightCrimeCount must be a non-negative whole number');
          rowStatus = 'error';
        } else {
          nightCrimeCount = n;
        }
      }
      if (hasDay) {
        const d = parseInt(rawDay, 10);
        if (isNaN(d) || d < 0) {
          issues.push('dayCrimeCount must be a non-negative whole number');
          rowStatus = 'error';
        } else {
          dayCrimeCount = d;
        }
      }
      crimeCount = nightCrimeCount + dayCrimeCount;
    } else if (rawTotal !== '') {
      // "No day/night split" fallback: crimeCount used ONLY when both night and day are blank
      const tot = parseInt(rawTotal, 10);
      if (isNaN(tot) || tot < 0) {
        issues.push('crimeCount must be a non-negative whole number');
        rowStatus = 'error';
      } else {
        crimeCount = tot;
        nightCrimeCount = 0;
        dayCrimeCount = 0;
      }
    }

    // 8. Active Time & Operating Hours
    const rawActive = getCol(rowCells, 'activetime', 'activehours').toLowerCase();
    let activeTime: 'night_only' | 'day_only' | 'all_day' = 'all_day';

    if (rawActive.includes('night')) {
      activeTime = 'night_only';
    } else if (rawActive.includes('day_only') || rawActive === 'day') {
      activeTime = 'day_only';
    } else if (rawActive.includes('all')) {
      activeTime = 'all_day';
    } else if (hasNight || hasDay) {
      // Auto-suggest only if not provided and total incidents >= 3
      const suggested = suggestActiveTime(nightCrimeCount, dayCrimeCount);
      if (suggested) {
        activeTime = suggested;
      }
    }

    // If total-only was used (both night and day blank), lock activeTime to all_day
    if (!hasNight && !hasDay && rawTotal !== '') {
      activeTime = 'all_day';
    }

    // Operating hours defaults
    const defaultHours = getDefaultHoursForActiveTime(activeTime);
    let startHour = defaultHours.startHour;
    let endHour = defaultHours.endHour;

    const rawStart = getCol(rowCells, 'starthour', 'start');
    const rawEnd = getCol(rowCells, 'endhour', 'end');
    if (rawStart) {
      const s = parseInt(rawStart, 10);
      if (!isNaN(s) && s >= 0 && s <= 23) startHour = s;
    }
    if (rawEnd) {
      const e = parseInt(rawEnd, 10);
      if (!isNaN(e) && e >= 0 && e <= 23) endHour = e;
    }

    // 9. Crime Types
    const rawTypes = getCol(rowCells, 'crimetypes', 'types');
    const crimeTypes = parseCrimeTypesString(rawTypes);

    // 10. Data Period & Last Incident Date
    const dataPeriod = getCol(rowCells, 'dataperiod', 'period');
    const lastIncidentDate = getCol(rowCells, 'lastincidentdate', 'lastdate');

    // Duplicate detection against existing danger zones and prior rows in this CSV
    const priorParsedZones: DangerZone[] = parsedRows.map(r => ({
      id: `batch_row_${r.rowIndex}`,
      zoneId: `batch_row_${r.rowIndex}`,
      locationName: r.name,
      latitude: r.lat ?? undefined,
      longitude: r.lng ?? undefined,
      radius: r.radius,
      category: r.category,
      description: r.description,
      status: 'active',
      needsLocation: r.needsLocation
    } as DangerZone));

    const candidateObj = { locationName: name, latitude: lat, longitude: lng, needsLocation };
    const duplicateMatch = 
      findLikelyDuplicate(candidateObj, existingZones) ||
      findLikelyDuplicate(candidateObj, priorParsedZones);

    if (duplicateMatch) {
      const matchName = duplicateMatch.zone.locationName || (duplicateMatch.zone as any).name || name;
      const reasonText = duplicateMatch.reason === 'both'
        ? `Duplicate matched: identical name and within ${Math.round(duplicateMatch.distanceMeters || 0)}m`
        : duplicateMatch.reason === 'name'
        ? `Duplicate matched: identical name "${matchName}"`
        : `Duplicate matched: within ${Math.round(duplicateMatch.distanceMeters || 0)}m of "${matchName}"`;
      issues.push(reasonText);
      if (rowStatus !== 'error') rowStatus = 'warning';
    }

    if (rowStatus === 'error') errCount++;
    else if (rowStatus === 'warning') warnCount++;
    else validCount++;

    if (needsLocation) needsLocCount++;

    parsedRows.push({
      rowIndex: i,
      raw: rawDict,
      name,
      lat,
      lng,
      radius,
      category,
      description,
      source,
      activeTime,
      startHour,
      endHour,
      nightCrimeCount,
      dayCrimeCount,
      crimeCount,
      crimeTypes,
      dataPeriod,
      lastIncidentDate,
      needsLocation,
      status: rowStatus,
      issues,
      duplicateOf: duplicateMatch || undefined,
      resolution: duplicateMatch ? 'skip' : undefined
    });
  }

  return {
    rows: parsedRows,
    totalRows: parsedRows.length,
    validRows: validCount,
    warningRows: warnCount,
    errorRows: errCount,
    needsLocationRows: needsLocCount
  };
}

/**
 * Splits CSV into lines taking into account multiline quotes
 */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++; // skip \n in CRLF
      }
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Parses a single CSV line into an array of string values handling quotes and commas
 */
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Generates standard downloadable CSV template with accurate Barangay Palanan sample rows
 */
export function generateCsvTemplate(): string {
  const headers = [
    'name',
    'lat',
    'lng',
    'radius',
    'category',
    'description',
    'source',
    'activeTime',
    'startHour',
    'endHour',
    'nightCrimeCount',
    'dayCrimeCount',
    'crimeTypes',
    'dataPeriod',
    'lastIncidentDate',
    'crimeCount'
  ];

  const sampleRows = [
    [
      '"Dian Street near Buendia"',
      '14.5562',
      '121.0015',
      '120',
      'Crime',
      '"High pedestrian traffic corner with reported snatching incidents"',
      'barangay_data',
      'night_only',
      '18',
      '5',
      '4',
      '1',
      '"theft:3;snatching:2"',
      '"Jan 2025 - Sep 2026"',
      '2026-09-15',
      ''
    ],
    [
      '"Arellano Avenue corner Zobel Roxas"',
      '14.5630',
      '120.9985',
      '100',
      'Poor Lighting',
      '"Dim streetlamps along alleyway"',
      'barangay_data',
      'all_day',
      '0',
      '23',
      '',
      '',
      '"harassment:2"',
      '"Jan 2025 - Sep 2026"',
      '2026-08-10',
      '2' // crimeCount used when night and day are blank
    ],
    [
      '"Palanan Elementary School Vicinity"',
      '',
      '', // Blank coords -> flagged as needsLocation
      '150',
      'Crime',
      '"School perimeter crossing - needs pinpoint on map"',
      'barangay_data',
      'day_only',
      '5',
      '18',
      '0',
      '5',
      '"theft:5"',
      '"Jan 2025 - Sep 2026"',
      '2026-09-02',
      ''
    ]
  ];

  return [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
}

/**
 * Strips all keys whose values are undefined recursively from an object payload.
 * Firestore strictly rejects undefined values with:
 * "Unsupported field value: undefined".
 * Null, empty strings, 0, false, arrays, and existing data fields like riskLevel are safely preserved.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) {
      continue; // Strip undefined key completely
    }
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      sanitized[key] = sanitizeFirestorePayload(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized as T;
}
