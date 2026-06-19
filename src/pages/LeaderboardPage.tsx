import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LEADERBOARD_ID_LENGTH,
  MAX_PARTICIPANTS,
  compareDates,
  dateKey,
  dateRange,
  normalizeName,
  shiftCalendarDate,
  type LeaderboardSnapshot,
  type LeaderboardRow,
  type MapTapDate,
  type Participant,
  type ParsedResult,
  type PersonalBestRow,
  type ResultView,
} from "../../shared/domain";
import { parseMapTapResult } from "../../shared/parser";
import { api, ApiRequestError } from "../api";
import { formatDate } from "../format";

type PageState =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "unavailable" }
  | { kind: "ready"; snapshot: LeaderboardSnapshot };

export function LeaderboardPage() {
  const { leaderboardId = "" } = useParams();
  const [state, setState] = useState<PageState>({ kind: "loading" });

  async function loadLeaderboard() {
    if (
      !new RegExp(`^[A-Za-z0-9]{${LEADERBOARD_ID_LENGTH}}$`).test(leaderboardId)
    ) {
      setState({ kind: "unavailable" });
      return;
    }
    try {
      const snapshot = await api<LeaderboardSnapshot>(
        `/api/leaderboards/${leaderboardId}/bootstrap`,
      );
      setState({ kind: "ready", snapshot });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setState({ kind: "locked" });
      } else {
        setState({ kind: "unavailable" });
      }
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      if (
        !new RegExp(`^[A-Za-z0-9]{${LEADERBOARD_ID_LENGTH}}$`).test(
          leaderboardId,
        )
      ) {
        if (active) setState({ kind: "unavailable" });
        return;
      }
      try {
        const snapshot = await api<LeaderboardSnapshot>(
          `/api/leaderboards/${leaderboardId}/bootstrap?touch=1`,
        );
        if (active) setState({ kind: "ready", snapshot });
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          setState({ kind: "locked" });
        } else {
          setState({ kind: "unavailable" });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [leaderboardId]);

  if (state.kind === "loading") return <PageLoader />;
  if (state.kind === "unavailable") return <Unavailable />;
  if (state.kind === "locked") {
    return (
      <Unlock
        leaderboardId={leaderboardId}
        onUnlocked={() => void loadLeaderboard()}
      />
    );
  }
  return (
    <Leaderboard
      snapshot={state.snapshot}
      onSnapshot={(snapshot) => setState({ kind: "ready", snapshot })}
      onExpired={() => setState({ kind: "locked" })}
    />
  );
}

function Unlock({
  leaderboardId,
  onUnlocked,
}: {
  leaderboardId: string;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/leaderboards/${leaderboardId}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      history.replaceState({}, "", `/d/${leaderboardId}`);
      onUnlocked();
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Couldn’t unlock leaderboard.",
      );
      inputRef.current?.select();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="center-card unlock-card">
      <p className="eyebrow">Shared leaderboard</p>
      <h1>Enter leaderboard password</h1>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Password
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      <Link className="text-link" to="/">
        Back home
      </Link>
    </section>
  );
}

