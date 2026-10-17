# Checkpoint System Test Matrix

This document outlines the functional and system-level testing scenarios for the **Checkpoint: QR-Based Event RSVP and Attendance Management System**. Its primary purpose is to ensure the reliability, accuracy, and usability of the platform across all core user journeys before deployment.

| Module / Functional Area | UI / E2E Tests | API Endpoint Tests | Total Scenarios |
|---|---|---|---|
| **1. Authentication & Role Authorization** | 4 | 2 | 6 |
| **2. Attendee RSVP & Ticket Issuance** | 4 | 2 | 6 |
| **3. Main Entry Checkpoint Verification** | 5 | 3 | 8 |
| **4. Sub-Activity, Workshop & Booth Tracking** | 3 | 2 | 5 |
| **5. Event Workflows (Multi-Day & Multi-Stop)** | 3 | 2 | 5 |
| **6. Real-Time Dashboard & Traffic Analytics** | 3 | 2 | 5 |
| **7. Attendance Report Generation & Export** | 2 | 2 | 4 |
| **Total** | **24** | **15** | **39** |

---

## Module 1: Authentication & Role Authorization

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **LOG-UI-01** | P0 | Successful Organizer / Admin Login | 1. Open `/login`<br>2. Input valid registered email and password<br>3. Click "Sign In" | Email: `organizer@example.com`<br>Password: `SecurePassword123!` | Authenticates successfully, stores JWT token securely, and redirects user to Organizer Dashboard (`/dashboard`) displaying user badge (`ORGANIZER`). | - | PENDING |
| **LOG-UI-02** | P0 | Invalid Credentials Rejection | 1. Open `/login`<br>2. Enter registered email with incorrect password<br>3. Click "Sign In" | Email: `organizer@example.com`<br>Password: `WrongPassword999!` | Prevents login, remains on `/login`, clears password input, and displays error banner: "Invalid email or password". | - | PENDING |
| **AUTH-UI-03** | P1 | Role-Based Access Control (RBAC) Route Guard | 1. Log in with `STAFF` account credentials<br>2. Manually enter restricted Organizer URL in browser (`/events/create` or `/admin/users`) | Role: `STAFF`<br>Target Route: `/events/create` | Angular Route Guard blocks access, redirects to `/unauthorized` (or scanner dashboard), and displays message: "Access Denied: Insufficient permissions". | - | PENDING |
| **PRF-UI-04** | P1 | Session Restoration & Profile Retrieval | 1. Log in with active credentials<br>2. Refresh page or navigate to `/profile`<br>3. Observe header profile and session state | Active Bearer Token in storage | Session persists across page reload without re-prompting login; fetches and renders current user profile (`John Doe`, `ORGANIZER`) from `/auth/me`. | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/auth/login` | `POST` | P0 | Valid User Credentials Login | **Headers:**<br>`Content-Type: application/json`<br><br>**Payload:**<br>`{ "email": "organizer@example.com", "password": "SecurePassword123!" }` | **200 OK**<br>`{ "success": true, "statusCode": 200, "message": "Authentication successful", "data": { "token": "eyJhbGciOi...", "expiresIn": 86400, "user": { "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "email": "organizer@example.com", "fullName": "John Doe", "role": "ORGANIZER", "isActive": true } } }` | PENDING |
| `/api/v1/auth/login` | `POST` | P0 | Invalid Password or Unregistered User | **Headers:**<br>`Content-Type: application/json`<br><br>**Payload:**<br>`{ "email": "organizer@example.com", "password": "WrongPassword!" }` | **401 Unauthorized**<br>`{ "success": false, "statusCode": 401, "error": "UNAUTHORIZED", "message": "Invalid email or password", "details": [] }` | PENDING |

---

## Module 2: Attendee RSVP & Ticket Issuance

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **REG-UI-01** | P0 | Successful Attendee RSVP Registration | 1. Open public event landing page `/events/tech-summit-2026/register`<br>2. Input First Name, Last Name, Email, Student ID, Affiliation<br>3. Click "Complete RSVP" | Name: "Alen Mikel Umandal"<br>Email: `amc.umandal@gmail.com`<br>ID: `2023-01982-MN-0`<br>Type: `STUDENT` | Displays confirmation screen with issued Ticket Code (`CHK-...`) and renders high-res downloadable QR code. | - | PENDING |
| **REG-UI-02** | P1 | Duplicate Email Prevention | 1. Attempt RSVP using an email already registered for the event | Email: `amc.umandal@gmail.com` | Prevents submission, displays warning: "An active registration with this email already exists." | - | PENDING |
| **REG-UI-03** | P1 | Student ID & Email Format Validation | 1. Input invalid email format (e.g. missing `@` or domain)<br>2. Input empty Student ID | Email: `invalid-email-string`<br>ID: `""` | Highlights inputs with validation errors: "Please provide a valid email address." | - | PENDING |
| **REG-UI-04** | P2 | Digital Ticket Retrieval by Code | 1. Navigate to `/tickets/lookup`<br>2. Enter ticket code `CHK-2026-9812A`<br>3. Click "Find Ticket" | Code: `CHK-2026-9812A` | Displays attendee verification status, QR code display, and event schedule details. | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/events/:id/register` | `POST` | P0 | Valid New RSVP | `{ "firstName": "Alen", "lastName": "Umandal", "email": "alen@p.ph", "studentOrIdNumber": "2023-01982-MN-0", "ticketType": "STUDENT" }` | **201 Created**<br>`{ "success": true, "data": { "ticketCode": "CHK-2026-9812A", "qrPayload": "CHK:..." } }` | PENDING |
| `/api/v1/events/:id/register` | `POST` | P1 | Duplicate Email Registration | Same email payload submitted a second time | **409 Conflict**<br>`{ "success": false, "error": "DUPLICATE_REGISTRATION" }` | PENDING |

---

## Module 3: Main Entry Checkpoint Verification

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **SCAN-UI-01** | P0 | Valid First-Time Main Entry QR Scan | 1. Open scanner view (`/scanner`)<br>2. Select active station: "Main Entrance Gate A" (`MAIN_ENTRY`)<br>3. Point camera at valid attendee QR code | Checkpoint: `Main Entrance Gate A`<br>Ticket: `CHK-2026-9812A` | Screen flashes green, displays "Check-in Successful", renders attendee profile ("Alen Mikel Umandal", `STUDENT`, `2023-01982-MN-0`), and increments gate counter. | - | PENDING |
| **SCAN-UI-02** | P0 | Duplicate Scan Prevention (Single-Scan Gate) | 1. Attempt to scan an attendee ticket that has already checked in at the main gate | Checkpoint: `MAIN_ENTRY`<br>Ticket: `CHK-2026-9812A` (already checked in) | Screen flashes red alert: "Duplicate Scan - Already Checked In", displays the initial check-in timestamp (`firstScannedAt`), and prevents re-entry. | - | PENDING |
| **SCAN-UI-03** | P1 | Invalid / Unrecognized QR Code | 1. Point camera at an external, forged, or unassociated QR code | QR Payload: `https://malicious-or-unknown.com/fake` | UI displays warning: "Invalid Ticket: Code does not belong to this event", does not record entry, and resets scanner view. | - | PENDING |
| **SCAN-UI-04** | P1 | Manual Ticket Code Fallback Check-In | 1. Attendee presents damaged or unreadable screen<br>2. Staff clicks "Manual Code Entry"<br>3. Types ticket code `CHK-2026-9812A` and clicks "Submit Check-In" | Ticket Code: `CHK-2026-9812A` | System queries ticket status, validates entry eligibility, marks attendee checked in, and renders standard green confirmation card. | - | PENDING |
| **SCAN-UI-05** | P2 | Real-Time Station Recent Scans Stream | 1. Complete multiple attendee scans at the station<br>2. Observe the "Recent Scans" history feed below viewfinder | Consecutive valid & duplicate scans | Recent scans log updates dynamically in real-time with attendee names, ticket codes, status badges (`SUCCESS` / `DUPLICATE`), and relative timestamps ("Just now"). | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/checkpoints/:id/scan` | `POST` | P0 | Valid Main Entry Check-In | **Headers:**<br>`Authorization: Bearer <STAFF_JWT>`<br>`Content-Type: application/json`<br><br>**Payload:**<br>`{ "ticketCode": "CHK-2026-9812A", "deviceInfo": "Scanner Station #1 - iPad Air Safari", "notes": "" }` | **200 OK**<br>`{ "success": true, "statusCode": 200, "message": "Check-in successful", "data": { "scanResult": "SUCCESS", "scannedAt": "2026-11-15T08:14:22.000Z", "checkpoint": { "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "name": "Main Entrance Gate A", "type": "MAIN_ENTRY" }, "attendee": { "fullName": "Alen Mikel Umandal", "studentId": "2023-01982-MN-0", "ticketType": "STUDENT", "status": "CONFIRMED" } } }` | PENDING |
| `/api/v1/checkpoints/:id/scan` | `POST` | P0 | Duplicate Scan on Single-Scan Checkpoint | **Headers:**<br>`Authorization: Bearer <STAFF_JWT>`<br>`Content-Type: application/json`<br><br>**Payload:**<br>Duplicate scan with ticket `CHK-2026-9812A` on checkpoint with `allowMultipleScans: false` | **409 Conflict**<br>`{ "success": false, "statusCode": 409, "error": "DUPLICATE_SCAN", "message": "Attendee has already checked in at this checkpoint.", "data": { "scanResult": "DUPLICATE", "firstScannedAt": "2026-11-15T08:14:22.000Z", "attendee": { "fullName": "Alen Mikel Umandal" } } }` | PENDING |
| `/api/v1/checkpoints/:id/scan` | `POST` | P1 | Invalid or Non-Existent Ticket Code | **Headers:**<br>`Authorization: Bearer <STAFF_JWT>`<br>`Content-Type: application/json`<br><br>**Payload:**<br>`{ "ticketCode": "CHK-INVALID-00000", "deviceInfo": "Scanner Station #1", "notes": "" }` | **404 Not Found**<br>`{ "success": false, "statusCode": 404, "error": "INVALID_TICKET", "message": "Ticket code does not exist or is not valid for this event." }` | PENDING |

---

## Module 4: Sub-Activity, Workshop & Booth Tracking

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **BOOTH-UI-01** | P1 | Valid Booth Scan (Multi-Scan Allowed) | 1. Set scanner station to "AI Innovation Booth" (`allowMultipleScans: true`)<br>2. Scan checked-in attendee QR<br>3. Re-scan attendee later | Checkpoint type: `BOOTH`<br>Attendee: `CHK-2026-9812A` | Both scans succeed and log separate timestamps without throwing duplicate scan error. | - | PENDING |
| **BOOTH-UI-02** | P1 | Sub-Activity Scan Before Main Entrance Check-In | 1. Attendee proceeds directly to Workshop without checking in at Main Gate<br>2. Staff scans attendee at Workshop door | Checkpoint type: `SESSION`<br>Status: `CONFIRMED` (Not checked in) | System warns staff: "Attendee has not passed Main Entrance". Prompts staff to approve or redirect to gate. | - | PENDING |
| **BOOTH-UI-03** | P2 | Attendee Personal Visit History View | 1. Attendee opens `/my-ticket/CHK-2026-9812A/history` | Ticket: `CHK-2026-9812A` | UI renders timeline of all visited checkpoints with station names and exact check-in timestamps. | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/checkpoints/:id/scan` | `POST` | P1 | Valid Booth Scan (`allowMultipleScans: true`) | `{ "ticketCode": "CHK-2026-9812A" }` at booth checkpoint | **200 OK**<br>`{ "success": true, "data": { "scanResult": "SUCCESS", "checkpoint": { "type": "BOOTH" } } }` | PENDING |
| `/api/v1/registrations/:code/history` | `GET` | P2 | Fetch Attendee Checkpoint History | Route: `/api/v1/registrations/CHK-2026-9812A/history` | **200 OK**<br>`{ "success": true, "data": { "scans": [ { "checkpointName": "Main Gate" }, { "checkpointName": "Booth A" } ] } }` | PENDING |

---

## Module 5: Event Workflows (Multi-Day & Multi-Stop)

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **FLOW-UI-01** | P0 | Multi-Day Event Consecutive Daily Check-Ins | 1. Configure event as multi-day (`startDate: 2026-11-15`, `endDate: 2026-11-17`)<br>2. Check in attendee at main gate on Day 1<br>3. Scan the same attendee ticket at main gate on Day 2 | Event Format: `MULTI_DAY`<br>Ticket: `CHK-2026-9812A`<br>Day 1: `2026-11-15`<br>Day 2: `2026-11-16` | System validates ticket for the active date and accepts both Day 1 and Day 2 check-ins without raising duplicate scan conflict. | - | PENDING |
| **FLOW-UI-02** | P1 | Multi-Stop Sequential Progression (Gate → Session → Exit) | 1. Scan attendee at "Main Entrance Gate A" (`MAIN_ENTRY`)<br>2. Scan attendee at "Workshop Room 101" (`SESSION`)<br>3. Scan attendee at "Exit Turnstile" (`EXIT`) | Ticket: `CHK-2026-9812A`<br>Checkpoints: `MAIN_ENTRY` → `SESSION` → `EXIT` | Scanner UI records each distinct station progression and updates attendee's physical location status to "Exited" after the final scan. | - | PENDING |
| **FLOW-UI-03** | P1 | Multi-Stop Attendee Passport & Journey History UI | 1. Attendee completes check-ins across multiple event stations<br>2. Open public attendee journey page `/tickets/CHK-2026-9812A/history` | Ticket Code: `CHK-2026-9812A` | UI renders an interactive chronological timeline showing all stops visited, station badges (`MAIN_ENTRY`, `SESSION`, `BOOTH`), and exact check-in timestamps. | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/events` | `POST` | P0 | Create Multi-Day / Multi-Stop Event with Metadata | **Headers:**<br>`Authorization: Bearer <ORGANIZER_JWT>`<br>`Content-Type: application/json`<br><br>**Payload:**<br>`{ "title": "BSIT Tech Summit 2026", "slug": "bsit-tech-summit-2026", "description": "Annual student technology conference.", "venueName": "Gymnasium, Main Campus", "startDate": "2026-11-15T08:00:00.000Z", "endDate": "2026-11-17T17:00:00.000Z", "metadata": { "capacity": 500, "eventFormat": "MULTI_STOP", "allowWalkIns": true } }` | **201 Created**<br>`{ "success": true, "statusCode": 201, "message": "Event created successfully", "data": { "id": "e2a1496a-04b3-4f98-904d-17bb27a7c501", "organizerId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "title": "BSIT Tech Summit 2026", "slug": "bsit-tech-summit-2026", "venueName": "Gymnasium, Main Campus", "startDate": "2026-11-15T08:00:00.000Z", "endDate": "2026-11-17T17:00:00.000Z", "isActive": true, "createdAt": "2026-10-06T13:50:00.000Z" } }` | PENDING |
| `/api/v1/registrations/:ticketCode/history` | `GET` | P0 | Retrieve Multi-Stop Journey History Log | **Headers:**<br>`Accept: application/json`<br><br>**URL Params:**<br>`:ticketCode = CHK-2026-9812A` | **200 OK**<br>`{ "success": true, "statusCode": 200, "message": "Attendance history fetched", "data": { "ticketCode": "CHK-2026-9812A", "attendeeName": "Alen Mikel Umandal", "scans": [ { "checkpointName": "Main Entrance Gate A", "type": "MAIN_ENTRY", "scannedAt": "2026-11-15T08:14:22.000Z", "status": "SUCCESS" }, { "checkpointName": "Web Development Workshop", "type": "SESSION", "scannedAt": "2026-11-15T10:05:10.000Z", "status": "SUCCESS" }, { "checkpointName": "AI Innovation Booth", "type": "BOOTH", "scannedAt": "2026-11-15T13:45:00.000Z", "status": "SUCCESS" } ] } }` | PENDING |

---

## Module 6: Real-Time Dashboard & Traffic Analytics

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **DASH-UI-01** | P1 | Real-Time Attendance Headcount Increment | 1. Open Organizer Dashboard `/dashboard` on laptop<br>2. Scan an attendee QR ticket on mobile scanner | Active live event | Total Check-ins counter increments (+1) and Recent Scans feed updates without requiring manual browser refresh. | - | PENDING |
| **DASH-UI-02** | P2 | Checkpoint Traffic Bar Chart Display | 1. Navigate to `/analytics/checkpoints` | Multi-booth event data | Chart displays comparative visitor counts across Main Gate, Workshop Room, and Sponsor Booths. | - | PENDING |
| **DASH-UI-03** | P2 | Turnout Percentage Calculation | 1. 500 registered, 400 scanned in | 500 RSVPs, 400 check-ins | Dashboard displays exactly 80.0% turnout metric. | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/events/:id/analytics/live` | `GET` | P1 | Fetch Live Event Turnout Stats | Header: `Bearer <ORGANIZER_JWT>` | **200 OK**<br>`{ "success": true, "data": { "totalRegistered": 500, "totalCheckedIn": 400, "turnoutPercentage": 80.0 } }` | PENDING |
| `/api/v1/events/:id/analytics/checkpoints` | `GET` | P2 | Fetch Checkpoint Traffic Summary | Header: `Bearer <ORGANIZER_JWT>` | **200 OK**<br>`{ "success": true, "data": [ { "name": "Gate A", "totalScans": 400 }, { "name": "Booth 1", "totalScans": 180 } ] }` | PENDING |

---

## Module 7: Attendance Report Generation & Export

### UI / End-to-End Test Matrix

| Test ID | Priority | Test Scenario | Steps to Execute | Test Data / Inputs | Expected Outcome | Actual Result | Status |
|---|---|---|---|---|---|---|---|
| **REP-UI-01** | P0 | Full Event Attendance CSV Report Export | 1. Log in as Organizer/Admin and navigate to Event Reports (`/events/:id/reports`)<br>2. Select export format "CSV"<br>3. Click "Download Attendance Report" | Event: `bsit-tech-summit-2026`<br>Format: `CSV` | Browser triggers file download of `bsit-tech-summit-2026-attendance.csv`; exported file includes complete columns: Ticket Code, Full Name, Student ID, Email, Ticket Type, and First Check-in Timestamp. | - | PENDING |
| **REP-UI-02** | P1 | Station-Filtered Attendance Report Export (PDF) | 1. On Reports page, select checkpoint filter: "Web Development Workshop"<br>2. Select format "PDF"<br>3. Click "Download Attendance Report" | Checkpoint ID: `3c84f67e-128a-4cd9-bf71-9231fcf982aa`<br>Format: `PDF` | Generates and downloads printable PDF report containing summary stats and an attendance roster restricted solely to that workshop checkpoint. | - | PENDING |

### API Endpoint Test Matrix

| Endpoint | Method | Priority | Test Scenario | Request Payload / Headers | Expected HTTP Status & Response Body | Status |
|---|---|---|---|---|---|---|
| `/api/v1/events/:id/reports/export` | `GET` | P0 | Export Full Event Attendance as CSV Stream | **Headers:**<br>`Authorization: Bearer <ORGANIZER_JWT>`<br><br>**Query Params:**<br>`?format=csv` | **200 OK**<br>**Headers Returned:**<br>`Content-Type: text/csv`<br>`Content-Disposition: attachment; filename="bsit-tech-summit-2026-attendance.csv"`<br><br>**Body:** Raw CSV stream starting with headers: `ticketCode,fullName,email,studentId,ticketType,firstCheckedInAt,checkpointName` | PENDING |
| `/api/v1/events/:id/reports/export` | `GET` | P1 | Export Request with Invalid Format Query Parameter | **Headers:**<br>`Authorization: Bearer <ORGANIZER_JWT>`<br><br>**Query Params:**<br>`?format=xml` | **400 Bad Request**<br>`{ "success": false, "statusCode": 400, "error": "BAD_REQUEST", "message": "Invalid export format. Allowed formats are csv, pdf, xlsx.", "details": [] }` | PENDING |

---