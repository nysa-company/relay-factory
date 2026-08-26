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

function isValidEventType(record) {
  if (!Object.hasOwn(record, "type")) {
    return false;
  }
  const value = record.type;
  if (typeof value === "string") {
    return value.length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }
  return false;
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
      !isValidEventType(event) ||
      !isNonEmptyOwnString(event, "receivedAt") ||
      eventIds.has(event.id)
    ) {
      return false;
    }
    eventIds.add(event.id);
  }

  return true;
}

function summarize(events) {
  const stringCounts = new Map();
  const numberCounts = new Map();

  for (const event of events) {
    const map = typeof event.type === "string" ? stringCounts : numberCounts;
    map.set(event.type, (map.get(event.type) || 0) + 1);
  }

  const stringEntries = [...stringCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const numberEntries = [...numberCounts.entries()].sort((a, b) => a[0] - b[0]);

  return [
    ...stringEntries.map(([type, count]) => ({ type, count })),
    ...numberEntries.map(([type, count]) => ({ type, count })),
  ];
}

function main(args) {
  if (args.length !== 1) {
    process.stderr.write(
      "usage: node app/tools/event-type-summary.js <state-file>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("event-type-summary: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("event-type-summary: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("event-type-summary: invalid Relay state\n");
    return 1;
  }

  const eventTypes = summarize(state.events);
  process.stdout.write(`${JSON.stringify({ eventTypes })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