function Leaderboard({
  snapshot,
  onSnapshot,
  onExpired,
}: {
  snapshot: LeaderboardSnapshot;
  onSnapshot: (snapshot: LeaderboardSnapshot) => void;
  onExpired: () => void;
}) {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [leaderboardDate, setLeaderboardDate] = useState(
    snapshot.leaderboard.currentDate,
  );
  const [historyDays, setHistoryDays] = useState<7 | 30>(snapshot.historyDays);
  const hasResults = snapshot.participants.length > 0;

  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      onSnapshot(
        await api<LeaderboardSnapshot>(
          `/api/leaderboards/${snapshot.leaderboard.id}/bootstrap?date=${dateKey(leaderboardDate)}&days=${historyDays}`,
        ),
      );
      setLastRefreshed(new Date());
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) onExpired();
      else
        setRefreshError("Couldn’t refresh. Your current data is still here.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="leaderboard-page">
      <section className="leaderboard-title">
        <div>
          <p className="eyebrow">Shared leaderboard</p>
          <h1>{snapshot.leaderboard.name}</h1>
          <p className="muted">
            Updated{" "}
            {lastRefreshed.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="title-actions">
          <button
            className="button ghost"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="button secondary"
            onClick={() => setShareOpen(true)}
          >
            Share
          </button>
        </div>
      </section>
      {refreshError && <p className="inline-notice error">{refreshError}</p>}

      <ResultForm
        snapshot={snapshot}
        historyDays={historyDays}
        onSnapshot={onSnapshot}
        onSaved={(date) => {
          if (
            date.isCalendarDate &&
            compareDates(date, snapshot.leaderboard.currentDate) <= 0
          ) {
            setLeaderboardDate(date);
          }
        }}
      />

      {hasResults ? (
        <div className="widget-grid">
          <DailyLeaderboard
            key={`daily-${snapshot.leaderboard.map((row) => row.result?.updatedAt ?? row.participant.id).join("-")}`}
            snapshot={snapshot}
            selectedDate={leaderboardDate}
            onSelectedDate={setLeaderboardDate}
          />
          <ScoreHistory
            key={`history-${snapshot.history.map((result) => result.updatedAt).join("-")}`}
            snapshot={snapshot}
            days={historyDays}
            onDays={setHistoryDays}
          />
          <PersonalBests rows={snapshot.personalBests} />
        </div>
      ) : (
        <section className="first-result">
          <span aria-hidden="true">↥</span>
          <div>
            <h2>Paste your first MapTap result</h2>
            <p>
              The leaderboard and score history will appear as soon as you save
              it.
            </p>
          </div>
        </section>
      )}
      {shareOpen && (
        <ShareDialog
          leaderboardId={snapshot.leaderboard.id}
          leaderboardName={snapshot.leaderboard.name}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

function ResultForm({
  snapshot,
  historyDays,
  onSnapshot,
  onSaved,
}: {
  snapshot: LeaderboardSnapshot;
  historyDays: 7 | 30;
  onSnapshot: (snapshot: LeaderboardSnapshot) => void;
  onSaved: (date: MapTapDate) => void;
}) {
  const [participantName, setParticipantName] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [replacement, setReplacement] = useState<ResultView | null>(null);
  const parsed = useMemo(
    () =>
      sourceText.trim()
        ? parseMapTapResult(sourceText, snapshot.leaderboard.currentDate.year)
        : null,
    [sourceText, snapshot.leaderboard.currentDate.year],
  );
  const participant = findParticipant(snapshot.participants, participantName);
  const cleanParticipant = normalizeName(participantName).display;
  const canCreate =
    !participant &&
    cleanParticipant &&
    snapshot.participants.length < MAX_PARTICIPANTS;

  async function submit(forceReplace = false) {
    if (!parsed?.ok || (!participant && !canCreate)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api<{
        status: string;
        snapshot: LeaderboardSnapshot;
      }>(`/api/leaderboards/${snapshot.leaderboard.id}/results`, {
        method: "POST",
        body: JSON.stringify({
          sourceText,
          participantId: participant?.id,
          newParticipantName: participant ? undefined : cleanParticipant,
          forceReplace,
          historyDays,
        }),
      });
      onSnapshot(response.snapshot);
      onSaved(parsed.value.date);
      setSourceText("");
      setReplacement(null);
      const future =
        compareDates(parsed.value.date, snapshot.leaderboard.currentDate) > 0;
      const hidden = !parsed.value.date.isCalendarDate;
      setMessage(
        hidden
          ? "Saved. This date is not a calendar date, so it won’t appear in widgets."
          : future
            ? `Saved for ${formatDate(parsed.value.date)}. It will appear when that date arrives.`
            : response.status === "unchanged"
              ? "That result was already saved."
              : "Result saved.",
      );
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError &&
        requestError.code === "REPLACEMENT_REQUIRED" &&
        requestError.payload &&
        typeof requestError.payload === "object" &&
        "existing" in requestError.payload
      ) {
        setReplacement(
          (requestError.payload as { existing: ResultView }).existing,
        );
      } else {
        setError(
          requestError instanceof ApiRequestError
            ? requestError.message
            : "Couldn’t save result.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card result-form-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily ritual</p>
          <h2>Add result</h2>
        </div>
        <span className="step-pill">Paste → pick → submit</span>
      </div>
      <div className="result-form-grid">
        <label className="paste-field">
          MapTap result
          <textarea
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setMessage("");
              setError("");
            }}
            placeholder={
              "www.maptap.gg June 18\n100🎯 95🏅 96🔥 97🔥 65🤨\nFinal score: 873"
            }
            maxLength={2000}
            rows={5}
          />
        </label>
        <div className="submission-side">
          <label>
            Participant
            <input
              list="participants"
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              placeholder="Choose or type a new name"
              maxLength={30}
            />
            <datalist id="participants">
              {snapshot.participants.map((item) => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </label>
          {cleanParticipant && !participant && (
            <p className={canCreate ? "field-hint" : "form-error"}>
              {canCreate
                ? `Create “${cleanParticipant}” with this result`
                : "Participant limit reached."}
            </p>
          )}
          <ParsePreview parsed={parsed} />
          {error && <p className="form-error">{error}</p>}
          {message && (
            <p className="success-message" role="status">
              {message}
            </p>
          )}
          <button
            className="button primary"
            onClick={() => void submit()}
            disabled={busy || !parsed?.ok || (!participant && !canCreate)}
          >
            {busy ? "Saving…" : "Submit result"}
          </button>
        </div>
      </div>
      {replacement && parsed?.ok && (
        <ReplaceDialog
          participantName={participant?.name ?? cleanParticipant}
          existing={replacement}
          incoming={parsed.value}
          onCancel={() => setReplacement(null)}
          onReplace={() => void submit(true)}
        />
      )}
    </section>
  );
}

function ParsePreview({
  parsed,
}: {
  parsed: ReturnType<typeof parseMapTapResult> | null;
}) {
  if (!parsed)
    return (
      <p className="field-hint">Paste the complete result to preview it.</p>
    );
  if (!parsed.ok) return <p className="form-error">{parsed.message}</p>;
  return (
    <div className="parse-preview">
      <div>
        <span>Date</span>
        <strong>{formatDate(parsed.value.date)}</strong>
      </div>
      <div>
        <span>Rounds</span>
        <strong>{parsed.value.roundScores.join(" · ")}</strong>
      </div>
      <div>
        <span>Final</span>
        <strong>{parsed.value.finalScore}</strong>
      </div>
      {!parsed.value.date.isCalendarDate && (
        <p className="warning">
          This date will be saved but won’t appear in leaderboard widgets.
        </p>
      )}
    </div>
  );
}

function DailyLeaderboard({
  snapshot,
  selectedDate,
  onSelectedDate,
}: {
  snapshot: LeaderboardSnapshot;
  selectedDate: MapTapDate;
  onSelectedDate: (date: MapTapDate) => void;
}) {
  const [rows, setRows] = useState(snapshot.leaderboard);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function changeDate(date: MapTapDate) {
    setBusy(true);
    setExpanded(null);
    try {
      const response = await api<{ leaderboard: LeaderboardRow[] }>(
        `/api/leaderboards/${snapshot.leaderboard.id}/leaderboard?date=${dateKey(date)}`,
      );
      setRows(response.leaderboard);
      onSelectedDate(date);
    } finally {
      setBusy(false);
    }
  }

  const previous = shiftCalendarDate(selectedDate, -1);
  const next = shiftCalendarDate(selectedDate, 1);
  const previousDisabled =
    !snapshot.earliestResultDate ||
    compareDates(previous, snapshot.earliestResultDate) < 0;
  const nextDisabled = compareDates(next, snapshot.leaderboard.currentDate) > 0;

  return (
    <section className="card widget leaderboard-widget">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Daily leaderboard</p>
          <h2>{formatDate(selectedDate, { year: undefined })}</h2>
        </div>
        <div className="date-nav">
          <button
            aria-label="Previous day"
            disabled={busy || previousDisabled}
            onClick={() => void changeDate(previous)}
          >
            ←
          </button>
          <button
            aria-label="Next day"
            disabled={busy || nextDisabled}
            onClick={() => void changeDate(next)}
          >
            →
          </button>
        </div>
      </div>
      <RankingTable rows={rows} expanded={expanded} onExpanded={setExpanded} />
    </section>
  );
}

function RankingTable({
  rows,
  expanded,
  onExpanded,
}: {
  rows: LeaderboardRow[] | PersonalBestRow[];
  expanded: string | null;
  onExpanded: (id: string | null) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Participant</th>
            <th>Score</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ScoreRow
              key={row.participant.id}
              row={row}
              expanded={expanded === row.participant.id}
              onToggle={() =>
                onExpanded(
                  expanded === row.participant.id ? null : row.participant.id,
                )
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreRow({
  row,
  expanded,
  onToggle,
}: {
  row: LeaderboardRow | PersonalBestRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td className="rank">{row.rank ?? "—"}</td>
        <td>{row.participant.name}</td>
        <td className="score">
          {row.result ? (
            row.result.finalScore
          ) : (
            <span aria-label="No result">—</span>
          )}
        </td>
        <td>
          {row.result && (
            <button
              className="detail-button"
              onClick={onToggle}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : "Rounds"}
            </button>
          )}
        </td>
      </tr>
      {expanded && row.result && (
        <tr className="round-detail">
          <td colSpan={4}>
            {row.result.roundScores.map((score, index) => (
              <span key={index}>
                Round {index + 1}
                <strong>{score}</strong>
              </span>
            ))}
            <span>
              Date<strong>{formatDate(row.result.date)}</strong>
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

function ScoreHistory({
  snapshot,
  days,
  onDays,
}: {
  snapshot: LeaderboardSnapshot;
  days: 7 | 30;
  onDays: (days: 7 | 30) => void;
}) {
  const [results, setResults] = useState(snapshot.history);
  const [busy, setBusy] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  async function changeDays(value: 7 | 30) {
    setBusy(true);
    try {
      const response = await api<{
        history: ResultView[];
        historyDays: 7 | 30;
      }>(`/api/leaderboards/${snapshot.leaderboard.id}/history?days=${value}`);
      setResults(response.history);
      onDays(response.historyDays);
    } finally {
      setBusy(false);
    }
  }

  const participants = snapshot.participants.filter((participant) =>
    results.some((result) => result.participantId === participant.id),
  );
  const dates = dateRange(snapshot.leaderboard.currentDate, days);
  const chartData = dates.map((date) => {
    const point: Record<string, string | number | null> = {
      date: formatDate(date, { year: undefined }),
    };
    for (const participant of participants) {
      point[participant.id] =
        results.find(
          (result) =>
            result.participantId === participant.id &&
            dateKey(result.date) === dateKey(date),
        )?.finalScore ?? null;
    }
    return point;
  });

  return (
    <section className="card widget history-widget">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Score history</p>
          <h2>Recent form</h2>
        </div>
        <div className="segmented" aria-label="History range">
          {[7, 30].map((value) => (
            <button
              key={value}
              className={days === value ? "active" : ""}
              onClick={() => void changeDays(value as 7 | 30)}
              disabled={busy}
            >
              {value} days
            </button>
          ))}
        </div>
      </div>
      {participants.length ? (
        <>
          <div className="chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 12, bottom: 4, left: -16 }}
              >
                <CartesianGrid strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis domain={[0, 1000]} tick={{ fontSize: 12 }} />
                <Tooltip />
                {participants.map((participant, index) => (
                  <Line
                    key={participant.id}
                    dataKey={participant.id}
                    name={participant.name}
                    stroke={participantColor(participant.id, index)}
                    strokeWidth={2.5}
                    connectNulls={false}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            {participants.map((participant, index) => (
              <span key={participant.id}>
                <i
                  style={{
                    background: participantColor(participant.id, index),
                  }}
                />
                {participant.name}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-copy">No results in this period.</p>
      )}
      <button
        className="text-button"
        onClick={() => setTableOpen((value) => !value)}
      >
        {tableOpen ? "Hide data table" : "View data table"}
      </button>
      {tableOpen && (
        <div className="table-wrap history-table">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                {dates.map((date) => (
                  <th key={dateKey(date)}>
                    {formatDate(date, { year: undefined })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => (
                <tr key={participant.id}>
                  <th>{participant.name}</th>
                  {dates.map((date) => {
                    const score = results.find(
                      (result) =>
                        result.participantId === participant.id &&
                        dateKey(result.date) === dateKey(date),
                    )?.finalScore;
                    return (
                      <td key={dateKey(date)}>
                        {score ?? <span aria-label="No result">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PersonalBests({ rows }: { rows: PersonalBestRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section className="card widget best-widget">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Personal bests</p>
          <h2>All-time highs</h2>
        </div>
      </div>
      <RankingTable rows={rows} expanded={expanded} onExpanded={setExpanded} />
    </section>
  );
}

function ShareDialog({
  leaderboardId,
  leaderboardName,
  onClose,
}: {
  leaderboardId: string;
  leaderboardName: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [verifiedPassword, setVerifiedPassword] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const url = `${window.location.origin}/d/${leaderboardId}`;
  const invite = `Join “${leaderboardName}”:\n${url}\nPassword: ${verifiedPassword}`;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/leaderboards/${leaderboardId}/share/verify`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setVerifiedPassword(password);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Couldn’t verify password.",
      );
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">Share leaderboard</p>
          <h2>Invite your group</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <label>
        Leaderboard URL
        <div className="inline-control">
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="button secondary" onClick={() => void copy(url)}>
            Copy
          </button>
        </div>
      </label>
      {!verifiedPassword ? (
        <form className="stack-form" onSubmit={verify}>
          <p className="muted">
            Re-enter the password to include it in copyable invite text.
          </p>
          <label>
            Leaderboard password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary">Verify password</button>
        </form>
      ) : (
        <>
          <label>
            Invite text
            <textarea
              readOnly
              value={invite}
              rows={4}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button className="button primary" onClick={() => void copy(invite)}>
            {copied ? "Copied" : "Copy invite"}
          </button>
        </>
      )}
    </dialog>
  );
}

function ReplaceDialog({
  participantName,
  existing,
  incoming,
  onCancel,
  onReplace,
}: {
  participantName: string;
  existing: ResultView;
  incoming: ParsedResult;
  onCancel: () => void;
  onReplace: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} className="modal" onCancel={onCancel}>
      <div className="modal-heading">
        <div>
          <p className="eyebrow">Existing result</p>
          <h2>Replace {participantName}’s score?</h2>
        </div>
        <button className="icon-button" onClick={onCancel} aria-label="Close">
          ×
        </button>
      </div>
      <p className="muted">{formatDate(incoming.date)} already has a result.</p>
      <div className="comparison">
        <div>
          <span>Existing</span>
          <strong>{existing.finalScore}</strong>
          <small>{existing.roundScores.join(" · ")}</small>
        </div>
        <div>
          <span>Incoming</span>
          <strong>{incoming.finalScore}</strong>
          <small>{incoming.roundScores.join(" · ")}</small>
        </div>
      </div>
      {!incoming.date.isCalendarDate && (
        <p className="warning">
          This result will not appear in calendar widgets.
        </p>
      )}
      <div className="modal-actions">
        <button className="button ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="button danger" onClick={onReplace}>
          Replace result
        </button>
      </div>
    </dialog>
  );
}

function findParticipant(participants: Participant[], value: string) {
  const normalized = normalizeName(value).normalized;
  return participants.find(
    (participant) => normalizeName(participant.name).normalized === normalized,
  );
}

function participantColor(id: string, index: number): string {
  const palette = [
    "#e05a33",
    "#246b63",
    "#7756a8",
    "#b18412",
    "#2e62a3",
    "#b13f69",
    "#477a30",
  ];
  const hash = Array.from(id).reduce(
    (value, character) => value + character.charCodeAt(0),
    index,
  );
  return palette[hash % palette.length];
}

function PageLoader() {
  return (
    <div className="page-loader" role="status">
      Loading leaderboard…
    </div>
  );
}

function Unavailable() {
  return (
    <section className="center-card">
      <p className="eyebrow">Leaderboard unavailable</p>
      <h1>We couldn’t open that leaderboard.</h1>
      <p className="muted">Check the shared URL and try again.</p>
      <Link className="button primary" to="/">
        Back home
      </Link>
    </section>
  );
}
