"use strict";

const { readFileSync } = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];
const JOB_STATUSES = new Set(["pending", "done", "dead"]);
const APPROVAL_STATUSES = new Set(["pending", "sent", "rejected", "blocked_recipient"]);

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
    JOB_STATUSES.has(job.status) &&
    hasNonNegativeInteger(job, "attempts") &&
    hasNonNegativeInteger(job, "retries") &&
    hasNonNegativeInteger(job, "attemptsSinceRetry") &&
    hasOwn(job, "lastError") &&
    (job.lastError === null || typeof job.lastError === "string")
  );
}

function validatedJobs(state) {
  const jobsById = new Map();
  for (const job of state.jobs) {
    if (!isValidJob(job) || jobsById.has(job.id)) {
      return null;
    }
    jobsById.set(job.id, job);
  }
  return jobsById;
}

function validatedApprovals(state, jobsById) {
  const approvalsById = new Map();
  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      !hasNonEmptyString(approval, "id") ||
      !hasNonEmptyString(approval, "jobId") ||
      !hasOwn(approval, "status") ||
      typeof approval.status !== "string" ||
      !APPROVAL_STATUSES.has(approval.status) ||
      approvalsById.has(approval.id) ||
      !jobsById.has(approval.jobId)
    ) {
      return null;
    }
    approvalsById.set(approval.id, approval);
  }
  return approvalsById;
}

function isValidOutbox(state, approvalsById) {
  const approvalIds = new Set();
  for (const receipt of state.outbox) {
    if (
      !isRecord(receipt) ||
      !hasOwn(receipt, "to") ||
      !hasOwn(receipt, "subject") ||
      !hasOwn(receipt, "body") ||
      !hasNonEmptyString(receipt, "approvalId") ||
      !hasNonEmptyString(receipt, "sentAt") ||
      approvalIds.has(receipt.approvalId) ||
      !approvalsById.has(receipt.approvalId)
    ) {
      return false;
    }
    approvalIds.add(receipt.approvalId);
  }
  return true;
}

function isValidState(state) {
  if (
    !isRecord(state) ||
    !COLLECTIONS.every((collection) => hasOwn(state, collection) && Array.isArray(state[collection]))
  ) {
    return null;
  }

  const jobsById = validatedJobs(state);
  if (jobsById === null) {
    return null;
  }

  const approvalsById = validatedApprovals(state, jobsById);
  if (approvalsById === null) {
    return null;
  }

  if (!isValidOutbox(state, approvalsById)) {
    return null;
  }

  return { jobsById, approvalsById };
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/outbox-job-status-count.js <state-file> <job-status>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("outbox-job-status-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("outbox-job-status-count: state file is not valid JSON\n");
    return 1;
  }

  const validated = isValidState(state);
  if (validated === null) {
    process.stderr.write("outbox-job-status-count: invalid Relay state\n");
    return 1;
  }

  const { jobsById, approvalsById } = validated;
  const outboxEntriesForJobStatus = state.outbox.filter((receipt) => {
    const approval = approvalsById.get(receipt.approvalId);
    const job = jobsById.get(approval.jobId);
    return job.status === args[1];
  }).length;

  process.stdout.write(`${JSON.stringify({ outboxEntriesForJobStatus })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
