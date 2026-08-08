# Top Map Tap

Top Map Tap helps small trusted groups collect daily MapTap results and compare performance over time.

## Language

**Leaderboard**:
A password-protected, unlisted shared space containing up to 25 participants, their submitted results, and rankings. Its name and password are fixed when it is created, and it cannot be discovered without its URL.
_Avoid_: Board, room, group

**Leaderboard ID**:
An opaque, randomly generated identifier embedded in a leaderboard's shareable URL. It is distinct from the leaderboard's human-facing name.
_Avoid_: Slug, leaderboard name

**Leaderboard Access**:
Permission to view and submit results within a leaderboard, granted by entering its shared password for a browser session.
_Avoid_: Login, membership, authentication

**Leaderboard Deletion Access**:
Permission to permanently delete a Leaderboard and everything it contains, granted by combining Leaderboard Access with its Deletion Key. Neither credential grants Leaderboard Deletion Access alone.
_Avoid_: Leaderboard Access, admin account, ownership

**Deletion Key**:
A high-entropy credential generated and revealed once when a Leaderboard is created, then held by its creator. The unrecoverable key is required alongside Leaderboard Access for deletion and is distinct from the shared leaderboard password.
_Avoid_: Admin password, recovery code, owner token

**Leaderboard Deletion**:
The immediate, permanent removal of a Leaderboard and everything it contains, including Participants, Results, imports, and references from Recent Leaderboards. After deletion, its shared URL and integration callbacks are unavailable.
_Avoid_: Archive, deactivate, reset

**Recent Leaderboards**:
Leaderboards accessed during the current browser session, surfaced on that browser's homepage and forgotten when the session ends.
_Avoid_: Leaderboard directory, favorites

**Current Date**:
The current calendar date used consistently across leaderboards for date-based views.
_Avoid_: Viewer date

**Participant**:
A permanent display name under which results are submitted within a leaderboard. A participant is created only together with its first valid Result; names are unique within a leaderboard after trimming and collapsing whitespace and ignoring case, while preserving the creator's casing. A participant does not represent an authenticated or exclusively controlled person.
_Avoid_: User, account, player profile

**Result**:
A participant's MapTap performance for a particular MapTap Date, comprising Round Scores and a Final Score. A leaderboard retains at most one result for each participant and MapTap Date; the Result with the later Submission Time prevails, and Results cannot be deleted.
_Avoid_: Score entry

**MapTap Date**:
A month, day, and year key identifying the daily challenge named in copied MapTap result text. An explicit year is used when present; otherwise it means the year of the Current Date when the submission is received. Recognized month names and days from 1 through 31 are accepted without validating whether the combination is a civil-calendar date; impossible dates are retained but excluded from calendar-based views.
_Avoid_: Submission date, entry date

**Round Score**:
One of the five ordered integer scores from 0 through 100 parsed from copied MapTap result text. Symbols surrounding a Round Score carry no meaning.
_Avoid_: Sub-item score

**Round Location**:
One of the five ordered geographic targets for a MapTap Date, comprising its Source Label and MapTap Coordinates and paired by position with the corresponding Round Score. It remains a distinct occurrence when a place repeats and excludes any story, trivia, image, or other editorial content associated with the target.
_Avoid_: Story, place, guessed location

**Source Label**:
The human-readable geographic name MapTap publishes for a Round Location, excluding any adjacent story headline. After decoding HTML entities, trimming its edges, and collapsing runs of whitespace, its spelling, capitalization, and punctuation otherwise remain unchanged.
_Avoid_: Geographic Enrichment, normalized place name, story title

**MapTap Coordinates**:
The finite, in-range latitude and longitude MapTap publishes for a Round Location. They are the immutable, authoritative position used to obtain Geographic Enrichment and remain the sole coordinates that identify the archived target. A date with any missing or invalid MapTap Coordinates is not Location-Covered.
_Avoid_: Geocoded Match Coordinates, guessed coordinates, corrected coordinates

**Geocoded Match Coordinates**:
Nullable latitude and longitude returned for the most exact result of a successful Geographic Enrichment. They are retained only as a reference and never replace MapTap Coordinates, drive location statistics, or supply a later enrichment request.
_Avoid_: MapTap Coordinates, corrected coordinates, authoritative location

**Location-Covered Date**:
A valid MapTap Date with exactly one Round Location in each ordered position from one through five, collected from a source page that declares the same month, day, and year. Every date on or after January 1, 2026 must become Location-Covered; earlier dates are intentionally outside location coverage.
_Avoid_: Partially covered date, enriched date

**Location Publication**:
The point after a MapTap Date has ended in every timezone, when its Round Locations may first affect user-visible views. Round Locations collected earlier remain unavailable to viewers until then.
_Avoid_: Same-day locations, spoiler window

