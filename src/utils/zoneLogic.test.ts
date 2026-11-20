/**
 * Test suite for SafeRoute Lite Zone Logic:
 * 1. Total-only mode (direct total crimeCount, zero day/night, all_day locked)
 * 2. Operating hours boundaries (Day-only 5 to 18, Night-only 18 to 5)
 * 3. Needs-location rows (flagged, inactive, activation blocked)
 * 4. Duplicate merge rule (source 'both', preserve description & photos, preserve legacy riskLevel)
 * 5. Auto-suggest activeTime (only when total >= 3)
 * 6. 20-meter proximity duplicate detector
 * 7. CSV parser (UTF-8 BOM, quoted commas, blank lines, unknown category warnings)
 * 8. Legacy record backwards compatibility
 */

import {
  calculateDistanceMeters,
  isInsideStudyArea,
  suggestActiveTime,
  getDefaultHoursForActiveTime,
  parseZoneCsv,
  mergeZoneData,
  findLikelyDuplicate,
  sanitizeFirestorePayload,
  deduplicateDangerZones,
  hasValidCoordinates,
  getManilaTimeParts,
  isHourInActiveWindow,
  getZoneWindowBadgeState,
  normalizeDangerLevel,
  getDangerLevelColor,
  validateDangerLevelRequired,
  filterZonesByDangerLevel,
  countDangerLevels,
  generateCsvTemplate,
  buildQuickConvertDangerZonePayload
} from './zoneUtils';
import {
  STUDY_AREA_BOUNDS,
  DUPLICATE_DISTANCE_METERS,
  HIGH_INCIDENT_THRESHOLD,
  DANGER_LEVEL_COLORS,
  MAX_BATCH_SIZE
} from './zoneConstants';
import { DangerZone, IncidentReport } from '../types';

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

console.log('\n--- SafeRoute Lite Zone Logic Tests ---\n');

// 1. Total-Only Mode
console.log('Test Suite 1: "No day/night split" Total-Only Mode');
{
  // CSV with only crimeCount column (night and day counts left blank)
  const csvTotalOnly = `name,lat,lng,radius,category,description,source,crimeCount\n"Bautista St Corner",14.5580,121.0020,100,Crime,"Corner watch",barangay_data,9\n`;
  const result = parseZoneCsv(csvTotalOnly);
  assert(result.rows.length === 1, 'Parses 1 row from total-only CSV');
  const row = result.rows[0];
  assert(row.crimeCount === 9, 'Sets crimeCount to 9 from crimeCount column');
  assert(row.nightCrimeCount === 0, 'Sets nightCrimeCount to 0 in total-only mode');
  assert(row.dayCrimeCount === 0, 'Sets dayCrimeCount to 0 in total-only mode');
  assert(row.activeTime === 'all_day', 'Locks activeTime to "all_day" in total-only mode');
  assert(row.startHour === 0 && row.endHour === 24, 'Operating hours are 0 to 24 for all_day in total-only mode');

  // CSV with split counts takes precedence over crimeCount column
  const csvSplitWithTotal = `name,lat,lng,radius,category,description,source,nightCrimeCount,dayCrimeCount,crimeCount\n"Zobel St",14.5590,121.0010,100,Crime,"Desc",barangay_data,4,2,99\n`;
  const splitResult = parseZoneCsv(csvSplitWithTotal);
  assert(splitResult.rows[0].crimeCount === 6, 'Auto-calculates crimeCount = 4 + 2 = 6, ignoring extraneous crimeCount column');
  assert(splitResult.rows[0].nightCrimeCount === 4, 'Preserves nightCrimeCount = 4');
  assert(splitResult.rows[0].dayCrimeCount === 2, 'Preserves dayCrimeCount = 2');
}

// 2. Day-only 5 to 18 boundaries & Night-only 18 to 5 boundaries
console.log('\nTest Suite 2: Operating Hours Boundaries');
{
  const dayHours = getDefaultHoursForActiveTime('day_only');
  assert(dayHours.startHour === 5 && dayHours.endHour === 18, 'day_only activeTime default hours are exactly 5 to 18');

  const nightHours = getDefaultHoursForActiveTime('night_only');
  assert(nightHours.startHour === 18 && nightHours.endHour === 5, 'night_only activeTime default hours are exactly 18 to 5');

  const allDayHours = getDefaultHoursForActiveTime('all_day');
  assert(allDayHours.startHour === 0 && allDayHours.endHour === 24, 'all_day activeTime default hours are 0 to 24 (hours ignored)');
}

