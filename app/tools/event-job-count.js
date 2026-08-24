"use strict";

const { readFileSync } = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyOwnString(record, key) {
  return (
    Object.hasOwn(record, key) &&
    typeof record[key] === "string" &&
    record[key].length > 0
  );
}

function isValidState(state) {
  if (
    !isRecord(state) ||
    !COLLECTIONS.every(
      (collection) => Object.hasOwn(state, collection) && Array.isArray(state[collection]),
    )
  ) {
    return false;
  }

  const eventIds = new Set();
  for (const event of state.events) {
    if (
      !isRecord(event) ||
      !isNonEmptyOwnString(event, "id") ||
      eventIds.has(event.id)
    ) {
      return false;
    }
    eventIds.add(event.id);
  }

  for (const job of state.jobs) {
    if (!isRecord(job) || !isNonEmptyOwnString(job, "eventId")) {
      return false;
    }
  }

  return true;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/event-job-count.js <state-file> <event-id>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("event-job-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("event-job-count: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("event-job-count: invalid Relay state\n");
    return 1;
  }

  const event = state.events.find((candidate) => candidate.id === args[1]);
  if (event === undefined) {
    process.stderr.write("event-job-count: event not found\n");
    return 1;
  }

  let jobs = 0;
  for (const job of state.jobs) {
    if (job.eventId === event.id) {
      jobs += 1;
    }
  }

  process.stdout.write(`${JSON.stringify({ eventId: event.id, jobs })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
