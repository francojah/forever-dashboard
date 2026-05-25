-- ================================================================
-- FOREVER ADS APP — Schema de base de datos
-- Ejecutar en: supabase.com → SQL Editor → New query → Run
-- ================================================================

-- Snapshots diarios de Meta Ads (guardados por el cron)
CREATE TABLE IF NOT EXISTS meta_snapshots (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  campaigns    JSONB NOT NULL DEFAULT '[]',
  adsets       JSONB NOT NULL DEFAULT '[]',
  ads          JSONB NOT NULL DEFAULT '[]',
  summary      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (snapshot_date)
);

-- Creativos — registro de imágenes y videos usados en Meta
CREATE TABLE IF NOT EXISTS creatives (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_ad_id   TEXT,
  name         TEXT NOT NULL,
  file_url     TEXT,
  file_type    TEXT CHECK (file_type IN ('image','video','carousel')),
  adset_id     TEXT,
  adset_name   TEXT,
  campaign_name TEXT,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','paused','testing','winner','loser')),
  notes        TEXT,
  tags         TEXT[] DEFAULT '{}',
  uploaded_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Leads provenientes de Meta Lead Ads
CREATE TABLE IF NOT EXISTS leads (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_lead_id  TEXT UNIQUE,
  full_name     TEXT,
  email         TEXT,
  phone         TEXT,
  form_name     TEXT,
  campaign_name TEXT,
  adset_name    TEXT,
  status        TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','negotiating','closed_won','closed_lost')),
  assigned_to   UUID REFERENCES auth.users(id),
  notes         TEXT,
  source        TEXT DEFAULT 'meta_lead_ad',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Ideas de contenido generadas por IA o el equipo
CREATE TABLE IF NOT EXISTS creative_ideas (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  format        TEXT CHECK (format IN ('video','image','carousel','reel','story')),
  priority      TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  based_on      TEXT,   -- qué métrica o insight disparó la idea
  reference_url TEXT,   -- referencia visual
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','filming','editing','done','discarded')),
  assigned_to   UUID REFERENCES auth.users(id),
  generated_by  TEXT DEFAULT 'ia' CHECK (generated_by IN ('ia','team')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Alertas automáticas del sistema
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type          TEXT NOT NULL,   -- 'cpa_exceeded' | 'roas_drop' | 'budget_deviation' | 'ad_set_learning'
  entity_type   TEXT,            -- 'campaign' | 'adset' | 'ad'
  entity_id     TEXT,
  entity_name   TEXT,
  message       TEXT NOT NULL,
  severity      TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','danger')),
  threshold     NUMERIC,
  actual_value  NUMERIC,
  is_read       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Análisis de competencia guardados
CREATE TABLE IF NOT EXISTS competitor_analyses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  competitor_url  TEXT,
  ads_found       INTEGER DEFAULT 0,
  analysis        JSONB NOT NULL DEFAULT '{}',
  raw_ads         JSONB DEFAULT '[]',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Perfiles de usuario (extende auth.users de Supabase) ─────
CREATE TABLE IF NOT EXISTS profiles (
  id       UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name     TEXT,
  role     TEXT DEFAULT 'viewer' CHECK (role IN ('admin','viewer','analyst')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, new.raw_user_meta_data->>'name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE meta_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE creatives          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_ideas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;

-- Solo usuarios autenticados pueden leer/escribir
CREATE POLICY "Authenticated read" ON meta_snapshots     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read" ON creatives          FOR ALL    USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read" ON leads              FOR ALL    USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read" ON creative_ideas     FOR ALL    USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read" ON alerts             FOR ALL    USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read" ON competitor_analyses FOR ALL   USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read" ON profiles           FOR ALL    USING (auth.role() = 'authenticated');

-- Service role puede insertar snapshots (para el cron)
CREATE POLICY "Service insert snapshots" ON meta_snapshots
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Service upsert snapshots" ON meta_snapshots
  FOR UPDATE USING (true);