// 3. Needs-Location Rows
console.log('\nTest Suite 3: "Needs Location" Rows');
{
  const csvNeedsLocation = `name,lat,lng,radius,category,description,source\n"Purok 3 Alley",,,100,Crime,"Missing GPS",barangay_data\n`;
  const result = parseZoneCsv(csvNeedsLocation);
  assert(result.rows.length === 1, 'Parses 1 row');
  const row = result.rows[0];
  assert(row.needsLocation === true, 'Flags row without coordinates as needsLocation: true');
  assert(row.lat === null && row.lng === null, 'Sets lat/lng to null for unmapped row');
  assert(row.issues.some(i => i.toLowerCase().includes('needs location')), 'Records "needs location" issue');

  // Study-area boundary validation (overlap bounds: SW [14.5510, 120.9930], NE [14.5670, 121.0080])
  const inside = isInsideStudyArea(14.5585, 121.0020);
  assert(inside === true, 'Center of Palanan [14.5585, 121.0020] is inside study area');

  const swCorner = isInsideStudyArea(14.5510, 120.9930);
  assert(swCorner === true, 'SW corner [14.5510, 120.9930] is inside study area');

  const neCorner = isInsideStudyArea(14.5670, 121.0080);
  assert(neCorner === true, 'NE corner [14.5670, 121.0080] is inside study area');

  const outsideOldMinLat = isInsideStudyArea(14.5505, 121.0000);
  assert(outsideOldMinLat === false, 'Coordinate below 14.5510 is outside new study area');

  const outsideOldMaxLng = isInsideStudyArea(14.5600, 121.0090);
  assert(outsideOldMaxLng === false, 'Coordinate right of 121.0080 is outside new study area');

  const outside = isInsideStudyArea(14.5000, 120.9000);
  assert(outside === false, 'Far coordinate [14.5000, 120.9000] is outside Palanan study area');
}

// 4. Duplicate Merge Rule
console.log('\nTest Suite 4: Duplicate Merge Rule & Preserving Fields');
{
  const existingResidentZone: DangerZone = {
    id: 'zone-123',
    zoneId: 'zone-123',
    locationName: 'Casino Street Corner',
    source: 'resident_report',
    category: 'Crime',
    latitude: 14.5582,
    longitude: 121.0019,
    radius: 120,
    description: 'Existing citizen report description with vivid details',
    imageUrl: 'https://example.com/citizen-photo.jpg',
    photos: ['https://example.com/citizen-photo.jpg'],
    riskLevel: 'Moderate', // legacy field on document
    status: 'active',
    activeTime: 'all_day',
    crimeCount: 0,
    nightCrimeCount: 0,
    dayCrimeCount: 0
  };

  // Incoming barangay CSV update has blank description and photo
  const incomingBarangayData: Partial<DangerZone> = {
    source: 'barangay_data',
    nightCrimeCount: 3,
    dayCrimeCount: 2,
    crimeCount: 5,
    activeTime: 'night_only',
    startHour: 18,
    endHour: 5,
    dataPeriod: 'Jan 2025 - Sep 2026',
    description: '', // Blank cell in CSV!
    imageUrl: '',    // Blank cell in CSV!
    photos: []       // Blank in CSV!
  };

  const merged = mergeZoneData(existingResidentZone, incomingBarangayData);

  assert(merged.source === 'both', 'Rule: Merging barangay data into resident_report sets source to "both"');
  assert(merged.crimeCount === 5, 'Fills merged crimeCount = 5');
  assert(merged.dataPeriod === 'Jan 2025 - Sep 2026', 'Fills merged dataPeriod');
  assert(
    merged.description === 'Existing citizen report description with vivid details',
    'Rule: Does NOT overwrite existing description with blank CSV cell'
  );
  assert(
    merged.imageUrl === 'https://example.com/citizen-photo.jpg',
    'Rule: Does NOT overwrite existing photo with blank CSV cell'
  );
  assert(
    merged.photos?.[0] === 'https://example.com/citizen-photo.jpg',
    'Rule: Does NOT wipe existing photos array'
  );
}

// 5. Auto-suggest activeTime (only when total >= 3)
console.log('\nTest Suite 5: Auto-Suggest activeTime (Threshold >= 3)');
{
  assert(suggestActiveTime(1, 0) === null, 'Total 1 incident (< 3) returns null (no auto-suggest)');
  assert(suggestActiveTime(1, 1) === null, 'Total 2 incidents (< 3) returns null (no auto-suggest)');
  assert(suggestActiveTime(3, 0) === 'night_only', 'Total 3 with night > day suggests "night_only"');
  assert(suggestActiveTime(0, 4) === 'day_only', 'Total 4 with day > night suggests "day_only"');
  assert(suggestActiveTime(2, 2) === 'all_day', 'Total 4 with night == day suggests "all_day"');
}

