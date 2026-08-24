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
      !isNonEmptyOwnString(event, "type") ||
      !isNonEmptyOwnString(event, "receivedAt") ||
      eventIds.has(event.id)
    ) {
      return false;
    }
    eventIds.add(event.id);
  }

  return true;
}

function main(args) {
  if (args.length !== 1) {
    process.stderr.write("usage: node app/tools/event-count.js <state-file>\n");
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("event-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("event-count: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("event-count: invalid Relay state\n");
    return 1;
  }

  process.stdout.write(`${JSON.stringify({ events: state.events.length })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
