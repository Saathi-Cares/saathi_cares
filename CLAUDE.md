# Working agreement for this repository

Read `PLAN.md` first. It is the single source of truth for what is built, how, and in which order. This file records how work is done here and the current state that is not derivable from the code.

## Current state (2026-10-02)

- Phase 0 is complete on the repository side (see `docs/adr/0001-phase-0-exit.md`). Nothing is deployed. The application runs on the developer's machine with the `dev` Compose profile (`infra/compose.dev.yaml`) or `npm run dev`.
- Hosting (VPS or cloud) is deliberately undecided. The owner will say when it is time; until then do not plan work that needs a server, and do not treat the deployment exit criteria as met. The deployment steps are Phase 1D (first deployment) in `PLAN.md` §18; they are carried out with `docs/runbooks/host-setup.md` and `docs/superpowers/plans/2026-09-29-phase0b-infra-deploy-backups.md` Task 8.
- The organisation's name and domain are provisional (`saathicares.org`, `staging.saathicares.org`, email `cares@saathiventures.com`). Contact details, statistics sources, logos and clinical wording are placeholders until the organisation returns `docs/requirements/SaathiCares-information-request.xlsx`. Do not block development on them; keep placeholder text obvious and listed in `README.md` "Known limitations".
- Local-only, git-excluded files: `ARCHITECTURE_AUDIT.md`, `RESEARCH_SAATHI_HEALIUM.md`, everything under `.superpowers/` (ledgers, briefs, reports). Never commit them.

## Truthfulness (PLAN.md §23.6)

Nothing is described, in code comments, README files, runbooks, reports or chat, as doing something the code does not do. Every claim names a file and line or quotes command output. What was not run is stated as not run. A component that exists only on paper is listed under "Dormant components" in `README.md`.

## Models and roles

- The orchestrating session (Fable) plans, briefs, rules on conflicts, reviews reports and talks to the owner. It does not do implementation work itself beyond small mechanical edits.
- Opus subagents implement. Sonnet subagents do read-only work: reviews, audits, research. Fable is never dispatched as a subagent.
- One subagent that runs builds, tests or Docker at a time on this machine. Read-only reviewers may run in parallel. Every long command is wrapped in `timeout`; implementers write a checkpoint file so a stalled agent can be resumed.
- The host has no `jq`; shell harnesses run in a throwaway `alpine:3.20` container.

## Independent, unbiased verification

A test written by the same process that wrote the code is not independent evidence. The rules that make review mean something here:

- Reviewers derive expected behaviour from `PLAN.md` and the task brief, not from the implementer's report. They verify each claim against the files, re-run what they can, and look for failure modes the brief did not list. "The report says so" is never evidence.
- Reviewers and implementers are told to think analytically and to disagree with the brief when the brief is wrong; a brief defect is a finding, not an instruction to follow.
- Every task gets a spec-compliance and a code-quality verdict from a different model than the implementer. The whole branch gets a final review on the most capable non-Fable model.
- Test sensitivity is checked, not assumed: a mutation check (break one condition in a module, run the suite, confirm a test fails, revert) is part of the final review of each phase, and its table goes in the phase ADR.
- Bugs found in the plan's own code are fixed with reproduction output, never silently.

## Git

- Work on a feature branch; per-task local commits with plain messages. Never add `Co-Authored-By` or any AI attribution trailer to commits or pull requests.
- Merge to `main` only when the owner says so. Push only when the owner says so, in their own words.
- Commits must leave the gate green: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:int` (needs the `saathi-test-pg` container on 127.0.0.1:5434, see `.env.test.local`), `npm run format:check`; `npm run build` and `npm run test:e2e` before a merge.

## Planning and execution

- Phases are executed with subagent-driven development: a brief per task extracted from the plan, an Opus implementer, a Sonnet task review, fix rounds (at most five), a final whole-branch review, one fix wave, a scoped re-review. Rulings are recorded in the plan's ledger under `.superpowers/sdd/<plan>/progress.md` as `Ruling: what — why — cost if wrong`.
- The owner approves each phase plan before execution and receives a report with the task list, barriers and their resolution, and decisions pending on them, without assumptions presented as facts.