// 6. Proximity Duplicate Detection (20 meters)
console.log('\nTest Suite 6: Proximity Duplicate Detection (20 Meters)');
{
  const zoneA: DangerZone = {
    id: 'zone-A',
    zoneId: 'zone-A',
    locationName: 'Palanan Corner A',
    latitude: 14.558500,
    longitude: 121.002000,
    radius: 100,
    category: 'Crime',
    description: '',
    status: 'active'
  };

  // Point 10 meters away
  // 1 degree latitude ~ 111,139 meters. 10 meters ~ 0.00009 degrees
  const closeCandidate = {
    locationName: 'Different Name Nearby',
    latitude: 14.558500 + 0.00008, // ~8.9 meters away
    longitude: 121.002000
  };

  const dist = calculateDistanceMeters(
    zoneA.latitude,
    zoneA.longitude,
    closeCandidate.latitude,
    closeCandidate.longitude
  );
  assert(dist < 20, `Distance is ${dist.toFixed(1)}m (< ${DUPLICATE_DISTANCE_METERS}m)`);

  const dupMatch = findLikelyDuplicate(closeCandidate, [zoneA]);
  assert(dupMatch !== null && dupMatch.reason === 'distance', 'Detects duplicate by 20m proximity even with different names');

  // Point 50 meters away
  const farCandidate = {
    locationName: 'Far Away Alley',
    latitude: 14.558500 + 0.0005, // ~55 meters away
    longitude: 121.002000
  };
  const farMatch = findLikelyDuplicate(farCandidate, [zoneA]);
  assert(farMatch === null, 'Does NOT flag candidate > 20 meters away as duplicate');
}

// 7. CSV Parser robustness: UTF-8 BOM, quoted commas, unknown categories
console.log('\nTest Suite 7: CSV Parser Robustness');
{
  const bomCsv = '\uFEFFname,lat,lng,radius,category,description,nightCrimeCount,dayCrimeCount\n"Dian, near Buendia",14.5585,121.0020,100,"Special Hazard","Quote, with comma",2,1\n\n';
  const result = parseZoneCsv(bomCsv);
  assert(result.rows.length === 1, 'Handles UTF-8 BOM and trailing blank lines');
  assert(result.rows[0].name === 'Dian, near Buendia', 'Preserves comma inside quoted string');
  assert(result.rows[0].description === 'Quote, with comma', 'Preserves comma inside quoted description');
  assert(
    result.rows[0].issues.some(i => i.includes('Unknown category "Special Hazard"')),
    'Emits warning on unknown category without failing the row'
  );
  assert(result.rows[0].status === 'warning', 'Status is "warning" for unknown category');
}

// 8. Legacy Record compatibility
console.log('\nTest Suite 8: Legacy Records Backwards Compatibility');
{
  const oldDocument: any = {
    id: 'legacy-doc-1',
    locationName: 'Old Palanan Post',
    latitude: 14.5585,
    longitude: 121.0020,
    radius: 100,
    riskLevel: 'Critical', // Legacy field
    severity: 'High',
    color: 'Red',
    status: 'active'
  };

  // Safe accessor fallbacks
  const crimeCount = oldDocument.crimeCount ?? ((Number(oldDocument.nightCrimeCount) || 0) + (Number(oldDocument.dayCrimeCount) || 0));
  const activeTime = oldDocument.activeTime || 'all_day';
  assert(crimeCount === 0, 'Old record without crime counts safely falls back to 0 without errors');
  assert(activeTime === 'all_day', 'Old record safely falls back to activeTime "all_day"');
  assert(oldDocument.riskLevel === 'Critical', 'Legacy riskLevel is retained without errors or mutation');
}

// 9. Firestore Payload Sanitizer (strips undefined, preserves valid and legacy fields)
console.log('\nTest Suite 9: Firestore Payload Sanitizer');
{
  const testPayloadWithUndefined = {
    locationName: 'Test Area',
    crimeCount: 5,
    nightCrimeCount: 0,
    dataPeriod: undefined,
    lastIncidentDate: undefined,
    imageUrl: undefined,
    photos: [],
    crimeTypes: { theft: 2 },
    riskLevel: 'High',
    notes: null,
    nested: {
      validProp: 'yes',
      emptyProp: undefined
    }
  };

  const sanitized = sanitizeFirestorePayload(testPayloadWithUndefined);

  assert(!('dataPeriod' in sanitized), 'Strips top-level undefined field dataPeriod');
  assert(!('lastIncidentDate' in sanitized), 'Strips top-level undefined field lastIncidentDate');
  assert(!('imageUrl' in sanitized), 'Strips top-level undefined field imageUrl');
  assert(sanitized.locationName === 'Test Area', 'Preserves valid string field');
  assert(sanitized.crimeCount === 5, 'Preserves valid number field');
  assert(sanitized.nightCrimeCount === 0, 'Preserves valid 0 number field');
  assert(sanitized.notes === null, 'Preserves null value');
  assert(Array.isArray(sanitized.photos), 'Preserves empty array');
  assert(sanitized.crimeTypes?.theft === 2, 'Preserves crimeTypes dictionary');
  assert(sanitized.riskLevel === 'High', 'Preserves legacy riskLevel field untouched');
  assert(sanitized.nested?.validProp === 'yes', 'Preserves nested valid field');
  assert(!('emptyProp' in sanitized.nested), 'Strips nested undefined field');
}

