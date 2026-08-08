# Casanova Budget

A private, local-first desktop app for tracking a monthly household budget.
Built with Tauri, React, and TypeScript. All data stays on your machine.

## Features

- **Dashboard** — income, spending, and remaining budget at a glance
- **Expenses** — add, edit, and delete expenses with categories and payment methods
- **Categories & budgets** — group categories, set monthly budgets, and get spending alerts
- **Budget ledger** — a monthly view with per-category and per-payment-method totals, exportable to PDF
- **Year in Review** — year-to-date totals and pacing
- **Backup & restore** — export and import all data as JSON
- **Local-first** — data is stored in your platform's app-data directory

## Development

Requires [Node.js](https://nodejs.org), [pnpm](https://pnpm.io), and the
[Rust toolchain](https://www.rust-lang.org/tools/install) with the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
pnpm install       # install dependencies
pnpm tauri dev     # run the app in development
pnpm tauri build   # build a production bundle
```

## Tech stack

- [Tauri 2](https://tauri.app) (Rust) for the desktop shell and native storage
- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) for the frontend build
- [Tailwind CSS 4](https://tailwindcss.com) for styling
- [Zustand](https://github.com/pmndrs/zustand) for state
- [Recharts](https://recharts.org) for charts, [jsPDF](https://github.com/parallax/jsPDF) for PDF export

## License

Private project. All rights reserved.
