const fs = require("node:fs");

const USAGE = "usage: node app/tools/job-progress.js <state-file> <job-id>\n";
const UNREADABLE = "job-progress: state file is unreadable\n";
const NOT_JSON = "job-progress: state file is not valid JSON\n";
const INVALID_STATE = "job-progress: state file has invalid Relay state\n";
const NO_SUCH_JOB = "job-progress: no such job\n";
const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];
const STATUSES = new Set(["pending", "done", "dead"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isValidJob(job) {
  return (
    job !== null &&
    typeof job === "object" &&
    !Array.isArray(job) &&
    isNonEmptyString(job.id) &&
    isNonEmptyString(job.eventId) &&
    STATUSES.has(job.status) &&
    isNonNegativeInteger(job.attempts) &&
    isNonNegativeInteger(job.retries) &&
    isNonNegativeInteger(job.attemptsSinceRetry) &&
    (job.lastError === null || typeof job.lastError === "string")
  );
}

function isValidState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return false;
  }

  const keys = Object.keys(state);
  if (
    keys.length !== COLLECTIONS.length ||
    !COLLECTIONS.every(collection =>
      Object.prototype.hasOwnProperty.call(state, collection) &&
      Array.isArray(state[collection])
    ) ||
    !state.jobs.every(isValidJob)
  ) {
    return false;
  }

  return new Set(state.jobs.map(job => job.id)).size === state.jobs.length;
}

function fail(message, exitCode) {
  process.stderr.write(message);
  process.exitCode = exitCode;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    fail(USAGE, 2);
    return;
  }

  let contents;
  try {
    const stat = fs.statSync(args[0]);
    if (!stat.isFile()) {
      fail(UNREADABLE, 1);
      return;
    }
    contents = fs.readFileSync(args[0], "utf8");
  } catch {
    fail(UNREADABLE, 1);
    return;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    fail(NOT_JSON, 1);
    return;
  }

  if (!isValidState(state)) {
    fail(INVALID_STATE, 1);
    return;
  }

  const job = state.jobs.find(candidate => candidate.id === args[1]);
  if (job === undefined) {
    fail(NO_SUCH_JOB, 1);
    return;
  }

  process.stdout.write(`${JSON.stringify({
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    retries: job.retries,
  })}\n`);
}

main();