**Geographic Enrichment**:
Correctable, structured English-language classification of a Round Location's exact coordinates, rather than the full geographic extent implied by its Source Label. A Complete classification always includes Continent, while Country or Territory, First-Order Subdivision, Locality, Feature Types, and Geocoded Match Coordinates may be absent; enrichment does not determine Location Coverage or change the archived geographic target.
_Avoid_: Round Location, source location, required location data

**Feature Types**:
The set of zero or more classifications assigned to a Round Location by Geographic Enrichment. Multiple types may coexist, and future statistics may group them into broader categories without changing the archived location.
_Avoid_: Feature category, single location type

**Locality**:
An English city- or town-scale settlement associated with a Round Location's exact coordinates. A postal town or top-level sublocality may stand in when no formal locality is available, while a county or other administrative region does not qualify.
_Avoid_: County, First-Order Subdivision, source label

**First-Order Subdivision**:
The full English name of the primary administrative region containing a Round Location's exact coordinates, such as a state, province, or region. It is interpreted together with the Country or Territory and does not imply a standardized subdivision code.
_Avoid_: County, subdivision abbreviation, Locality

**Country or Territory**:
The English country- or territory-level classification containing a Round Location's exact coordinates, paired with its two-letter ISO code when available. A territory remains distinct from its sovereign state for statistics and maps independently to a Continent.
_Avoid_: Sovereign state, Continent, nationality

**Continent**:
One of Africa, Antarctica, Asia, Europe, North America, Oceania, or South America. Central America and the Caribbean belong to North America, while Australia and the Pacific island territories belong to Oceania; each Country or Territory maps to exactly one Continent.
_Avoid_: Region, subcontinent, coordinate-based landmass

**Continent Accuracy**:
The arithmetic mean of a Participant's Round Scores from prevailing Results for Location-Published Round Locations in one Continent, beginning January 1, 2026 and no later than the Current Date. Ranking compares the hundredth-rounded mean and then qualifying Round Score count, both descending; Round Locations without a Continent and Final Scores are excluded, and any Participant with at least one qualifying Round Score may rank.
_Avoid_: Continental Final Score, continent win rate, continent total, continent percentage

**Continental Placement**:
One of the first two distinct tiers formed within a Leaderboard and Continent by ordering Participants by Continent Accuracy and then qualifying Round Score count, both descending. Participants tied on both values share a Placement and are displayed alphabetically without truncation; Placements are dense so the second tier remains second when multiple Participants share the first.
_Avoid_: Rank, row, slot

**Continental Leader**:
A Participant in the first Continental Placement for one Leaderboard and Continent. Every Participant sharing that Placement is a joint Continental Leader; alphabetical order affects presentation only.
_Avoid_: Continent winner, regional champion, user

**Enrichment Status**:
The state of Geographic Enrichment for a Round Location. Pending means no classification containing a Continent has completed and remains eligible for retry or manual correction; Complete means Continent is populated, while neither state affects whether a MapTap Date is Location-Covered.
_Avoid_: Location coverage, provider provenance, enrichment completeness

**Archived Round Location**:
A Round Location retained from its first complete collection after Location Publication. Its MapTap Date, round position, Source Label, MapTap Coordinates, source page reference, and Collection Time are immutable. Geographic Enrichment and Geocoded Match Coordinates may later be manually replaced without changing those archived facts, while routine collection never revisits or corrects them.
_Avoid_: Live location, synchronized location

**Location Archive**:
The global collection of Archived Round Locations shared by every Leaderboard. It describes MapTap itself, belongs to no Leaderboard, and is unaffected by Leaderboard Deletion or by the absence of Results for a MapTap Date.
_Avoid_: Leaderboard data, participant history, score archive

**Collection Time**:
The server time when all five Round Locations for a MapTap Date are first committed to the Location Archive. The five locations share one Collection Time, which later enrichment attempts do not change.
_Avoid_: Enrichment time, page publication time, Submission Time

**Hundo**:
A Round Score of exactly 100 in a prevailing Result. Each such Round Score contributes one Hundo, so one Result may contribute multiple Hundos; Round Scores from replaced Submissions do not count.
_Avoid_: Perfect Result, 100-point Final Score

**Zero**:
A Round Score of exactly 0 in a prevailing Result. Each such Round Score contributes one Zero, so one Result may contribute multiple Zeros; a Final Score of 0 does not contribute.
_Avoid_: Scoreless Result, zero Final Score

**Hundo Hunter**:
A table within one Leaderboard that competition-ranks every Participant, including those with zero Hundos, by Hundo count descending and then Zero count ascending across their prevailing Results on valid MapTap Dates through the Current Date, regardless of Submission or import source. Participants share a Rank only when both counts match; tied Participants are displayed alphabetically.
_Avoid_: Hundred count, perfect score count

**Final Score**:
The overall integer score from 0 through 1000 explicitly reported in copied MapTap result text.
_Avoid_: Total score

**Perfect Result**:
A prevailing Result whose Final Score is exactly 1000, regardless of its individual Round Scores.
_Avoid_: Perfect Round, perfect score

