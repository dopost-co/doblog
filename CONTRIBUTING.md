# Contributing to Zenex CMS

Thanks for helping improve Zenex. Bug reports, documentation fixes and focused pull requests are welcome.

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- Open an issue before a large architectural change so the approach can be discussed early.
- Never include credentials, customer content or production data in an issue, test or commit.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Use Node.js 24 and PostgreSQL. Then:

```bash
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

The app runs at <http://localhost:4444>. Use synthetic local data only.

## Quality checks

Run these before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm test --prefix mcp-server
```

If you change the WordPress or PrestaShop connectors, also run `npm run connectors:build` and include the refreshed distributable files.

## Pull requests

- Keep each pull request focused and explain the user-visible outcome.
- Add or update tests for behavior changes.
- Update public documentation and `.env.example` when configuration changes.
- Preserve backwards compatibility for the public API, management API and MCP operations whenever possible.
- Call out migrations, security implications and deployment steps explicitly.

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).
