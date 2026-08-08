CREATE TRIGGER round_locations_immutable_archive_facts
BEFORE UPDATE OF
  result_year, result_month, result_day, round_number, source_label,
  maptap_latitude, maptap_longitude, source_url, collected_at
ON round_locations
BEGIN
  SELECT RAISE(ABORT, 'archived Round Location facts are immutable');
END;