**Last Perfection Date**:
The most recent MapTap Date on which a Participant has an eligible Perfect Result. A Participant with no Perfect Results has no Last Perfection Date.
_Avoid_: Last Perfection Time, perfect Submission date

**Perfect Results**:
A table within one Leaderboard that competition-ranks every Participant, including those with zero Perfect Results, by Perfect Result count and then Last Perfection Date, both descending. Participants share a Rank only when both match; Submission and import sources are treated identically, while Results on future or impossible calendar dates do not contribute.
_Avoid_: Perfect Rounds, flawless games

**Rank**:
A participant's position when Results are ordered by descending Final Score. Equal Final Scores share a rank using competition ranking, and tied participants are displayed alphabetically.
_Avoid_: Place, standing

**Daily Win**:
A Participant's achievement for having Rank 1 on a Daily Leaderboard for a MapTap Date before the Current Date, as determined by the prevailing Results. It is recalculated when those Results change; tied Rank 1 Participants each earn a Daily Win, and no other Participant needs a Result for that date.
_Avoid_: First-place win, outright win, current-day lead

**Participation Day**:
A valid MapTap Date before the Current Date on which a Participant has a prevailing Result. Each date contributes at most one Participation Day for that Participant.
_Avoid_: Submission count, active day

**Win Percentage**:
A Participant's Daily Win count divided by their Participation Day count; a Participant with no Participation Days has no Win Percentage. It is an individual success rate rather than a share of all Daily Wins, so Participants' Win Percentages need not total 100 percent.
_Avoid_: Win share, leaderboard win percentage

**Last Win Date**:
The most recent MapTap Date on which a Participant currently has a Daily Win. A Participant with no Daily Wins has no Last Win Date.
_Avoid_: Last win time, win submission date

**All-Time Wins**:
A table that competition-ranks every Participant's Daily Wins on valid MapTap Dates before the Current Date, including Participants with zero Daily Wins. Ranking compares Daily Win count and then Last Win Date, both descending; Participants share a Rank only when both match. Results on the Current Date, future Results, and Results on impossible calendar dates are excluded.
_Avoid_: First-place totals, recent wins

**Daily Leaderboard**:
A table containing every leaderboard participant for one MapTap Date. Participants with Results are ranked by Final Score; participants without Results appear afterward with an empty score and no rank. Viewers can navigate the table to earlier dates.
_Avoid_: Today's Leaderboard, daily ranking

**Score History**:
A line chart comparing participants' Final Scores across a recent range of MapTap Dates. A missing Result appears as a gap rather than a zero or a carried-forward score.
_Avoid_: Historical ranking

**Personal Bests**:
A table ranking each participant's highest Final Score through the Current Date and showing the earliest MapTap Date on which that score was achieved. Future Results are excluded; participants without eligible Results appear afterward with an empty score and no rank.
_Avoid_: Highest Scores

**Personal Worsts**:
A table ranking each participant's lowest Final Score through the Current Date in ascending order, so the lowest score is ranked first, and showing the earliest MapTap Date on which that score was achieved. Future Results are excluded; participants without eligible Results appear afterward with an empty score and no rank.
_Avoid_: Lowest Scores

**All-Time Averages**:
A table ranking each participant's arithmetic mean Final Score across all Results on valid MapTap Dates through the Current Date. Ranking compares the displayed one-decimal average and then the eligible Result count, both descending; participants share a competition Rank only when both match. Future Results and Results on impossible calendar dates are excluded, while participants without eligible Results appear afterward with an empty average, zero Results, and no rank.
_Avoid_: User averages, lifetime averages

**Submission**:
Copied MapTap result text provided for a chosen existing or newly named participant. It is accepted when its date, five Round Scores, and Final Score have the expected structure; the numeric values are not checked for internal consistency.
_Avoid_: Result

**Submission Time**:
The time used to order competing Submissions for one Participant and MapTap Date. It is the server receipt time for direct Submissions and the message creation time for GroupMe imports.
_Avoid_: Arrival time, updated time

**Source Text**:
The exact copied MapTap text from which a Result was parsed, retained for future parsing validation but not shown in the leaderboard.
_Avoid_: Raw result, submission body

**History Import**:
An optional, creation-only process that derives Participants and Results from an external chat export. Unrelated chat content is neither retained nor made part of the Leaderboard.
_Avoid_: Backfill, chat import

**Import Source**:
The external service whose export supplies candidates for a History Import. Choosing no Import Source creates a Leaderboard without imported history.
_Avoid_: Provider

**GroupMe Live Import**:
An optional connection that derives Results from new messages published to the same GroupMe group used for a Leaderboard's History Import. A message's normalized sender name identifies its Participant; nickname changes may therefore create a different Participant.
_Avoid_: Bot, sync

**GroupMe Callback URL**:
An unlisted, high-entropy URL that grants GroupMe permission to submit messages for one GroupMe Live Import. Possession of the URL is the integration credential; the expected GroupMe group ID further limits its scope.
_Avoid_: Public endpoint, webhook secret