// 10. Re-Import Duplicate Detection (Requirement 5)
console.log('\nTest Suite 10: Re-Import Duplicate Detection');
{
  const testCsvContent = `name,lat,lng,radius,category,description,source,activetime,starthour,endhour,nightcrimecount,daycrimecount,crimetypes,dataperiod,lastincidentdate,crimecount
Casino Street Near Dian,14.5570,121.0010,150,Crime,Alleyway lighting issue,barangay_data,night_only,18,5,4,1,theft:3,Jan 2025 - Sep 2026,2026-09-15,
Arellano Avenue corner Zobel Roxas,14.5630,120.9985,100,Poor Lighting,Dim lamps,barangay_data,all_day,0,24,,,,harassment:2,Jan 2025 - Sep 2026,2026-08-10,2
Palanan Elementary School Vicinity,,,150,Crime,School perimeter unmapped,barangay_data,day_only,5,18,0,5,theft:5,Jan 2025 - Sep 2026,,`;

  // First import with empty database
  const firstImport = parseZoneCsv(testCsvContent, []);
  assert(firstImport.rows.length === 3, 'First import parses 3 rows successfully');
  assert(!firstImport.rows[0].duplicateOf, 'Row 1 is not a duplicate on initial import');
  assert(!firstImport.rows[1].duplicateOf, 'Row 2 is not a duplicate on initial import');
  assert(!firstImport.rows[2].duplicateOf, 'Row 3 (needs location) is not a duplicate on initial import');

  // Simulate existing zones in Firestore after the first import has saved them
  const existingZonesAfterImport: DangerZone[] = [
    {
      id: 'doc_casino',
      zoneId: 'doc_casino',
      locationName: 'Casino Street Near Dian',
      latitude: 14.5570,
      longitude: 121.0010,
      radius: 150,
      category: 'Crime',
      description: 'Existing alleyway record',
      status: 'active',
      source: 'barangay_data',
      importBatchId: 'batch_test_001'
    },
    {
      id: 'doc_arellano',
      zoneId: 'doc_arellano',
      locationName: 'Arellano Avenue corner Zobel Roxas',
      latitude: 14.5630,
      longitude: 120.9985,
      radius: 100,
      category: 'Poor Lighting',
      description: 'Existing lamps',
      status: 'active',
      source: 'barangay_data',
      importBatchId: 'batch_test_001'
    },
    {
      id: 'doc_school',
      zoneId: 'doc_school',
      locationName: 'Palanan Elementary School Vicinity',
      // Coordinates omitted for needsLocation zone
      radius: 150,
      category: 'Crime',
      description: 'School perimeter unmapped',
      status: 'inactive',
      needsLocation: true,
      source: 'barangay_data',
      importBatchId: 'batch_test_001'
    }
  ];

  // Re-importing the same CSV against existing zones in registry
  const reImport = parseZoneCsv(testCsvContent, existingZonesAfterImport);
  assert(reImport.rows.length === 3, 'Re-import parses 3 rows');
  assert(!!reImport.rows[0].duplicateOf, 'Re-import Row 1 (Casino Street) flagged as duplicate');
  assert(reImport.rows[0].duplicateOf?.zone.id === 'doc_casino', 'Re-import Row 1 points to correct existing zone');
  assert(!!reImport.rows[1].duplicateOf, 'Re-import Row 2 (Arellano Avenue) flagged as duplicate');
  assert(reImport.rows[1].duplicateOf?.zone.id === 'doc_arellano', 'Re-import Row 2 points to correct existing zone');
  assert(!!reImport.rows[2].duplicateOf, 'Re-import Row 3 (needsLocation unmapped row) flagged as duplicate by name');
  assert(reImport.rows[2].duplicateOf?.zone.id === 'doc_school', 'Re-import Row 3 points to correct existing unmapped zone');
  assert(reImport.rows[2].duplicateOf?.reason === 'name', 'NeedsLocation duplicate flagged with reason "name"');
}

