# Relay product rulings

- 2026-07-28 — Detail-route envelopes and concurrent ownership (T-162 through
  T-165): successful detail responses are exactly
  `{"event":<stored event>,"job":<stored related job>}` for
  `GET /api/events/:id`,
  `{"job":<stored job>,"event":<stored related event>}` for
  `GET /api/jobs/:id`, and
  `{"approval":<stored approval>,"job":<stored related job>}` for
  `GET /api/approvals/:id`. The outbox response remains the ticket's exact
  `{"sandbox":true,"receipt":<stored outbox item>}` shape. These four additive
  routes may concurrently declare Builder ownership of `app/server.js`;
  protected publication remains serialized, and each later branch refreshes
  from current protected main before merge.
