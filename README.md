# Saathi Cares

Website and camp-management portals for **Saathi Cares** (SHC Foundation): taking oral healthcare to the last mile.

- Public site: home, contact and donate pages
- Admin portal: users and roles, camps, donations, enquiries, audit log
- HMIS portal: patient records, intake review workflow, prescriptions, referrals, camp coverage
- Volunteer portal: patient intake at camps, submissions, reports

> **Status:** all data is currently stored in the browser's `localStorage`. There is no backend yet. See `ARCHITECTURE_AUDIT.md`.

## Tech stack

Vite · React 18 · TypeScript · React Router · Tailwind CSS · shadcn/ui (Radix) · framer-motion · zod

## Getting started

Requires Node.js 18+ and npm.

```sh
npm ci           # install dependencies
npm run dev      # dev server on http://localhost:8080
```

If port 8080 is busy, run `npm run dev -- --port 8081`.

## Scripts

| Command           | What it does                         |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with hot reload |
| `npm run build`   | Production build to `dist/`          |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Run ESLint                           |

## Project layout

```
src/
  pages/        public pages + admin/, hmis/, volunteer/ portals
  components/   layout, home-page sections, ui/ (shadcn primitives)
  lib/          data layer (auth, rbac, camps, intake, donations, audit, cms)
  hooks/
public/         static assets (favicon, og-image, robots.txt)
```
