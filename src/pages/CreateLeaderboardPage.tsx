import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
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

interface CreatedLeaderboard {
  id: string;
  name: string;
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
  const [groupMeLiveImport, setGroupMeLiveImport] = useState(false);
  const [groupMeGroupId, setGroupMeGroupId] = useState("");
  const [groupMeCallbackToken, setGroupMeCallbackToken] = useState("");
  const [deletionKey, setDeletionKey] = useState("");
  const [creationRequestId, setCreationRequestId] = useState("");
  const [createdLeaderboard, setCreatedLeaderboard] =
    useState<CreatedLeaderboard | null>(null);
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
  const isCreated = pathStep === "created";
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
    if (isCreated) {
      if (!createdLeaderboard || !deletionKey) {
        navigate("/", { replace: true });
        return;
      }
      headingRef.current?.focus();
      return;
    }
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
    createdLeaderboard,
    deletionKey,
    groupMePreview,
    importSource,
    isCreated,
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
    if (next === "none") {
      resetFile();
      setGroupMeLiveImport(false);
      setGroupMeGroupId("");
      setGroupMeCallbackToken("");
    }
  }

  function chooseGroupMeLiveImport(enabled: boolean) {
    setGroupMeLiveImport(enabled);
    setImportError("");
    if (enabled) {
      setGroupMeCallbackToken((token) => token || randomCallbackToken());
    } else {
      setGroupMeGroupId("");
      setGroupMeCallbackToken("");
    }
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
      if (
        groupMeLiveImport &&
        !/^\d{1,64}$/.test(groupMeGroupId.trim())
      ) {
        setImportError("Enter the numeric ID for this GroupMe group.");
        return;
      }
    }
    navigate("/create/review");
  }

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  async function createLeaderboard() {
    setBusy(true);
    setCreationError("");
    const nextDeletionKey = deletionKey || randomDeletionKey();
    const nextCreationRequestId = creationRequestId || crypto.randomUUID();
    if (!deletionKey) setDeletionKey(nextDeletionKey);
    if (!creationRequestId) setCreationRequestId(nextCreationRequestId);
    try {
      const importFields =
        importSource === "groupme" && groupMePreview
          ? {
              importCandidates: groupMePreview.candidates,
              importSummary: groupMePreview.summary,
            }
          : {};
      const response = await api<{ leaderboard: CreatedLeaderboard }>(
        "/api/leaderboards",
        {
          method: "POST",
          body: JSON.stringify({
            name: normalizeName(name).display,
            password,
            confirmPassword,
            turnstileToken,
            deletionKey: nextDeletionKey,
            creationRequestId: nextCreationRequestId,
            importSource,
            ...importFields,
            ...(groupMeLiveImport
              ? {
                  groupMeLiveImport: true,
                  groupMeGroupId: groupMeGroupId.trim(),
                  groupMeCallbackToken,
                }
              : {}),
          }),
        },
      );
      setCreatedLeaderboard(response.leaderboard);
      navigate("/create/created", { replace: true });
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
  if (isCreated) {
    if (!createdLeaderboard || !deletionKey) return null;
    return (
      <CreatedLeaderboardSetup
        headingRef={headingRef}
        leaderboard={createdLeaderboard}
        deletionKey={deletionKey}
        groupId={groupMeLiveImport ? groupMeGroupId.trim() : null}
        callbackUrl={
          groupMeLiveImport && groupMeCallbackToken
            ? `${window.location.origin}/api/groupme-callbacks/${groupMeCallbackToken}`
            : null
        }
        onContinue={() => navigate(`/d/${createdLeaderboard.id}`)}
      />
    );
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
                  <>
                    <ImportSummaryView
                      fileName={fileName}
                      summary={groupMePreview.summary}
                      onReplace={resetFile}
                    />
                    <div className="live-import-option">
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={groupMeLiveImport}
                          onChange={(event) =>
                            chooseGroupMeLiveImport(event.target.checked)
                          }
                        />
                        Automatically import future GroupMe Results
                      </label>
                      {groupMeLiveImport && (
                        <label>
                          GroupMe group ID
                          <input
                            inputMode="numeric"
                            pattern="[0-9]+"
                            maxLength={64}
                            value={groupMeGroupId}
                            onChange={(event) =>
                              setGroupMeGroupId(event.target.value)
                            }
                            required
                          />
                          <span className="field-hint">
                            An incorrect ID will cause callbacks to be silently
                            discarded.
                          </span>
                        </label>
                      )}
                    </div>
                  </>
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
              {groupMeLiveImport && (
                <div>
                  <dt>Future GroupMe Results</dt>
                  <dd>
                    Automatic import from group {groupMeGroupId.trim()}
                  </dd>
                </div>
              )}
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

function CreatedLeaderboardSetup({
  headingRef,
  leaderboard,
  deletionKey,
  groupId,
  callbackUrl,
  onContinue,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  leaderboard: CreatedLeaderboard;
  deletionKey: string;
  groupId: string | null;
  callbackUrl: string | null;
  onContinue: () => void;
}) {
  const [copiedDeletionKey, setCopiedDeletionKey] = useState(false);
  const [copiedCallbackUrl, setCopiedCallbackUrl] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copy(value: string, kind: "deletion" | "callback") {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError("");
      if (kind === "deletion") setCopiedDeletionKey(true);
      else setCopiedCallbackUrl(true);
    } catch {
      setCopyError("Copy failed. Select the text and copy it manually.");
    }
  }

  return (
    <div className="create-page">
      <section className="card wizard-card stack-form">
        <div>
          <p className="eyebrow">Leaderboard created</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Save your deletion key.
          </h1>
          <p className="muted">
            This key is shown only now. Top Map Tap cannot recover or replace
            it, and the shared password cannot delete this Leaderboard.
          </p>
        </div>

        <dl className="review-list">
          <div>
            <dt>Leaderboard</dt>
            <dd>{leaderboard.name}</dd>
          </div>
          {groupId && (
            <div>
              <dt>Expected GroupMe group ID</dt>
              <dd>{groupId}</dd>
            </div>
          )}
        </dl>

        <label>
          Deletion Key
          <div className="callback-url-control">
            <input
              readOnly
              value={deletionKey}
              onFocus={(event) => event.currentTarget.select()}
              aria-describedby="deletion-key-warning"
            />
            <button
              type="button"
              className="button secondary"
              onClick={() => void copy(deletionKey, "deletion")}
            >
              {copiedDeletionKey ? "Copied" : "Copy"}
            </button>
          </div>
        </label>
        <p id="deletion-key-warning" className="warning">
          Anyone with the shared password and this key can permanently delete
          the Leaderboard and all of its data.
        </p>

        {callbackUrl && groupId && (
          <div className="stack-form credential-section">
            <div>
              <h2>Connect your GroupMe bot</h2>
              <p className="muted">
                This Callback URL is also shown only now.
              </p>
            </div>
            <label>
              GroupMe Callback URL
              <div className="callback-url-control">
                <input
                  readOnly
                  value={callbackUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-describedby="callback-url-warning"
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void copy(callbackUrl, "callback")}
                >
                  {copiedCallbackUrl ? "Copied" : "Copy"}
                </button>
              </div>
            </label>
            <p id="callback-url-warning" className="warning">
              Anyone with this URL can submit callbacks for this connection.
              Don’t post it in the chat or share it elsewhere.
            </p>
            <ol className="setup-steps">
              <li>
                Open GroupMe’s{" "}
                <a
                  className="text-link"
                  href="https://dev.groupme.com/bots"
                  target="_blank"
                  rel="noreferrer"
                >
                  bot setup page
                </a>
                .
              </li>
              <li>Create a bot for group ID {groupId}.</li>
              <li>Paste this URL into the bot’s Callback URL field.</li>
            </ol>
          </div>
        )}

        {copyError && <p className="form-error">{copyError}</p>}

        <div className="wizard-actions setup-actions">
          <span className="field-hint">
            Closing or refreshing this page loses these credentials.
          </span>
          <button
            type="button"
            className="button primary"
            onClick={onContinue}
          >
            Continue to leaderboard
          </button>
        </div>
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

function randomCallbackToken(): string {
  return randomUrlToken();
}

function randomDeletionKey(): string {
  return `tmt_delete_${randomUrlToken()}`;
}

function randomUrlToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
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
