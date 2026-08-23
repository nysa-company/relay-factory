"use strict";

const fs = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];
const STATUSES = new Set(["pending", "done", "dead"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isValidJob(job) {
  return (
    isRecord(job) &&
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
  if (!isRecord(state)) {
    return false;
  }

  const keys = Object.keys(state);
  if (
    keys.length !== COLLECTIONS.length ||
    !COLLECTIONS.every(
      (collection) =>
        Object.prototype.hasOwnProperty.call(state, collection) &&
        Array.isArray(state[collection]),
    ) ||
    !state.jobs.every(isValidJob)
  ) {
    return false;
  }

  return new Set(state.jobs.map((job) => job.id)).size === state.jobs.length;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/job-attempts.js <state-file> <job-id>\n",
    );
    return 2;
  }

  let contents;
  try {
    const stat = fs.statSync(args[0]);
    if (!stat.isFile()) {
      process.stderr.write("job-attempts: state file is unreadable\n");
      return 1;
    }
    contents = fs.readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("job-attempts: state file is unreadable\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("job-attempts: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("job-attempts: state file has invalid Relay state\n");
    return 1;
  }

  const job = state.jobs.find((candidate) => candidate.id === args[1]);
  if (job === undefined) {
    process.stderr.write("job-attempts: no such job\n");
    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({
      jobId: job.id,
      attempts: job.attempts,
      attemptsSinceRetry: job.attemptsSinceRetry,
    })}\n`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
