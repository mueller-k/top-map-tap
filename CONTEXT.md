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

**Final Score**:
The overall integer score from 0 through 1000 explicitly reported in copied MapTap result text.
_Avoid_: Total score

**Rank**:
A participant's position when Results are ordered by descending Final Score. Equal Final Scores share a rank using competition ranking, and tied participants are displayed alphabetically.
_Avoid_: Place, standing

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
