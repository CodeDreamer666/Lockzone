# Repository Guidelines

## Project Structure & Module Organization

Keep application code in the repository's existing source directory (commonly `src/`), and keep static files in `public/` or the established assets directory. Place tests beside the code they cover or in the existing test directory; follow the surrounding convention. Avoid committing generated output such as `dist/`, `build/`, coverage reports, or dependency folders.

## Build, Test, and Development Commands

Use the scripts defined in `package.json` so local and CI workflows remain consistent:

- `npm install` — install the locked project dependencies.
- `npm run dev` — start the local development server.
- `npm run build` — create the production build and catch integration errors.
- `npm run lint` — check code style and common correctness issues.
- `npm test` — run the automated test suite, when provided.

Before opening a change, run the scripts that exist in `package.json`; do not add substitute commands that bypass project configuration.

## Coding Style & Naming Conventions

Use TypeScript where the project already does, two-space indentation, semicolons, and the repository's configured formatter/linter. Use `PascalCase` for React components and component files, `camelCase` for functions and variables, and descriptive kebab-case for route or asset names where that convention is already present. Keep game logic, rendering, and input handling focused and avoid unrelated refactors.

## Testing Guidelines

Add regression coverage for gameplay rules, state transitions, scoring, input handling, and failure cases when the repository's test framework supports it. Name tests after observable behaviour (for example, `player loses when health reaches zero`). Manually smoke-test the served game in a browser, including restart, keyboard controls, resize, and narrow viewport behaviour.

## Commit & Pull Request Guidelines

Write short, imperative commit subjects that explain the change (for example, `Fix projectile collision bounds`). Keep pull requests focused. Include a concise summary, testing commands and results, screenshots or a short recording for visual/gameplay changes, and any known limitations or follow-up work.

## Security & Configuration

Do not commit API keys, credentials, or machine-specific secrets. Put local values in the documented environment file and keep them out of version control. Validate externally supplied values and review asset or dependency changes before merging.
