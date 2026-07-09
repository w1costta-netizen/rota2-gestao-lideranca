-- Cole este SQL no Supabase SQL Editor e clique em "Run"

CREATE TABLE IF NOT EXISTS leaders (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  work_days JSONB NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  week_start DATE NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT DEFAULT '',
  day_of_week TEXT NOT NULL,
  time TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_leaders" ON leaders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_agenda" ON agenda_items FOR ALL USING (true) WITH CHECK (true);
