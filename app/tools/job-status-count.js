"use strict";

const { readFileSync } = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];
const STATUSES = new Set(["pending", "done", "dead"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasNonEmptyString(record, key) {
  return hasOwn(record, key) && typeof record[key] === "string" && record[key].length > 0;
}

function hasNonNegativeInteger(record, key) {
  return hasOwn(record, key) && Number.isInteger(record[key]) && record[key] >= 0;
}

function isValidJob(job) {
  return (
    isRecord(job) &&
    hasNonEmptyString(job, "id") &&
    hasNonEmptyString(job, "eventId") &&
    hasOwn(job, "status") &&
    STATUSES.has(job.status) &&
    hasNonNegativeInteger(job, "attempts") &&
    hasNonNegativeInteger(job, "retries") &&
    hasNonNegativeInteger(job, "attemptsSinceRetry") &&
    hasOwn(job, "lastError") &&
    (job.lastError === null || typeof job.lastError === "string")
  );
}

function isValidState(state) {
  if (
    !isRecord(state) ||
    Object.keys(state).length !== COLLECTIONS.length ||
    !COLLECTIONS.every(
      (collection) => hasOwn(state, collection) && Array.isArray(state[collection]),
    )
  ) {
    return false;
  }

  const jobIds = new Set();
  for (const job of state.jobs) {
    if (!isValidJob(job) || jobIds.has(job.id)) {
      return false;
    }
    jobIds.add(job.id);
  }
  return true;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/job-status-count.js <state-file> <status>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("job-status-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("job-status-count: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("job-status-count: invalid Relay state\n");
    return 1;
  }

  const jobsWithStatus = state.jobs.filter((job) => job.status === args[1]).length;
  process.stdout.write(`${JSON.stringify({ jobsWithStatus })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
