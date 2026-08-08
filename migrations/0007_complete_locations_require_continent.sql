CREATE TRIGGER round_locations_complete_requires_continent_insert
BEFORE INSERT ON round_locations
WHEN NEW.enrichment_status = 'complete' AND NEW.continent IS NULL
BEGIN
  SELECT RAISE(ABORT, 'complete Round Location enrichment requires Continent');
END;

CREATE TRIGGER round_locations_complete_requires_continent_update
BEFORE UPDATE ON round_locations
WHEN NEW.enrichment_status = 'complete' AND NEW.continent IS NULL
BEGIN
  SELECT RAISE(ABORT, 'complete Round Location enrichment requires Continent');
END;
