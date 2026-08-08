CREATE TABLE round_locations (
  result_year INTEGER NOT NULL CHECK (result_year >= 2026),
  result_month INTEGER NOT NULL CHECK (result_month BETWEEN 1 AND 12),
  result_day INTEGER NOT NULL CHECK (result_day BETWEEN 1 AND 31),
  round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 5),
  source_label TEXT NOT NULL,
  maptap_latitude REAL NOT NULL CHECK (maptap_latitude BETWEEN -90 AND 90),
  maptap_longitude REAL NOT NULL CHECK (maptap_longitude BETWEEN -180 AND 180),
  geocoded_latitude REAL CHECK (geocoded_latitude BETWEEN -90 AND 90),
  geocoded_longitude REAL CHECK (geocoded_longitude BETWEEN -180 AND 180),
  source_url TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  enrichment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'complete')),
  continent TEXT CHECK (
    continent IS NULL OR continent IN (
      'Africa', 'Antarctica', 'Asia', 'Europe',
      'North America', 'Oceania', 'South America'
    )
  ),
  country_name TEXT,
  country_code TEXT CHECK (
    country_code IS NULL OR (
      length(country_code) = 2 AND country_code = upper(country_code)
    )
  ),
  subdivision_name TEXT,
  locality_name TEXT,
  feature_types TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(feature_types)),
  PRIMARY KEY (result_year, result_month, result_day, round_number),
  CHECK (
    (geocoded_latitude IS NULL AND geocoded_longitude IS NULL) OR
    (geocoded_latitude IS NOT NULL AND geocoded_longitude IS NOT NULL)
  )
);

CREATE INDEX round_locations_pending_idx
  ON round_locations(enrichment_status, result_year, result_month, result_day, round_number)
  WHERE enrichment_status = 'pending';
