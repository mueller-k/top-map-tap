import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  processGroupMeCandidates,
  type GroupMeImportCandidate,
  type ImportSummary,
} from "../../shared/history-import";
import { isValidName, normalizeName } from "../../shared/domain";
import { api, ApiRequestError } from "../api";
import { Turnstile } from "../components/Turnstile";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const GROUPME_HELP_URL = "https://support.microsoft.com/en-us/groupme";

type ImportSource = "none" | "groupme";
type Step = "details" | "import" | "review";

interface ConfigResponse {
  turnstileSiteKey: string;
  turnstileRequired: boolean;
}

interface GroupMePreview {
  candidates: GroupMeImportCandidate[];
  summary: ImportSummary;
}

export function CreateLeaderboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [detailsComplete, setDetailsComplete] = useState(false);
  const [importSource, setImportSource] = useState<ImportSource>("none");
  const [fileName, setFileName] = useState("");
  const [groupMePreview, setGroupMePreview] =
    useState<GroupMePreview | null>(null);
  const [processing, setProcessing] = useState(false);
  const [importError, setImportError] = useState("");
  const [creationError, setCreationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [turnstileRequired, setTurnstileRequired] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  const pathStep = location.pathname.split("/").at(-1);
  const step: Step =
    pathStep === "import" || pathStep === "review" ? pathStep : "details";
  const restartMessage =
    typeof location.state === "object" &&
    location.state !== null &&
    "restart" in location.state;

  useEffect(() => {
    void api<ConfigResponse>("/api/config").then((config) => {
      setSiteKey(config.turnstileSiteKey);
      setTurnstileRequired(config.turnstileRequired);
    });
  }, []);

  useEffect(() => {
    if (
      (step === "import" || step === "review") &&
      !detailsComplete
    ) {
      navigate("/create/details", {
        replace: true,
        state: { restart: true },
      });
      return;
    }
    if (step === "review" && importSource === "groupme" && !groupMePreview) {
      navigate("/create/import", { replace: true });
      return;
    }
    headingRef.current?.focus();
  }, [
    detailsComplete,
    groupMePreview,
    importSource,
    navigate,
    step,
  ]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  function submitDetails(event: FormEvent) {
    event.preventDefault();
    setCreationError("");
    if (!isValidName(name, 60)) {
      setCreationError("Leaderboard name must be 1–60 characters.");
      return;
    }
    if (
      password !== confirmPassword ||
      Array.from(password).length < 8 ||
      Array.from(password).length > 128
    ) {
      setCreationError("Passwords must match and be 8–128 characters.");
      return;
    }
    setDetailsComplete(true);
    navigate("/create/import");
  }

  function chooseImportSource(next: ImportSource) {
    setImportSource(next);
    setImportError("");
    if (next === "none") resetFile();
  }

  function resetFile() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setProcessing(false);
    setFileName("");
    setGroupMePreview(null);
  }

  function processFile(file: File | undefined) {
    resetFile();
    setImportError("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setImportError("Choose a JSON export no larger than 10 MB.");
      return;
    }
    setFileName(file.name);
    setProcessing(true);
    const worker = new Worker(
      new URL("../workers/groupmeImportWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<
        | { ok: true; value: GroupMePreview }
        | { ok: false; code: string }
      >,
    ) => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setProcessing(false);
      if (event.data.ok) {
        setGroupMePreview(event.data.value);
        return;
      }
      setFileName("");
      setGroupMePreview(null);
      setImportError(importMessage(event.data.code));
    };
    worker.onerror = () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setProcessing(false);
      setFileName("");
      setImportError("Couldn’t process this export. Choose another file.");
    };
    worker.postMessage({ file, now: new Date().toISOString() });
  }

  function continueFromImport() {
    setImportError("");
    if (importSource === "groupme") {
      if (!groupMePreview) {
        setImportError("Choose and process a GroupMe export first.");
        return;
      }
      const refreshed = processGroupMeCandidates(
        groupMePreview.candidates,
        new Date(),
      );
      if (!refreshed.ok) {
        resetFile();
        setImportError(importMessage(refreshed.code));
        return;
      }
      setGroupMePreview({
        candidates: refreshed.value.candidates,
        summary: refreshed.value.summary,
      });
    }
    navigate("/create/review");
  }

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  async function createLeaderboard() {
    setBusy(true);
    setCreationError("");
    try {
      const importFields =
        importSource === "groupme" && groupMePreview
          ? {
              importCandidates: groupMePreview.candidates,
              importSummary: groupMePreview.summary,
            }
          : {};
      const response = await api<{ leaderboard: { id: string } }>(
        "/api/leaderboards",
        {
          method: "POST",
          body: JSON.stringify({
            name: normalizeName(name).display,
            password,
            confirmPassword,
            turnstileToken,
            importSource,
            ...importFields,
          }),
        },
      );
      navigate(`/d/${response.leaderboard.id}`);
    } catch (requestError) {
      setTurnstileToken("");
      setTurnstileResetKey((value) => value + 1);
      if (
        requestError instanceof ApiRequestError &&
        requestError.code === "IMPORT_PREVIEW_MISMATCH"
      ) {
        resetFile();
        setImportError(requestError.message);
        navigate("/create/import");
        return;
      }
      setCreationError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Couldn’t create leaderboard.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (location.pathname === "/create" || location.pathname === "/create/") {
    return <Navigate to="/create/details" replace />;
  }

  return (
    <div className="create-page">
      <nav aria-label="Create leaderboard progress">
        <ol className="wizard-progress">
          {(["details", "import", "review"] as Step[]).map((item, index) => (
            <li key={item} aria-current={step === item ? "step" : undefined}>
              <span>{index + 1}</span>
              {stepLabel(item)}
            </li>
          ))}
        </ol>
      </nav>

      <section className="card wizard-card">
        {step === "details" && (
          <form className="stack-form" onSubmit={submitDetails}>
            <div>
              <p className="eyebrow">New leaderboard</p>
              <h1 ref={headingRef} tabIndex={-1}>
                Choose the details.
              </h1>
              <p className="muted">
                Give your group a name and a shared password.
              </p>
            </div>
            {restartMessage && (
              <p className="inline-notice error" role="alert">
                Start again to protect your password and import data.
              </p>
            )}
            <label>
              Leaderboard name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                required
              />
            </label>
            <label>
              Shared password
              <input
                type={showPasswords ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(event) => setShowPasswords(event.target.checked)}
              />
              Reveal password
            </label>
            {creationError && (
              <p className="form-error" role="alert">
                {creationError}
              </p>
            )}
            <div className="wizard-actions">
              <Link className="button ghost" to="/">
                Back
              </Link>
              <button className="button primary">Continue</button>
            </div>
          </form>
        )}

        {step === "import" && (
          <div className="stack-form">
            <div>
              <p className="eyebrow">Optional history</p>
              <h1 ref={headingRef} tabIndex={-1}>
                Choose an import source.
              </h1>
              <p className="muted">
                Bring existing MapTap Results into this Leaderboard.
              </p>
            </div>

            <fieldset className="source-options">
              <legend>Import source</legend>
              <label>
                <input
                  type="radio"
                  name="import-source"
                  checked={importSource === "none"}
                  onChange={() => chooseImportSource("none")}
                />
                <span>
                  <strong>No import</strong>
                  <small>Start with an empty Leaderboard.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="import-source"
                  checked={importSource === "groupme"}
                  onChange={() => chooseImportSource("groupme")}
                />
                <span>
                  <strong>GroupMe</strong>
                  <small>Import Results from a GroupMe JSON export.</small>
                </span>
              </label>
            </fieldset>

            {importSource === "groupme" && (
              <div className="import-panel">
                <p className="privacy-note">
                  Your export is processed on this device. Only valid MapTap
                  messages needed to create the Leaderboard are sent to Top Map
                  Tap; unrelated chat messages are not uploaded.
                </p>
                <p className="field-hint">
                  JSON export, up to 10 MB and 250 Results.{" "}
                  <a
                    className="text-link"
                    href={GROUPME_HELP_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    GroupMe export help
                  </a>
                </p>
                {!groupMePreview && !processing && (
                  <label>
                    GroupMe JSON export
                    <input
                      key={fileName || "empty"}
                      type="file"
                      accept=".json,application/json"
                      onChange={(event) =>
                        processFile(event.target.files?.[0])
                      }
                    />
                  </label>
                )}
                <p aria-live="polite">
                  {processing ? `Processing ${fileName}…` : ""}
                </p>
                {processing && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={resetFile}
                  >
                    Cancel processing
                  </button>
                )}
                {groupMePreview && (
                  <ImportSummaryView
                    fileName={fileName}
                    summary={groupMePreview.summary}
                    onReplace={resetFile}
                  />
                )}
                {importError && (
                  <p className="form-error" role="alert">
                    {importError}
                  </p>
                )}
              </div>
            )}

            <div className="wizard-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => navigate("/create/details")}
              >
                Back
              </button>
              <button
                type="button"
                className="button primary"
                disabled={processing}
                onClick={continueFromImport}
              >
                {importSource === "none"
                  ? "Continue without import"
                  : "Continue"}
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="stack-form">
            <div>
              <p className="eyebrow">Ready to create</p>
              <h1 ref={headingRef} tabIndex={-1}>
                Review your Leaderboard.
              </h1>
            </div>
            <dl className="review-list">
              <div>
                <dt>Leaderboard name</dt>
                <dd>
                  {normalizeName(name).display}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => navigate("/create/details")}
                  >
                    Edit details
                  </button>
                </dd>
              </div>
              <div>
                <dt>Import source</dt>
                <dd>{importSource === "groupme" ? "GroupMe" : "No import"}</dd>
              </div>
            </dl>
            {importSource === "groupme" && groupMePreview && (
              <ImportSummaryView
                fileName={fileName}
                summary={groupMePreview.summary}
              />
            )}
            {turnstileRequired && siteKey && (
              <Turnstile
                siteKey={siteKey}
                resetKey={turnstileResetKey}
                onToken={handleTurnstileToken}
              />
            )}
            {creationError && (
              <p className="form-error" role="alert">
                {creationError}
              </p>
            )}
            <div className="wizard-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => navigate("/create/import")}
              >
                Back
              </button>
              <button
                type="button"
                className="button primary"
                disabled={
                  busy || (turnstileRequired && !turnstileToken)
                }
                onClick={() => void createLeaderboard()}
              >
                {busy ? "Creating…" : "Create leaderboard"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ImportSummaryView({
  fileName,
  summary,
  onReplace,
}: {
  fileName: string;
  summary: ImportSummary;
  onReplace?: () => void;
}) {
  return (
    <div className="import-summary">
      <div className="summary-heading">
        <div>
          <strong>{fileName}</strong>
          <p>
            {summary.resultCount} {plural(summary.resultCount, "Result")} across{" "}
            {summary.participantNames.length}{" "}
            {plural(summary.participantNames.length, "Participant")}
          </p>
        </div>
        {onReplace && (
          <button type="button" className="text-button" onClick={onReplace}>
            Choose a different file
          </button>
        )}
      </div>
      {summary.dateRange && (
        <p>
          <span>Date range</span>{" "}
          {formatDateRange(
            summary.dateRange.earliest,
            summary.dateRange.latest,
          )}
        </p>
      )}
      <div>
        <span>Participants</span>
        <ul className="participant-name-list">
          {summary.participantNames.map((participantName) => (
            <li key={participantName}>{participantName}</li>
          ))}
        </ul>
      </div>
      <p className="warning">
        GroupMe display names will become Participant names and can’t currently
        be changed.
      </p>
    </div>
  );
}

function importMessage(code: string): string {
  if (code === "INVALID_JSON") return "This file isn’t valid JSON.";
  if (code === "EXPECTED_ARRAY") {
    return "Choose a GroupMe export containing a top-level message array.";
  }
  if (code === "NO_RESULTS") return "No MapTap Results found.";
  if (code === "TOO_MANY_RESULTS") {
    return "This export contains more than 250 Results.";
  }
  if (code === "TOO_MANY_PARTICIPANTS") {
    return "This export contains more than 25 Participants.";
  }
  return "Couldn’t process this export. Choose another file.";
}

function stepLabel(step: Step) {
  if (step === "details") return "Details";
  if (step === "import") return "Import";
  return "Review";
}

function plural(value: number, singular: string) {
  return value === 1 ? singular : `${singular}s`;
}

function formatDateRange(
  earliest: { year: number; month: number; day: number },
  latest: { year: number; month: number; day: number },
) {
  const start = new Date(
    Date.UTC(earliest.year, earliest.month - 1, earliest.day),
  );
  const end = new Date(Date.UTC(latest.year, latest.month - 1, latest.day));
  const sameDay = start.getTime() === end.getTime();
  const sameYear = earliest.year === latest.year;
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: sameYear && !sameDay ? undefined : "numeric",
    timeZone: "UTC",
  });
  if (sameDay) return formatter.format(start);
  const endFormatter = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)}–${endFormatter.format(end)}`;
}
