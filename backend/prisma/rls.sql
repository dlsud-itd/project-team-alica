-- Checkpoint Row Level Security (RLS) Policies
-- Applied to Supabase PostgreSQL database

-- 1. Enable Row Level Security across all 7 public tables
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."checkpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."checkpoint_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendance_logs" ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policies for Events
CREATE POLICY "Public events are viewable by everyone"
  ON "public"."events" FOR SELECT
  USING ("isActive" = true);

CREATE POLICY "Organizers can insert events"
  ON "public"."events" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = "organizerId");

CREATE POLICY "Organizers can update own events"
  ON "public"."events" FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = "organizerId")
  WITH CHECK (auth.uid()::text = "organizerId");

-- 3. Create RLS Policies for Users
CREATE POLICY "Users can view own profile"
  ON "public"."users" FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id);

CREATE POLICY "Users can update own profile"
  ON "public"."users" FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- 4. Create RLS Policies for Tickets
CREATE POLICY "Users can view own tickets"
  ON "public"."tickets" FOR SELECT
  TO authenticated
  USING (auth.uid()::text = "userId");

CREATE POLICY "Anyone or authenticated can create ticket registration"
  ON "public"."tickets" FOR INSERT
  WITH CHECK (true);

-- 5. Create RLS Policies for Checkpoints
CREATE POLICY "Active checkpoints are viewable by authenticated users"
  ON "public"."checkpoints" FOR SELECT
  TO authenticated
  USING ("isActive" = true);

-- 6. Create RLS Policies for Event Staff
CREATE POLICY "Staff can view their event assignments"
  ON "public"."event_staff" FOR SELECT
  TO authenticated
  USING (auth.uid()::text = "userId");

-- 7. Create RLS Policies for Checkpoint Staff
CREATE POLICY "Staff can view their checkpoint assignments"
  ON "public"."checkpoint_staff" FOR SELECT
  TO authenticated
  USING (auth.uid()::text = "userId");

-- 8. Create RLS Policies for Attendance Logs
CREATE POLICY "Staff can view attendance logs"
  ON "public"."attendance_logs" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert attendance scan logs"
  ON "public"."attendance_logs" FOR INSERT
  TO authenticated
  WITH CHECK (true);

