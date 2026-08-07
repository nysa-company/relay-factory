"use strict";

const fs = require("node:fs");

const JOB_STATUSES = ["pending", "done", "dead"];
const APPROVAL_STATUSES = ["pending", "sent", "rejected", "blocked_recipient"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasCollections(state) {
  return (
    isRecord(state) &&
    ["events", "jobs", "approvals", "outbox"].every(
      (key) => Object.hasOwn(state, key) && Array.isArray(state[key]),
    )
  );
}

function recordsHaveStatuses(records, statuses) {
  return records.every((record) => isRecord(record) && statuses.includes(record.status));
}

function countStatuses(records, statuses) {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  for (const record of records) {
    counts[record.status] += 1;
  }
  return counts;
}

function main(args) {
  if (args.length !== 1) {
    process.stderr.write("usage: node app/tools/state-summary.js <state-file>\n");
    return 2;
  }

  let bytes;
  try {
    const stat = fs.statSync(args[0]);
    if (!stat.isFile()) {
      throw new Error("not a regular file");
    }
    bytes = fs.readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("state-summary: state file is unreadable\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(bytes);
  } catch {
    process.stderr.write("state-summary: state file is not valid JSON\n");
    return 1;
  }

  if (
    !hasCollections(state) ||
    !recordsHaveStatuses(state.jobs, JOB_STATUSES) ||
    !recordsHaveStatuses(state.approvals, APPROVAL_STATUSES)
  ) {
    process.stderr.write("state-summary: state file has invalid Relay state\n");
    return 1;
  }

  const summary = {
    events: state.events.length,
    jobs: countStatuses(state.jobs, JOB_STATUSES),
    approvals: countStatuses(state.approvals, APPROVAL_STATUSES),
    outbox: state.outbox.length,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
