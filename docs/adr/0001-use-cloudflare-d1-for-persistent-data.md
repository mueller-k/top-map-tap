# Use Cloudflare D1 for persistent data

Store Dashboards, Participants, Results, and browser Sessions in one Cloudflare D1 database. Their relational constraints and leaderboard/history queries fit SQLite semantics directly, while using KV would make uniqueness and querying awkward and Durable Objects would add stateful coordination the application does not need.
