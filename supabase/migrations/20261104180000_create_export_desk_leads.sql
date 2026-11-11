-- Export Desk tables for Kanechom / LQ qualification.
-- Do NOT read or write older public tables from previous experiments:
-- "Leads", leads_master, leads_enriquecidas, leads_comesa_gem, "leads-lote13",
-- tradeindata_novas_leads_import, tradeindata_stage_20260810, trade_test_*,
-- clientes, demandas_clientes, matches_*, fornecedores_*, etc.

CREATE TABLE IF NOT EXISTS desk_runs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  supplier TEXT NOT NULL,
  markets TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS desk_leads (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES desk_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  country TEXT NOT NULL,
  market TEXT,
  seed TEXT,
  band TEXT,
  score INTEGER,
  fit TEXT,
  fit_index INTEGER,
  icp TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  last_purchase TEXT,
  response_level TEXT,
  response_score INTEGER,
  response_note TEXT,
  signals_at TIMESTAMPTZ,
  hiring BOOLEAN,
  mix_change BOOLEAN,
  social_growth BOOLEAN,
  rag_match BOOLEAN,
  rag_neighbor TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (run_id, id)
);

CREATE INDEX IF NOT EXISTS desk_leads_domain_idx ON desk_leads (lower(domain));
CREATE INDEX IF NOT EXISTS desk_leads_country_idx ON desk_leads (country);
CREATE INDEX IF NOT EXISTS desk_leads_name_idx ON desk_leads (lower(name));
CREATE INDEX IF NOT EXISTS desk_leads_response_idx ON desk_leads (response_level, response_score DESC);
CREATE INDEX IF NOT EXISTS desk_leads_signals_idx ON desk_leads (signals_at);

COMMENT ON TABLE desk_runs IS 'Export Desk qualification runs. Full Run JSON in payload. Independent from older CRM tables in this project.';
COMMENT ON TABLE desk_leads IS 'Flattened Export Desk leads for /leads. Intelligence columns are desk-calculated. last_purchase is published evidence only. rag_neighbor is a different company, never a Kanechom/LQ purchase. Dump/Atlas never confirm a purchase.';
COMMENT ON COLUMN desk_leads.last_purchase IS 'Published last-purchase text only. Empty means unpublished. Never invent. Dump/Atlas/RAG neighbor do not fill this.';
COMMENT ON COLUMN desk_leads.response_score IS '0-100 chance the account answers outreach, not an order rate. high requires a published buy fact.';
COMMENT ON COLUMN desk_leads.rag_neighbor IS 'Nearest Chroma profile name when the match is not exact. Different company. Do not copy contacts or purchases.';

ALTER TABLE desk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE desk_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE desk_runs FROM PUBLIC;
REVOKE ALL ON TABLE desk_leads FROM PUBLIC;
REVOKE ALL ON TABLE desk_runs FROM anon, authenticated;
REVOKE ALL ON TABLE desk_leads FROM anon, authenticated;
GRANT ALL ON TABLE desk_runs TO postgres, service_role;
GRANT ALL ON TABLE desk_leads TO postgres, service_role;
