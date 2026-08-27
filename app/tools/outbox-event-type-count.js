"use strict";

const fs = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];
const APPROVAL_STATUSES = new Set([
  "pending",
  "sent",
  "rejected",
  "blocked_recipient",
]);

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

function validatedEventTypeById(state) {
  const eventTypeById = new Map();

  for (const event of state.events) {
    if (
      !isRecord(event) ||
      !isNonEmptyOwnString(event, "id") ||
      !isNonEmptyOwnString(event, "type") ||
      !isNonEmptyOwnString(event, "receivedAt") ||
      eventTypeById.has(event.id)
    ) {
      return null;
    }
    eventTypeById.set(event.id, event.type);
  }

  return eventTypeById;
}

function validatedJobEventTypeById(state, eventTypeById) {
  const jobEventTypeById = new Map();

  for (const job of state.jobs) {
    if (
      !isRecord(job) ||
      !isNonEmptyOwnString(job, "id") ||
      !isNonEmptyOwnString(job, "eventId") ||
      jobEventTypeById.has(job.id) ||
      !eventTypeById.has(job.eventId)
    ) {
      return null;
    }
    jobEventTypeById.set(job.id, eventTypeById.get(job.eventId));
  }

  return jobEventTypeById;
}

function validatedApprovalEventTypeById(state, jobEventTypeById) {
  const approvalEventTypeById = new Map();

  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      !isNonEmptyOwnString(approval, "id") ||
      !isNonEmptyOwnString(approval, "jobId") ||
      !Object.hasOwn(approval, "status") ||
      typeof approval.status !== "string" ||
      !APPROVAL_STATUSES.has(approval.status) ||
      approvalEventTypeById.has(approval.id) ||
      !jobEventTypeById.has(approval.jobId)
    ) {
      return null;
    }
    approvalEventTypeById.set(approval.id, jobEventTypeById.get(approval.jobId));
  }

  return approvalEventTypeById;
}

function isValidOutbox(state, approvalEventTypeById) {
  const referencedApprovalIds = new Set();

  for (const receipt of state.outbox) {
    if (
      !isRecord(receipt) ||
      !Object.hasOwn(receipt, "to") ||
      !Object.hasOwn(receipt, "subject") ||
      !Object.hasOwn(receipt, "body") ||
      !isNonEmptyOwnString(receipt, "approvalId") ||
      !isNonEmptyOwnString(receipt, "sentAt") ||
      referencedApprovalIds.has(receipt.approvalId) ||
      !approvalEventTypeById.has(receipt.approvalId)
    ) {
      return false;
    }
    referencedApprovalIds.add(receipt.approvalId);
  }

  return true;
}

function validatedApprovalEventTypeByIdForState(state) {
  if (
    !isRecord(state) ||
    !COLLECTIONS.every(
      (collection) => Object.hasOwn(state, collection) && Array.isArray(state[collection]),
    )
  ) {
    return null;
  }

  const eventTypeById = validatedEventTypeById(state);
  if (eventTypeById === null) {
    return null;
  }

  const jobEventTypeById = validatedJobEventTypeById(state, eventTypeById);
  if (jobEventTypeById === null) {
    return null;
  }

  return validatedApprovalEventTypeById(state, jobEventTypeById);
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/outbox-event-type-count.js <state-file> <event-type>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = fs.readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("outbox-event-type-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("outbox-event-type-count: state file is not valid JSON\n");
    return 1;
  }

  const approvalEventTypeById = validatedApprovalEventTypeByIdForState(state);
  if (approvalEventTypeById === null || !isValidOutbox(state, approvalEventTypeById)) {
    process.stderr.write("outbox-event-type-count: invalid Relay state\n");
    return 1;
  }

  const outboxEntriesForEventType = state.outbox.filter(
    (receipt) => approvalEventTypeById.get(receipt.approvalId) === args[1],
  ).length;
  process.stdout.write(`${JSON.stringify({ outboxEntriesForEventType })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
