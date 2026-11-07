-- Checkpoint Database Seed Script
-- Populates baseline development data across users, events, checkpoints, tickets, and scan logs.

BEGIN;

-- 1. Insert Users (Strict Binary Global Role: ADMIN vs USER)
INSERT INTO "public"."users" (
  "id", "email", "passwordHash", "fullName", "role", "studentId", "affiliation", "isActive", "createdAt", "updatedAt"
) VALUES
  ('usr-attendee-alen', 'amc.umandal@gmail.com', '$2b$10$xhBiOs1.J/.L/pnJEax7h.KhthJkxv4MeEkt8Du4Au7gGPGG55.xy', 'Alen Mikel Umandal', 'USER'::"UserRole", '2023-01982-MN-0', 'College of Science and Computer Studies', true, NOW(), NOW()),
  ('usr-organizer-campus', 'organizer@alica.ph', '$2b$10$xhBiOs1.J/.L/pnJEax7h.KhthJkxv4MeEkt8Du4Au7gGPGG55.xy', 'Campus Organizer', 'USER'::"UserRole", NULL, 'University Student Council', true, NOW(), NOW()),
  ('usr-organizer-example', 'organizer@example.com', '$2b$10$xhBiOs1.J/.L/pnJEax7h.KhthJkxv4MeEkt8Du4Au7gGPGG55.xy', 'Campus Organizer', 'USER'::"UserRole", NULL, 'University Student Council', true, NOW(), NOW()),
  ('usr-staff-station', 'staff@checkpoint.ph', '$2b$10$xhBiOs1.J/.L/pnJEax7h.KhthJkxv4MeEkt8Du4Au7gGPGG55.xy', 'Station Operator', 'USER'::"UserRole", NULL, 'Event Operations Team', true, NOW(), NOW()),
  ('usr-admin-system', 'admin@dlsud.edu.ph', '$2b$10$xhBiOs1.J/.L/pnJEax7h.KhthJkxv4MeEkt8Du4Au7gGPGG55.xy', 'System Administrator', 'ADMIN'::"UserRole", NULL, 'Information & Communications Technology', true, NOW(), NOW())
ON CONFLICT ("email") DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "fullName" = EXCLUDED."fullName",
  "role" = EXCLUDED."role",
  "studentId" = EXCLUDED."studentId",
  "affiliation" = EXCLUDED."affiliation",
  "updatedAt" = NOW();

