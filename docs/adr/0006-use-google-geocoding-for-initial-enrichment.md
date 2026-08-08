# Use Google Geocoding for initial enrichment

Round Locations are initially enriched through Google Geocoding API v4, and the selected derived fields are stored in D1 without provider provenance until they may be manually replaced by end-user data. This deliberately accepts Google's general restrictions on storing geocoding content, despite storage-friendly alternatives, because the product owner explicitly chose the Google endpoint and accepted the resulting compliance risk.
