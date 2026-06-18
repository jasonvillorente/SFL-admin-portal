# Firestore Security Specification - SafeRoute Lite Admin Portal

This specification defines the security invariants, validation constraints, and threat analysis for the Firebase Firestore database shared between the Admin Portal and the Resident Application.

## 1. Data Invariants

1. **Role Enforcement**: A user profile's `role` can only be set to `resident` or `admin`. Only authenticated administrators can read/write administrative datasets or modify user status flags.
2. **Access Separation**: Residents only have permissions to view approved `danger_zones` and public `community_alerts`, and to submit/view their own standard `incident_reports`. They are forbidden from reading/writing `activity_logs` or managing other users.
3. **Danger Zone Security**: Danger zones can only be added, updated, deactivated, or deleted by authenticated admin users.
4. **Temporal Integrity**: Incoming server-side timestamps for `createdAt`, `updatedAt`, and `timestamp` must strictly match the current transaction request time (`request.time`).
5. **ID Integrity**: Document IDs must be safe alphanumeric characters up to 128 bytes to prevent injection poisoning attacks.

## 2. The "Dirty Dozen" Threat Payloads

Here are twelve payloads designed to violate system constraints, which will be rejected by the rules:

### T1: Privilege Escalation (User spoofing admin role)
* **Goal**: Resident registers or updates their own profile to become an admin.
* **Payload**: `setDoc(/users/malicious_uid, { uid: "malicious_uid", email: "attacker@gmail.com", name: "Attacker", role: "admin", active: true })`
* **Expectation**: `PERMISSION_DENIED` (cannot self-assign admin role on registration or update).

### T2: Identity Hijack (Altering other user profiles)
* **Goal**: Attacker tries to disable another admin's account.
* **Payload**: `updateDoc(/users/target_admin_uid, { active: false })` by a non-admin.
* **Expectation**: `PERMISSION_DENIED`.

### T3: Administrative Bypass (Writing danger zone as user)
* **Goal**: Resident attempts to falsify or delete a danger zone to clear out a zone they like.
* **Payload**: `deleteDoc(/danger_zones/existing_danger_zone_1)` by a resident.
* **Expectation**: `PERMISSION_DENIED`.

### T4: Rogue Hazard Generation (Injecting unverified danger zones)
* **Goal**: User writes an unverified hazard straight into the general listings to cause local panic.
* **Payload**: `addDoc(/danger_zones, { locationName: "False Alarm", riskLevel: "Critical", status: "active", category: "Crime" })` by random user.
* **Expectation**: `PERMISSION_DENIED`.

### T5: Audit Trail Manipulation (Erasing admin actions)
* **Goal**: Rogue admin or attacker tries deleting or altering `activity_logs` to cover their tracks.
* **Payload**: `deleteDoc(/activity_logs/log_sequence_uuid)` or editing log values.
* **Expectation**: `PERMISSION_DENIED`.

### T6: Fake Incident Report approvals from Client Side
* **Goal**: Resident tries approving their own submitted report directly from the client.
* **Payload**: `updateDoc(/incident_reports/report_id, { status: "approved" })` by resident.
* **Expectation**: `PERMISSION_DENIED`.

### T7: Massive Denial of Wallet Attack (Gigantic String IDs)
* **Goal**: Attacker writes a document with a 1MB junk ID string to flood the indexing system.
* **Payload**: `setDoc(/danger_zones/ <1MB character stream>, { ... })`
* **Expectation**: `PERMISSION_DENIED` due to `isValidId` size and format limit check.

### T8: Clock Tampering (Fudging timestamps)
* **Goal**: Attacker tries setting historical or extreme future creation dates.
* **Payload**: `addDoc(/community_alerts, { title: "Rogue alert", dateSent: "2077-01-01T00:00:00Z", message: "Hi", alertType: "Weater Warning", priorityLevel: "low", targetArea: "All" })`
* **Expectation**: `PERMISSION_DENIED` (dates/timestamps must match current request transaction server time).

### T9: Orphaned Incidents (Creating reports with missing profiles)
* **Goal**: Spammer tries submitting an incident with ghost parent links or unsafe schemas.
* **Payload**: `addDoc(/incident_reports, { reporter: "", status: "pending", locationName: "" })`
* **Expectation**: `PERMISSION_DENIED` due to strict schema size rules.

### T10: Fake Broadcast (Forging emergency alerts as citizen)
* **Goal**: Resident sends out a false evacuation notice text message to entire neighborhood.
* **Payload**: `addDoc(/community_alerts, { title: "Evacuate Now!", message: "Water is coming!", priorityLevel: "critical", targetArea: "All", alertType: "Emergency Notice" })` by resident.
* **Expectation**: `PERMISSION_DENIED`.

### T11: Invalid State Hijacking (Writing incorrect enum values)
* **Goal**: Attacker injects a fake risk level outside the system's definition.
* **Payload**: `addDoc(/danger_zones, { locationName: "Barangay Hall", riskLevel: "EXTREME_IMPACT", status: "active", category: "Crime" })`
* **Expectation**: `PERMISSION_DENIED`.

### T12: Stealth Data Gathering (Blanket user list parsing)
* **Goal**: Anonymous crawler executes a blanket read queries fetch on `/users` collection to scrape names/emails.
* **Query**: `getDocs(/users)` with no qualifiers.
* **Expectation**: `PERMISSION_DENIED`. Verified users have private reading only of their single specific user document, and admins can parse the rest.

## 3. Threat Verification Mapping
Every write or read attempt listed in the threats above must be guarded by strict logical constraints in `firestore.rules`.
- `isValidId(docId)` blocks T7.
- Static helper validation schema checks block T9 and T11.
- `isAdmin()` gates administrative paths, preventing T3, T4, T5, T6, T10.
- Individual document-read verification restricts user scraping profiles, blocking T12.
- `request.time` matches prevent T8.
- Restricted role definition checks block T1.
