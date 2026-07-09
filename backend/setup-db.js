require('dotenv').config();
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const sql = `
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

DROP POLICY IF EXISTS "allow_all_leaders" ON leaders;
DROP POLICY IF EXISTS "allow_all_agenda" ON agenda_items;

CREATE POLICY "allow_all_leaders" ON leaders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_agenda" ON agenda_items FOR ALL USING (true) WITH CHECK (true);
`;

const host = SUPABASE_URL.replace('https://', '');
const body = JSON.stringify({ query: sql });

const options = {
  hostname: host,
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SECRET_KEY,
    'Authorization': `Bearer ${SECRET_KEY}`,
  }
};

// Try using the pg management approach via SQL editor API
const reqBody = JSON.stringify({ query: sql });

const req = https.request({
  hostname: host,
  path: '/pg/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SECRET_KEY,
    'Authorization': `Bearer ${SECRET_KEY}`,
    'Content-Length': Buffer.byteLength(reqBody),
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Tabelas criadas com sucesso!');
    } else {
      console.log(`Status: ${res.statusCode}`);
      console.log('Resposta:', data);
      console.log('\n⚠️  Será necessário criar as tabelas manualmente no Supabase SQL Editor.');
      console.log('Abra: https://supabase.com/dashboard/project/urfnkgvdjtfeoedkrrqh/sql/new');
    }
  });
});

req.on('error', (e) => {
  console.error('Erro de conexão:', e.message);
});

req.write(reqBody);
req.end();
