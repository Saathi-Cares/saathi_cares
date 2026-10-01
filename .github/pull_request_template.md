## What and why

<!-- One paragraph: what this change does and which PLAN.md section it implements. -->

## Definition of done (PLAN.md §23.4)

- [ ] Schema migration applied on a clean database and on a database at the previous release (expand/contract verified).
- [ ] Service tests cover every state transition, every permission and scope rule, every constraint the plan states, and the failure paths in §9.7.
- [ ] Authorisation matrix rows exist for every new endpoint and the matrix test passes.
- [ ] Privacy tests pass where the module touches T2/T3 data (§8.9).
- [ ] Smoke e2e updated if the module adds a primary user flow.
- [ ] Module `README.md` written: purpose, tables, state machines with diagrams, permissions, jobs, the API section, and the plan sections it implements.
- [ ] `docs/api/CHANGELOG.md` and the internal changelog updated.
- [ ] Deployed to staging, exercised by the developer on a phone, and the exit criteria of its phase ticked in the phase note under `docs/adr/`.
- [ ] Claims in this description cite a file and line (PLAN.md §23.6).
