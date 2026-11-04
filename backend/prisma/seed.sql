-- Checkpoint Database Seed Script
-- Populates baseline development data across users, events, checkpoints, and tickets.

BEGIN;

-- 1. Insert Users
INSERT INTO "public"."users" (
  "id", "email", "passwordHash", "fullName", "role", "studentId", "affiliation", "isActive", "createdAt", "updatedAt"
) VALUES
  ('usr-attendee-alen', 'amc.umandal@gmail.com', '$2b$10$wB5W.3W/1tV4rBwYqZfX/O4mKq9g7O7R/0fH0q0g5P6G9V4Q2Z0kS', 'Alen Mikel Umandal', 'ATTENDEE'::"UserRole", '2023-01982-MN-0', 'College of Science and Computer Studies', true, NOW(), NOW()),
  ('usr-organizer-campus', 'organizer@alica.ph', '$2b$10$wB5W.3W/1tV4rBwYqZfX/O4mKq9g7O7R/0fH0q0g5P6G9V4Q2Z0kS', 'Campus Organizer', 'ORGANIZER'::"UserRole", NULL, 'University Student Council', true, NOW(), NOW()),
  ('usr-staff-station', 'staff@checkpoint.ph', '$2b$10$wB5W.3W/1tV4rBwYqZfX/O4mKq9g7O7R/0fH0q0g5P6G9V4Q2Z0kS', 'Station Operator', 'STAFF'::"UserRole", NULL, 'Event Operations Team', true, NOW(), NOW()),
  ('usr-admin-system', 'admin@dlsud.edu.ph', '$2b$10$wB5W.3W/1tV4rBwYqZfX/O4mKq9g7O7R/0fH0q0g5P6G9V4Q2Z0kS', 'System Administrator', 'ADMIN'::"UserRole", NULL, 'Information & Communications Technology', true, NOW(), NOW())
ON CONFLICT ("email") DO UPDATE SET
  "fullName" = EXCLUDED."fullName",
  "role" = EXCLUDED."role",
  "studentId" = EXCLUDED."studentId",
  "affiliation" = EXCLUDED."affiliation",
  "updatedAt" = NOW();

-- 2. Insert Events
INSERT INTO "public"."events" (
  "id", "title", "slug", "description", "venueName", "startDate", "endDate", "capacity", "allowWalkIns", "isActive", "organizerId", "createdAt", "updatedAt"
) VALUES
  ('evt-tech-summit-2026', 'DLSU-D Tech Summit 2026', 'tech-summit-2026', 'Annual flagship technology gathering uniting student innovators, industry keynote speakers, and project demonstrations.', 'Ugnayang La Salle Gymnasium', '2026-11-15 08:00:00', '2026-11-15 17:00:00', 500, true, true, 'usr-organizer-campus', NOW(), NOW()),
  ('evt-ai-hackathon-2026', 'AI & Agentic Systems Hackathon', 'ai-hackathon-2026', '24-hour hackathon focused on building intelligent agent workflows, modern AI tools, and autonomous coding systems.', 'CBAA ICT Computer Labs', '2026-11-22 09:00:00', '2026-11-23 18:00:00', 150, false, true, 'usr-organizer-campus', NOW(), NOW()),
  ('evt-leadership-conclave-2026', 'University Leadership Conclave', 'leadership-conclave-2026', 'Symposium for student leaders, organization officers, and committee chairs on governance and event management.', 'Test Convention Hall', '2026-11-30 13:00:00', '2026-11-30 18:00:00', 300, true, true, 'usr-organizer-campus', NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "venueName" = EXCLUDED."venueName",
  "startDate" = EXCLUDED."startDate",
  "endDate" = EXCLUDED."endDate",
  "capacity" = EXCLUDED."capacity",
  "updatedAt" = NOW();

-- 3. Insert Checkpoints
INSERT INTO "public"."checkpoints" (
  "id", "eventId", "name", "location", "type", "allowMultipleScans", "requireMainEntry", "isActive", "createdAt", "updatedAt"
) VALUES
  ('chk-main-gate', 'evt-tech-summit-2026', 'Main Gate Turnstile A', 'East Entrance Gates', 'MAIN_ENTRY'::"CheckpointType", false, false, true, NOW(), NOW()),
  ('chk-session-keynote', 'evt-tech-summit-2026', 'Plenary Hall - AI Keynote', '2nd Floor Main Plenary', 'SESSION'::"CheckpointType", false, true, true, NOW(), NOW()),
  ('chk-booth-showcase', 'evt-tech-summit-2026', 'Capstone Project Showcase Area', 'Ground Floor Atrium', 'BOOTH'::"CheckpointType", true, false, true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "location" = EXCLUDED."location",
  "updatedAt" = NOW();

-- 4. Insert Tickets
INSERT INTO "public"."tickets" (
  "id", "eventId", "userId", "firstName", "lastName", "email", "studentId", "affiliation", "ticketType", "ticketCode", "qrPayload", "status", "createdAt", "updatedAt"
) VALUES
  ('tkt-alen-tech-summit', 'evt-tech-summit-2026', 'usr-attendee-alen', 'Alen Mikel', 'Umandal', 'amc.umandal@gmail.com', '2023-01982-MN-0', 'College of Science and Computer Studies', 'STUDENT'::"TicketType", 'CHK-2026-9812A', 'CHK-2026-9812A', 'REGISTERED'::"TicketStatus", NOW(), NOW())
ON CONFLICT ("ticketCode") DO UPDATE SET
  "status" = EXCLUDED."status",
  "updatedAt" = NOW();

-- 5. Insert Staff Assignments
INSERT INTO "public"."event_staff" ("id", "eventId", "userId", "assignedAt", "isActive")
VALUES ('es-staff-tech-summit', 'evt-tech-summit-2026', 'usr-staff-station', NOW(), true)
ON CONFLICT ("eventId", "userId") DO NOTHING;

INSERT INTO "public"."checkpoint_staff" ("id", "checkpointId", "userId", "assignedAt", "isActive")
VALUES ('cs-staff-main-gate', 'chk-main-gate', 'usr-staff-station', NOW(), true)
ON CONFLICT ("checkpointId", "userId") DO NOTHING;

COMMIT;
