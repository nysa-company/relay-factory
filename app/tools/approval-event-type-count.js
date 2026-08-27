"use strict";

const fs = require("node:fs");

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

function isValidTopLevel(state) {
  return (
    isRecord(state) &&
    ["events", "jobs", "approvals", "outbox"].every(
      (collection) => Object.hasOwn(state, collection) && Array.isArray(state[collection]),
    )
  );
}

function validatedEventTypesById(state) {
  const eventTypesById = new Map();
  for (const event of state.events) {
    if (
      !isRecord(event) ||
      !isNonEmptyOwnString(event, "id") ||
      !isNonEmptyOwnString(event, "type") ||
      !isNonEmptyOwnString(event, "receivedAt") ||
      eventTypesById.has(event.id)
    ) {
      return null;
    }
    eventTypesById.set(event.id, event.type);
  }
  return eventTypesById;
}

function validatedEventTypeByJobId(state, eventTypesById) {
  const eventTypeByJobId = new Map();
  for (const job of state.jobs) {
    if (
      !isRecord(job) ||
      !isNonEmptyOwnString(job, "id") ||
      !isNonEmptyOwnString(job, "eventId") ||
      eventTypeByJobId.has(job.id) ||
      !eventTypesById.has(job.eventId)
    ) {
      return null;
    }
    eventTypeByJobId.set(job.id, eventTypesById.get(job.eventId));
  }
  return eventTypeByJobId;
}

function countApprovalsForEventType(state, eventTypeByJobId, eventType) {
  const approvalIds = new Set();
  let count = 0;
  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      !isNonEmptyOwnString(approval, "id") ||
      !isNonEmptyOwnString(approval, "jobId") ||
      approvalIds.has(approval.id) ||
      !eventTypeByJobId.has(approval.jobId)
    ) {
      return null;
    }
    approvalIds.add(approval.id);
    if (eventTypeByJobId.get(approval.jobId) === eventType) {
      count += 1;
    }
  }
  return count;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/approval-event-type-count.js <state-file> <event-type>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = fs.readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("approval-event-type-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("approval-event-type-count: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidTopLevel(state)) {
    process.stderr.write("approval-event-type-count: invalid Relay state\n");
    return 1;
  }

  const eventTypesById = validatedEventTypesById(state);
  const eventTypeByJobId = eventTypesById && validatedEventTypeByJobId(state, eventTypesById);
  const approvalsForEventType =
    eventTypeByJobId && countApprovalsForEventType(state, eventTypeByJobId, args[1]);

  if (eventTypesById === null || eventTypeByJobId === null || approvalsForEventType === null) {
    process.stderr.write("approval-event-type-count: invalid Relay state\n");
    return 1;
  }

  process.stdout.write(`${JSON.stringify({ approvalsForEventType })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