-- 2. Insert Events (Public vs Private)
INSERT INTO "public"."events" (
  "id", "title", "slug", "description", "venueName", "startDate", "endDate", "capacity", "allowWalkIns", "isPrivate", "isActive", "approvalStatus", "organizerId", "createdAt", "updatedAt"
) VALUES
  ('evt-devcon-manila-2026', 'DevCon Manila 2026', 'devcon-manila-2026', 'The largest developer conference connecting tech innovators, cloud architects, and builders.', 'SMX Convention Center, Mall of Asia', '2026-09-24 08:00:00', '2026-09-24 18:00:00', 1240, true, false, true, 'APPROVED'::"EventApprovalStatus", 'usr-organizer-campus', NOW(), NOW()),
  ('evt-global-tech-expo-2026', 'Global Tech & AI Expo 2026', 'global-tech-ai-expo-2026', 'International exhibition featuring cutting-edge artificial intelligence, robotics, and cloud enterprise demonstrations.', 'World Trade Center, Pasay City', '2026-10-28 09:00:00', '2026-10-28 19:00:00', 2500, true, false, true, 'APPROVED'::"EventApprovalStatus", 'usr-organizer-campus', NOW(), NOW()),
  ('evt-ai-hackathon-2026', 'National AI Hackathon 2026', 'national-ai-hackathon-2026', '24-hour nationwide hackathon focused on building intelligent agent workflows, modern AI tools, and autonomous coding systems.', 'Innovation Complex, Taft Ave', '2026-11-20 09:00:00', '2026-11-21 18:00:00', 3000, false, false, true, 'APPROVED'::"EventApprovalStatus", 'usr-organizer-campus', NOW(), NOW()),
  ('evt-tech-summit-2026', 'DLSU-D Tech Summit 2026', 'tech-summit-2026', 'Annual flagship technology gathering uniting student innovators, industry keynote speakers, and project demonstrations.', 'Ugnayang La Salle Gymnasium', '2026-11-15 08:00:00', '2026-11-15 17:00:00', 500, true, false, true, 'APPROVED'::"EventApprovalStatus", 'usr-organizer-campus', NOW(), NOW()),
  ('evt-leadership-conclave-2026', 'University Leadership Conclave', 'leadership-conclave-2026', 'Symposium for student leaders, organization officers, and committee chairs on governance and event management.', 'Test Convention Hall', '2026-11-30 13:00:00', '2026-11-30 18:00:00', 300, true, true, true, 'APPROVED'::"EventApprovalStatus", 'usr-organizer-campus', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "slug" = EXCLUDED."slug",
  "venueName" = EXCLUDED."venueName",
  "startDate" = EXCLUDED."startDate",
  "endDate" = EXCLUDED."endDate",
  "capacity" = EXCLUDED."capacity",
  "isPrivate" = EXCLUDED."isPrivate",
  "approvalStatus" = EXCLUDED."approvalStatus",
  "updatedAt" = NOW();

-- 3. Insert Checkpoints (Stations & Gates for DevCon Manila 2026)
INSERT INTO "public"."checkpoints" (
  "id", "eventId", "name", "location", "type", "allowMultipleScans", "requireMainEntry", "isActive", "createdAt", "updatedAt"
) VALUES
  ('chk-devcon-gate-1', 'evt-devcon-manila-2026', 'Gate 1 (Main Entrance)', 'Level 1 North Atrium', 'MAIN_ENTRY'::"CheckpointType", false, false, true, NOW(), NOW()),
  ('chk-devcon-gate-2', 'evt-devcon-manila-2026', 'Gate 2 (Side Entrance)', 'Level 1 South Wing', 'MAIN_ENTRY'::"CheckpointType", false, false, true, NOW(), NOW()),
  ('chk-devcon-plenary', 'evt-devcon-manila-2026', 'Opening Plenary Session', 'Function Room 1-3', 'SESSION'::"CheckpointType", false, true, true, NOW(), NOW()),
  ('chk-devcon-workshop', 'evt-devcon-manila-2026', 'Hands-on Workshop Studio', 'Function Room 4', 'SESSION'::"CheckpointType", false, true, true, NOW(), NOW()),
  ('chk-devcon-aws', 'evt-devcon-manila-2026', 'AWS Cloud Partner Booth', 'Exhibition Hall Booth A-12', 'BOOTH'::"CheckpointType", true, false, true, NOW(), NOW()),
  ('chk-devcon-figma', 'evt-devcon-manila-2026', 'Figma Community Space', 'Exhibition Hall Booth B-04', 'BOOTH'::"CheckpointType", true, false, true, NOW(), NOW()),
  ('chk-devcon-accenture', 'evt-devcon-manila-2026', 'Accenture Innovation Hub', 'Exhibition Hall Booth C-08', 'BOOTH'::"CheckpointType", true, false, true, NOW(), NOW()),
  ('chk-devcon-swag', 'evt-devcon-manila-2026', 'Swag & Welcome Kit Distribution', 'Hallway Registration Desk', 'BOOTH'::"CheckpointType", false, true, true, NOW(), NOW()),

  -- Checkpoints for Tech Summit 2026
  ('chk-main-gate', 'evt-tech-summit-2026', 'Main Gate Turnstile A', 'East Entrance Gates', 'MAIN_ENTRY'::"CheckpointType", false, false, true, NOW(), NOW()),
  ('chk-session-keynote', 'evt-tech-summit-2026', 'Plenary Hall - AI Keynote', '2nd Floor Main Plenary', 'SESSION'::"CheckpointType", false, true, true, NOW(), NOW()),
  ('chk-booth-showcase', 'evt-tech-summit-2026', 'Capstone Project Showcase Area', 'Ground Floor Atrium', 'BOOTH'::"CheckpointType", true, false, true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "location" = EXCLUDED."location",
  "updatedAt" = NOW();

-- 4. Insert Tickets
INSERT INTO "public"."tickets" (
  "id", "eventId", "userId", "firstName", "lastName", "email", "studentId", "affiliation", "ticketType", "ticketCode", "qrPayload", "status", "firstScannedAt", "lastScannedAt", "createdAt", "updatedAt"
) VALUES
  ('tkt-devcon-alex', 'evt-devcon-manila-2026', NULL, 'Alex', 'Martin', 'alex.martin@studiocraft.io', NULL, 'Studio Craft', 'REGULAR'::"TicketType", '#DEV-928472', 'DEV-928472', 'CHECKED_IN'::"TicketStatus", '2026-09-24 08:26:23', '2026-09-24 12:18:40', NOW(), NOW()),
  ('tkt-alen-tech-summit', 'evt-tech-summit-2026', 'usr-attendee-alen', 'Alen Mikel', 'Umandal', 'amc.umandal@gmail.com', '2023-01982-MN-0', 'College of Science and Computer Studies', 'STUDENT'::"TicketType", 'CHK-2026-9812A', 'CHK-2026-9812A', 'REGISTERED'::"TicketStatus", NULL, NULL, NOW(), NOW()),
  ('tkt-expo-lead', 'evt-global-tech-expo-2026', NULL, 'Sophia', 'Vargas', 'sophia.vargas@ai-corp.com', NULL, 'Global AI Enterprise', 'REGULAR'::"TicketType", '#EXP-441209', 'EXP-441209', 'CHECKED_IN'::"TicketStatus", '2026-10-28 09:15:00', '2026-10-28 09:15:00', NOW(), NOW()),
  ('tkt-hackathon-lead', 'evt-ai-hackathon-2026', NULL, 'Marcus', 'Chen', 'marcus.chen@student.dlsud.edu.ph', '2023-11042-MN-0', 'Agentic Systems Lab', 'STUDENT'::"TicketType", '#HCK-883190', 'HCK-883190', 'CHECKED_IN'::"TicketStatus", '2026-11-20 09:05:00', '2026-11-20 09:05:00', NOW(), NOW())
ON CONFLICT ("ticketCode") DO UPDATE SET
  "status" = EXCLUDED."status",
  "firstScannedAt" = EXCLUDED."firstScannedAt",
  "lastScannedAt" = EXCLUDED."lastScannedAt",
  "updatedAt" = NOW();

-- 5. Insert Attendance Logs for DevCon Manila 2026
INSERT INTO "public"."attendance_logs" (
  "id", "ticketId", "ticketCode", "checkpointId", "scannedByUserId", "scannedAt", "scanDate", "scanResult", "deviceInfo", "notes", "createdAt"
) VALUES
  ('log-devcon-1', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-gate-1', 'usr-staff-station', '2026-09-24 08:26:23', '2026-09-24 08:26:23', 'DUPLICATE'::"ScanResult", 'Terminal Gate-01', 'Re-entry scan at turnstile', NOW()),
  ('log-devcon-2', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-gate-1', 'usr-staff-station', '2026-09-24 08:26:21', '2026-09-24 08:26:21', 'DUPLICATE'::"ScanResult", 'Terminal Gate-01', 'Rapid double scan', NOW()),
  ('log-devcon-3', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-gate-1', 'usr-staff-station', '2026-09-24 08:26:00', '2026-09-24 08:26:00', 'SUCCESS'::"ScanResult", 'Terminal Gate-01', 'Initial admission', NOW()),
  ('log-devcon-4', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-plenary', 'usr-staff-station', '2026-09-24 09:10:00', '2026-09-24 09:10:00', 'SUCCESS'::"ScanResult", 'Handheld Scanner 03', 'Plenary hall entry', NOW()),
  ('log-devcon-5', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-workshop', 'usr-staff-station', '2026-09-24 10:30:00', '2026-09-24 10:30:00', 'SUCCESS'::"ScanResult", 'Handheld Scanner 04', 'Workshop verification', NOW()),
  ('log-devcon-6', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-figma', 'usr-staff-station', '2026-09-24 11:40:19', '2026-09-24 11:40:19', 'SUCCESS'::"ScanResult", 'Partner Tablet', 'Booth visit logged', NOW()),
  ('log-devcon-7', 'tkt-devcon-alex', '#DEV-928472', 'chk-devcon-aws', 'usr-staff-station', '2026-09-24 12:18:40', '2026-09-24 12:18:40', 'SUCCESS'::"ScanResult", 'Partner Tablet', 'Cloud partner verification', NOW())
ON CONFLICT ("id") DO NOTHING;

-- 6. Insert Staff Assignments
INSERT INTO "public"."event_staff" ("id", "eventId", "userId", "assignedAt", "isActive")
VALUES
  ('es-staff-tech-summit', 'evt-tech-summit-2026', 'usr-staff-station', NOW(), true),
  ('es-staff-devcon', 'evt-devcon-manila-2026', 'usr-staff-station', NOW(), true)
ON CONFLICT ("eventId", "userId") DO NOTHING;

INSERT INTO "public"."checkpoint_staff" ("id", "checkpointId", "userId", "assignedAt", "isActive")
VALUES
  ('cs-staff-main-gate', 'chk-main-gate', 'usr-staff-station', NOW(), true),
  ('cs-staff-devcon-gate1', 'chk-devcon-gate-1', 'usr-staff-station', NOW(), true)
ON CONFLICT ("checkpointId", "userId") DO NOTHING;

-- 7. Insert Saved Autofill Profiles
INSERT INTO "public"."saved_profiles" (
  "id", "userId", "profileName", "fullName", "studentId", "contactNumber", "affiliation", "isDefault", "createdAt", "updatedAt"
) VALUES
  ('prf-alen-student', 'usr-attendee-alen', 'Student Profile', 'Alen Mikel Umandal', '2023-01982-MN-0', '+63 917 123 4567', 'College of Science and Computer Studies', true, NOW(), NOW()),
  ('prf-alen-work', 'usr-attendee-alen', 'Professional Profile', 'Alen Mikel Umandal', NULL, '+63 917 987 6543', 'Project Alica Team', false, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