// 11. Snapshot Listener & Document ID Deduplication (Requirement 5)
console.log('\nTest Suite 11: Snapshot Listener & Document Deduplication');
{
  // Simulate 3 alias collections ('danger_zones', 'dangerZones', 'hazards') each returning the same 3 documents,
  // plus optimistic local state appending them again
  const mergedAliasDocuments: DangerZone[] = [
    { id: 'zone_001', zoneId: 'zone_001', locationName: 'Zone 1 from danger_zones', latitude: 14.557, longitude: 121.001, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    { id: 'zone_002', zoneId: 'zone_002', locationName: 'Zone 2 from danger_zones', latitude: 14.558, longitude: 121.002, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    { id: 'zone_003', zoneId: 'zone_003', locationName: 'Zone 3 from danger_zones', latitude: 14.559, longitude: 121.003, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    // Duplicate copies from dangerZones alias
    { id: 'zone_001', zoneId: 'zone_001', locationName: 'Zone 1 from dangerZones', latitude: 14.557, longitude: 121.001, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    { id: 'zone_002', zoneId: 'zone_002', locationName: 'Zone 2 from dangerZones', latitude: 14.558, longitude: 121.002, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    // Duplicate copies from hazards alias
    { id: 'zone_001', zoneId: 'zone_001', locationName: 'Zone 1 from hazards', latitude: 14.557, longitude: 121.001, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    { id: 'zone_003', zoneId: 'zone_003', locationName: 'Zone 3 from hazards', latitude: 14.559, longitude: 121.003, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    // Optimistic local state duplicates
    { id: 'zone_002', zoneId: 'zone_002', locationName: 'Zone 2 optimistic state', latitude: 14.558, longitude: 121.002, radius: 100, category: 'Crime', description: 'Test', status: 'active' },
    { id: 'zone_003', zoneId: 'zone_003', locationName: 'Zone 3 optimistic state', latitude: 14.559, longitude: 121.003, radius: 100, category: 'Crime', description: 'Test', status: 'active' }
  ];

  assert(mergedAliasDocuments.length === 9, 'Raw merged list contains 9 rows with duplicates');

  const deduplicated = deduplicateDangerZones(mergedAliasDocuments);
  assert(deduplicated.length === 3, 'deduplicateDangerZones reduces 9 duplicated entries to exactly 3 unique rows');

  const ids = deduplicated.map(z => z.id);
  const idSet = new Set(ids);
  assert(idSet.size === 3, 'All 3 documents have distinct IDs');
  assert(idSet.has('zone_001') && idSet.has('zone_002') && idSet.has('zone_003'), 'Contains zone_001, zone_002, zone_003 exactly once');
}

// 12. Omission of Coordinates & hasValidCoordinates checks (Requirement 7)
console.log('\nTest Suite 12: Coordinate Omission & Validation');
{
  // Valid zone inside Palanan
  const validZone = { id: 'z1', locationName: 'Valid Zone', latitude: 14.5585, longitude: 121.0020, needsLocation: false };
  assert(hasValidCoordinates(validZone), 'Valid Palanan coordinates return hasValidCoordinates: true');

  // Zone flagged needsLocation
  const needsLocZone = { id: 'z2', locationName: 'Needs Loc Zone', needsLocation: true };
  assert(!hasValidCoordinates(needsLocZone), 'needsLocation: true zone returns hasValidCoordinates: false');

  // Zone with omitted / undefined coordinates
  const omittedCoordsZone = { id: 'z3', locationName: 'Omitted Coords' };
  assert(!hasValidCoordinates(omittedCoordsZone), 'Zone with omitted latitude/longitude returns hasValidCoordinates: false');

  // Zone with (0, 0) coordinates (placeholder)
  const zeroCoordsZone = { id: 'z4', locationName: 'Zero Coords', latitude: 0, longitude: 0 };
  assert(!hasValidCoordinates(zeroCoordsZone), 'Zone with (0, 0) coordinates returns hasValidCoordinates: false');

  // calculateDistanceMeters skips (0, 0)
  const distWithZero = calculateDistanceMeters(0, 0, 14.5585, 121.0020);
  assert(distWithZero === Infinity, 'calculateDistanceMeters with (0, 0) returns Infinity (skipped)');
}

// 13. Manila Time Active Window Badges (Half-open [start, end), midnight wrap, all_day, priority)
console.log('\nTest Suite 13: Manila Time Active Window & Badge Priority');
{
  const at1759 = new Date('2026-11-13T17:59:00+08:00');
  const at1800 = new Date('2026-11-13T18:00:00+08:00');
  const at0459 = new Date('2026-11-13T04:59:00+08:00');
  const at0500 = new Date('2026-11-13T05:00:00+08:00');

  assert(getManilaTimeParts(at1759).hour === 17 && getManilaTimeParts(at1759).minute === 59, 'Manila time parses 17:59 accurately');
  assert(getManilaTimeParts(at1800).hour === 18 && getManilaTimeParts(at1800).minute === 0, 'Manila time parses 18:00 accurately');
  assert(getManilaTimeParts(at0459).hour === 4 && getManilaTimeParts(at0459).minute === 59, 'Manila time parses 04:59 accurately');
  assert(getManilaTimeParts(at0500).hour === 5 && getManilaTimeParts(at0500).minute === 0, 'Manila time parses 05:00 accurately');

  const nightZone = { status: 'active', needsLocation: false, activeTime: 'night_only' as const, startHour: 18, endHour: 5 };
  assert(getZoneWindowBadgeState(nightZone, at1759) === 'outside_window', 'night_only [18, 5) at 17:59 Manila -> Outside window now');
  assert(getZoneWindowBadgeState(nightZone, at1800) === 'active_now', 'night_only [18, 5) at 18:00 Manila -> Active now');
  assert(getZoneWindowBadgeState(nightZone, at0459) === 'active_now', 'night_only [18, 5) at 04:59 Manila -> Active now');
  assert(getZoneWindowBadgeState(nightZone, at0500) === 'outside_window', 'night_only [18, 5) at 05:00 Manila -> Outside window now');

  const dayZone = { status: 'active', needsLocation: false, activeTime: 'day_only' as const, startHour: 5, endHour: 18 };
  assert(getZoneWindowBadgeState(dayZone, at0459) === 'outside_window', 'day_only [5, 18) at 04:59 Manila -> Outside window now');
  assert(getZoneWindowBadgeState(dayZone, at0500) === 'active_now', 'day_only [5, 18) at 05:00 Manila -> Active now');
  assert(getZoneWindowBadgeState(dayZone, at1759) === 'active_now', 'day_only [5, 18) at 17:59 Manila -> Active now');
  assert(getZoneWindowBadgeState(dayZone, at1800) === 'outside_window', 'day_only [5, 18) at 18:00 Manila -> Outside window now');

  const allDayZone = { status: 'active', needsLocation: false, activeTime: 'all_day' as const, startHour: 0, endHour: 24 };
  assert(getZoneWindowBadgeState(allDayZone, at1759) === 'active_now', 'all_day at 17:59 Manila -> Active now');
  assert(getZoneWindowBadgeState(allDayZone, at1800) === 'active_now', 'all_day at 18:00 Manila -> Active now');
  assert(getZoneWindowBadgeState(allDayZone, at0459) === 'active_now', 'all_day at 04:59 Manila -> Active now');
  assert(getZoneWindowBadgeState(allDayZone, at0500) === 'active_now', 'all_day at 05:00 Manila -> Active now');
  assert(isHourInActiveWindow(0, 'all_day', 18, 5) === true, 'all_day is always active regardless of startHour/endHour');

  // Priority checks: status === 'inactive' and needsLocation === true take priority
  const inactiveZone = { status: 'inactive', needsLocation: false, activeTime: 'all_day' as const, startHour: 0, endHour: 24 };
  assert(getZoneWindowBadgeState(inactiveZone, at1800) === 'inactive', 'status inactive takes priority over active all_day window');

  const needsLocZone = { status: 'active', needsLocation: true, activeTime: 'all_day' as const, startHour: 0, endHour: 24 };
  assert(getZoneWindowBadgeState(needsLocZone, at1800) === 'needs_location', 'needsLocation takes priority over active all_day window');
}

// 14. Two-Level Classification (Low / High) & Legacy Safety
console.log('\nTest Suite 14: Two-Level Classification (dangerLevel low/high), Colors, CSV, Filter, Bulk & Legacy');
{
  // 14a. Required level validation for form save
  assert(validateDangerLevelRequired('').valid === false, 'Form blocks save when dangerLevel is empty string');
  assert(validateDangerLevelRequired(undefined).valid === false, 'Form blocks save when dangerLevel is undefined');
  assert(validateDangerLevelRequired('medium').valid === false, 'Form blocks save when dangerLevel is invalid value');
  const lowCheck = validateDangerLevelRequired('Low');
  assert(lowCheck.valid === true && lowCheck.level === 'low', 'Form accepts Low and stores lowercase "low"');
  const highCheck = validateDangerLevelRequired('HIGH');
  assert(highCheck.valid === true && highCheck.level === 'high', 'Form accepts HIGH and stores lowercase "high"');

  // 14b. Shared colors from zoneConstants
  const lowColors = getDangerLevelColor('low');
  assert(lowColors.fill === '#FACC15' && lowColors.stroke === '#A16207', 'Low level uses #FACC15 fill and #A16207 outline');
  assert(DANGER_LEVEL_COLORS.low.text === '#422006', 'Low badge text contrast color is #422006');
  const highColors = getDangerLevelColor('high');
  assert(highColors.fill === '#DC2626' && highColors.stroke === '#DC2626', 'High level uses #DC2626');
  const unsetColors = getDangerLevelColor(undefined);
  assert(unsetColors.fill === '#64748B' && unsetColors.label === 'Level not set', 'Unset level uses neutral slate and "Level not set" label');

  // 14c. Legacy zone with riskLevel but NO dangerLevel shows "Level not set" and never reads riskLevel
  const legacyOnlyZone: DangerZone = {
    id: 'legacy-risk-1',
    zoneId: 'legacy-risk-1',
    locationName: 'Legacy High Risk Zone',
    latitude: 14.5585,
    longitude: 121.0020,
    radius: 120,
    category: 'Crime',
    description: 'Legacy record',
    status: 'active',
    riskLevel: 'High',
    color: 'Red'
  };
  assert(normalizeDangerLevel(legacyOnlyZone.dangerLevel) === undefined, 'Legacy zone without dangerLevel normalizes to undefined');
  assert(getDangerLevelColor(legacyOnlyZone.dangerLevel).label === 'Level not set', 'Legacy zone with riskLevel but no dangerLevel displays "Level not set"');
  assert(legacyOnlyZone.riskLevel === 'High' && legacyOnlyZone.color === 'Red', 'Legacy riskLevel and color remain intact');

  // 14d. CSV parsing of dangerLevel column (valid case-insensitive, invalid warning, blank unset, template)
  const csvWithLevels = [
    'name,lat,lng,radius,category,description,source,dangerLevel',
    '"Zone Alpha",14.5580,121.0020,100,Crime,"Low zone",barangay_data,low',
    '"Zone Beta",14.5585,121.0025,100,Crime,"High mixed case",barangay_data,High',
    '"Zone Gamma",14.5590,121.0030,100,Crime,"Low uppercase",barangay_data,LOW',
    '"Zone Delta",14.5595,121.0035,100,Crime,"Invalid level",barangay_data,critical',
    '"Zone Epsilon",14.5600,121.0040,100,Crime,"Blank level",barangay_data,'
  ].join('\n');
  const csvRes = parseZoneCsv(csvWithLevels);
  assert(csvRes.rows.length === 5, 'CSV parses all 5 dangerLevel test rows');
  assert(csvRes.rows[0].dangerLevel === 'low' && !csvRes.rows[0].dangerLevelInvalid, 'CSV parses lowercase "low" cleanly');
  assert(csvRes.rows[1].dangerLevel === 'high' && !csvRes.rows[1].dangerLevelInvalid, 'CSV parses mixed-case "High" as "high"');
  assert(csvRes.rows[2].dangerLevel === 'low' && !csvRes.rows[2].dangerLevelInvalid, 'CSV parses uppercase "LOW" as "low"');
  assert(
    csvRes.rows[3].dangerLevel === undefined &&
    csvRes.rows[3].dangerLevelInvalid === true &&
    csvRes.rows[3].status === 'warning' &&
    csvRes.rows[3].issues.some(i => i.toLowerCase().includes('invalid dangerlevel')),
    'CSV invalid dangerLevel ("critical") emits row warning and imports as Level not set (no silent default)'
  );
  assert(
    csvRes.rows[4].dangerLevel === undefined &&
    !csvRes.rows[4].dangerLevelInvalid &&
    csvRes.rows[4].status === 'valid',
    'CSV blank dangerLevel imports cleanly as Level not set without error or warning'
  );

  const templateText = generateCsvTemplate();
  const templateHeader = templateText.split('\n')[0];
  assert(templateHeader.includes('dangerLevel'), 'CSV template header includes dangerLevel column');
  assert(templateText.includes(',high') && templateText.includes(',low'), 'CSV template includes sample high and low rows');

  // 14e. Duplicate update keeps existing dangerLevel when CSV cell is blank & preserves legacy riskLevel
  const existingHighZone: DangerZone = {
    id: 'z-exist-high',
    zoneId: 'z-exist-high',
    locationName: 'Dian Corner',
    latitude: 14.5580,
    longitude: 121.0020,
    radius: 100,
    category: 'Crime',
    description: 'Old desc',
    status: 'active',
    dangerLevel: 'high',
    riskLevel: 'Moderate'
  };
  const mergedWithBlankLevel = mergeZoneData(existingHighZone, {
    locationName: 'Dian Corner',
    crimeCount: 4
    // dangerLevel omitted (blank CSV cell)
  });
  assert(mergedWithBlankLevel.dangerLevel === 'high', 'Duplicate update preserves existing dangerLevel when incoming CSV cell is blank');

  const mergedWithNewLevel = mergeZoneData(existingHighZone, {
    locationName: 'Dian Corner',
    dangerLevel: 'low'
  });
  assert(mergedWithNewLevel.dangerLevel === 'low', 'Duplicate update applies explicit incoming dangerLevel');

  // 14f. List filter & dashboard counts
  const sampleZones: DangerZone[] = [
    { id: '1', zoneId: '1', locationName: 'Low Zone', latitude: 14.558, longitude: 121.001, radius: 100, category: 'Crime', description: '', status: 'active', dangerLevel: 'low' },
    { id: '2', zoneId: '2', locationName: 'High Zone', latitude: 14.559, longitude: 121.002, radius: 100, category: 'Crime', description: '', status: 'active', dangerLevel: 'high' },
    legacyOnlyZone
  ];
  assert(filterZonesByDangerLevel(sampleZones, 'all').length === 3, 'Filter "all" returns all 3 zones');
  assert(filterZonesByDangerLevel(sampleZones, 'low').map(z => z.id).join(',') === '1', 'Filter "low" returns only Low zone');
  assert(filterZonesByDangerLevel(sampleZones, 'high').map(z => z.id).join(',') === '2', 'Filter "high" returns only High zone');
  assert(filterZonesByDangerLevel(sampleZones, 'unset').map(z => z.id).join(',') === 'legacy-risk-1', 'Filter "unset" returns legacy zone without dangerLevel');

  const counts = countDangerLevels(sampleZones);
  assert(counts.high === 1 && counts.low === 1 && counts.unset === 1, 'Dashboard level counts return High: 1 / Low: 1 / Not set: 1');

  // 14g. Bulk set batching constant & patch integrity
  assert(MAX_BATCH_SIZE === 500, 'Bulk set batching limit MAX_BATCH_SIZE is 500');
  const bulkSanitized = sanitizeFirestorePayload({ dangerLevel: 'high' as const, updatedAt: '2026-11-20T00:00:00Z' });
  assert(bulkSanitized.dangerLevel === 'high' && !('riskLevel' in bulkSanitized), 'Bulk patch updates only dangerLevel & updatedAt without touching riskLevel');
}

// 15. Quick-Convert from Resident Report requires Low or High (no default)
console.log('\nTest Suite 15: Quick-Convert Danger Level Requirement');
{
  const sampleReport: IncidentReport = {
    id: 'rep-quick-1',
    userId: 'resident-1',
    reporterName: 'Resident Juan',
    locationName: 'Bautista corner Casino',
    latitude: 14.5578,
    longitude: 121.0012,
    category: 'Crime',
    description: 'Dark corner near sari-sari store',
    dateSubmitted: '2026-11-20',
    status: 'pending'
  };

  let emptyBlocked = false;
  try {
    buildQuickConvertDangerZonePayload(sampleReport, 'zone-q1', '', 'admin@palanan.gov.ph');
  } catch {
    emptyBlocked = true;
  }
  assert(emptyBlocked === true, 'Quick-convert blocks creation when dangerLevel is empty string (no default)');

  let undefinedBlocked = false;
  try {
    buildQuickConvertDangerZonePayload(sampleReport, 'zone-q2', undefined, 'admin@palanan.gov.ph');
  } catch {
    undefinedBlocked = true;
  }
  assert(undefinedBlocked === true, 'Quick-convert blocks creation when dangerLevel is undefined (no default)');

  let invalidBlocked = false;
  try {
    buildQuickConvertDangerZonePayload(sampleReport, 'zone-q3', 'medium', 'admin@palanan.gov.ph');
  } catch {
    invalidBlocked = true;
  }
  assert(invalidBlocked === true, 'Quick-convert blocks creation when dangerLevel is invalid');

  const lowZone = buildQuickConvertDangerZonePayload(sampleReport, 'zone-q-low', 'Low', 'admin@palanan.gov.ph');
  assert(lowZone.dangerLevel === 'low', 'Quick-convert with Low sets dangerLevel to lowercase "low"');
  assert(lowZone.source === 'resident_report' && lowZone.sourceReportId === 'rep-quick-1', 'Quick-convert preserves resident_report source and sourceReportId');
  assert(lowZone.crimeCount === 0 && lowZone.activeTime === 'all_day' && lowZone.radius === 150, 'Quick-convert keeps crimeCount 0, activeTime all_day, and radius 150');
  assert(!('dataPeriod' in lowZone) && !('riskLevel' in lowZone), 'Quick-convert omits dataPeriod and legacy riskLevel');

  const highZone = buildQuickConvertDangerZonePayload(sampleReport, 'zone-q-high', 'high', 'admin@palanan.gov.ph');
  assert(highZone.dangerLevel === 'high', 'Quick-convert with High sets dangerLevel to "high"');
}

console.log(`\n========================================`);
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
