# AVENZO ONE — Rapid-Draft-01 Three-Hour Reservation

Status: Rapid-BE-02A approved and closed — Owner recovery test passed on 22 August 2026

## Outcome

- Browser Draft saves silently after 400 ms and remains scoped to the current Organization and user.
- The latest valid draft is flushed immediately when the page is hidden or closed, covering edits made inside the 400 ms debounce window.
- Choosing a 50-code range now calls the trusted server-only reservation RPC.
- The server returns the authoritative Batch ID and expiry; the fixed TTL is three hours.
- The reservation Command ID is stable across an unknown timeout so retry cannot reserve a second range accidentally.
- The UI shows remaining time, warning/critical states and an expired state.
- Expiry never deletes entered data and never refreshes itself through autosave.
- Final review is blocked after expiry; the user must clear the Draft and reserve a new range.
- Refresh recovery reads the current actor's latest unexpired reservation from the trusted Organization-scoped database state, so the same 50-row table returns without reserving another range.
- Owner verification recovered `A017–A066`, rendered all 50 rows from `A017` through `A066`, and produced no Browser console error or warning.

## Safety boundary

- Browser code cannot write reservation tables or call Supabase RPC directly.
- Permission remains `product.create` and the server uses the existing atomic/idempotent GSC-04 RPC.
- This checkpoint reserves Sales Codes only. Product/SKU creation, image upload and Stock posting remain pending Rapid backend integration.
