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
  hasValidCoordinates
} from './zoneUtils';
import {
  STUDY_AREA_BOUNDS,
  DUPLICATE_DISTANCE_METERS,
  HIGH_INCIDENT_THRESHOLD
} from './zoneConstants';
import { DangerZone } from '../types';

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

console.log(`\n========================================`);
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
