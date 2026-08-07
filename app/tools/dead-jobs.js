const fs = require("node:fs");

const USAGE_ERROR = "Usage: node app/tools/dead-jobs.js <state-file>\n";
const INVALID_STATE_ERROR = "dead-jobs: invalid Relay state\n";
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
  return (
    keys.length === COLLECTIONS.length &&
    COLLECTIONS.every(collection => Array.isArray(state[collection])) &&
    state.jobs.every(isValidJob)
  );
}

const args = process.argv.slice(2);
if (args.length !== 1) {
  process.stderr.write(USAGE_ERROR);
  process.exitCode = 1;
} else {
  try {
    const state = JSON.parse(fs.readFileSync(args[0], "utf8"));
    if (!isValidState(state)) {
      throw new Error("invalid state");
    }

    const report = state.jobs
      .filter(job => job.status === "dead")
      .map(job => ({
        id: job.id,
        eventId: job.eventId,
        attempts: job.attempts,
        retries: job.retries,
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch {
    process.stderr.write(INVALID_STATE_ERROR);
    process.exitCode = 1;
  }
}
