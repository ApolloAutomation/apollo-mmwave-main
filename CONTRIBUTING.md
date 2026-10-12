# Contribution guidelines

Contributions are welcome, and this project tries to keep the process open and
clear, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features

## GitHub is used for everything

GitHub is used to host code, to track issues and feature requests, as well as accept pull requests.

Pull requests are the best way to propose changes to the codebase.

1. Fork the repo and create your branch from `main`.
2. Run `scripts/bootstrap` to create `.venv` with the runtime and lint
   dependencies and install the pre-commit hook. It needs Python 3.14.2 or
   later available as `python`; to use another interpreter, name it:
   `PYTHON=python3.14 scripts/bootstrap`.
3. Install the test dependencies into the same `.venv` with
   `uv pip install -r requirements-test.txt` (bootstrap installs no pytest).
   [uv](https://docs.astral.sh/uv/) is needed for this step and for the pytest
   command, not for bootstrap or the lint scripts.
4. If you've changed something, update the documentation.
5. Make sure your code lints (using `scripts/lint`).
6. Test your contribution (see [Test your code modification](#test-your-code-modification)).
7. Issue that pull request!

The [Development](#development) section below has the full command list,
including the frontend build.

The pre-commit hook runs whichever `ruff` is on your `PATH`, so commit from a
shell with the venv active (`. .venv/bin/activate`). Without it the commit
fails with "Executable `ruff` not found", or runs some other installed Ruff.

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issues](../../issues)

GitHub issues are used to track public bugs.
Report a bug by [opening a new issue](../../issues/new/choose).

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

People *love* thorough bug reports. I'm not even kidding.

## Use a Consistent Coding Style

Use [Ruff](https://github.com/astral-sh/ruff) for linting and formatting. Run `scripts/lint` to format your code before submitting: it applies Ruff's safe fixes, formats, then checks. `scripts/lint-check` is the read-only check CI runs, and a tree that `scripts/lint` passes also passes `scripts/lint-check`. Both use the Ruff in `.venv` and stop with ".venv/bin/ruff not found: run scripts/bootstrap first" when there is none.

Items found in review and left open for a decision are marked in the code with
`TODO(REVIEW_REPORT.md <id>)` comments, where `<id>` is the item's entry in
`REVIEW_REPORT.md`. Ruff flags every TODO, so a Python marker ends its first
line with `# noqa: FIX002, TD003`; remove both when the item is fixed. To list
the open items (`www/` is build output, so it is left out):

```bash
git grep -n "TODO(REVIEW_REPORT.md" -- ':!custom_components/apollo_mmwave/www'
```

## Development

### What's inside

| Piece | Role |
| --- | --- |
| `custom_components/apollo_mmwave` | The integration: zone backend (occupancy sensors + `apollo_mmwave.update_zone` service), gate auto-calibration (`apollo_mmwave.calibrate_gates` and its companion services), serves the bundled JS, and registers the dashboard. |
| `…/www/apollo-radar-tuning.js` | Tuning cards (including the Auto-calibrate card) + the `custom:apollo-radar-tuning` dashboard strategy (built from `frontend-src/`). |
| `…/www/apollo-radar-zone-map-card.js` | The 2D zone-drawing card, forked from [zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card) (also built from `frontend-src/`). |

[ARCHITECTURE.md](ARCHITECTURE.md) has the full repository layout and shows how
the pieces fit together.

### Frontend

Frontend source lives in `frontend-src/` (TypeScript + Lit + Vite, with Vitest
tests). The build writes straight into the integration's `www/` folder, and the
built bundles are committed. CI runs the first four steps, on Node 22:

```bash
cd frontend-src
npm ci              # install exactly what package-lock.json pins
npx tsc --noEmit    # type check
npm test            # vitest
npm run build       # → ../custom_components/apollo_mmwave/www/*.js (one pass per bundle)
npm run watch       # rebuild both bundles on every save (Ctrl+C stops both)
```

Use `npm ci` rather than `npm install`, which can rewrite `package-lock.json`.
CI rebuilds the bundles and fails if anything under
`custom_components/apollo_mmwave/www/` differs from what is committed
(including a new or deleted file), so run `npm run build` and commit `www/` with
every frontend change. Build with Node 22 to match the committed output. Terser
strips most comments from the bundles, so a comment-only change usually leaves
them as they are, but comments inside template strings (CSS in the card
styles) do ship; run the build and let the check decide.

`npm run watch` needs a POSIX shell (macOS, Linux, the devcontainer or WSL). On
Windows npm runs scripts with `cmd.exe`, even from Git Bash, so run
`npm run watch:tuning` and `npm run watch:zone-map` in two terminals.

### Python backend

The Python backend has a pytest suite (`pytest-homeassistant-custom-component`)
and is linted with Ruff (see
[Use a Consistent Coding Style](#use-a-consistent-coding-style)). Steps 2 and 3
above set up `.venv` and uv. The Python 3.14.2 floor from step 2 is
`requires-python` in `pyproject.toml`. The full command list:

```bash
scripts/bootstrap                        # .venv: Home Assistant, Ruff, pre-commit + git hook
uv pip install -r requirements-test.txt  # test dependencies, same .venv
uv run --no-project pytest tests/
scripts/lint                             # Ruff: fix, format, then check
scripts/lint-check                       # read-only check, as the Lint workflow runs it
```

Do not run `uv venv` after bootstrap: uv refuses to replace an existing
`.venv`, and `uv venv --clear` would throw away Ruff and pre-commit.
`.venv/bin/python -m pytest tests/` runs the suite as well.

CI's test job starts from a clean checkout instead:

```bash
uv venv && uv pip install -r requirements-test.txt
uv run --no-project pytest tests/ -q --cov=custom_components/apollo_mmwave --cov-report=term-missing
```

That environment has no Ruff, so `scripts/lint` and `scripts/lint-check` stop
there with ".venv/bin/ruff not found: run scripts/bootstrap first". The coverage
flags work locally too (`pytest-cov` comes with
`pytest-homeassistant-custom-component`); CI prints the table and enforces no
threshold.

### Versions

The version is kept in five places:
`custom_components/apollo_mmwave/manifest.json`, `pyproject.toml`,
`frontend-src/package.json`, `CARD_VERSION` in `frontend-src/src/index.ts`, and
`frontend-src/package-lock.json` (refresh it with
`cd frontend-src && npm install --package-lock-only`).
`tests/test_versions.py` and `frontend-src/test/build.test.ts` fail if a copy
is missed. The manifest version is the `?v=` on the served bundles, so a
release that changes the bundles needs a bump, or browsers keep their cached
copy. Rebuild after bumping, since `CARD_VERSION` is part of the tuning bundle.

### Stored data

Zone data is persisted in `.storage/apollo_mmwave.zones`; installs upgrading
from ≤1.1.x are migrated automatically. 2.0 also rewrites zone entity unique
ids from the display-name slug to the device-keyed form. Entity ids are left
alone, and the card reads its configuration over the websocket API rather than
off a fixed entity id. Calibration snapshots (the newest five per radar) live
in a separate file, `.storage/apollo_mmwave.calibration`.

### The zone map card

The zone-drawing card is no longer vendored. It started as a copy of
[zone-mapper-card](https://github.com/ApolloAutomation/zone-mapper-card) and is
now a fork living in `frontend-src/src/zone-map/`: fixes land here first and
get offered back upstream, rather than being re-applied as patches on every
upstream drop.

## Test your code modification

This custom component is based on [integration_blueprint template](https://github.com/ludeeus/integration_blueprint).

Before opening a pull request, run what CI runs:

- Python: `uv run --no-project pytest tests/` and `scripts/lint-check`.
- Frontend, when you changed anything in `frontend-src/`: the four CI steps
  under [Frontend](#frontend), run with Node 22, then commit the rebuilt files
  under `custom_components/apollo_mmwave/www/`.

The project comes with a development environment in a container for Visual
Studio Code. It uses the `mcr.microsoft.com/devcontainers/python:3.14` image,
runs `scripts/setup` when the container is created (which runs
`scripts/bootstrap` into `./.venv`; install the test dependencies with
`uv pip install -r requirements-test.txt` as in step 3), and points VS Code's
Python interpreter at `.venv/bin/python`, so `hass`, `ruff` and `pre-commit`
come from that venv. `scripts/develop` starts
a standalone Home Assistant instance configured with the included
[`configuration.yaml`](./config/configuration.yaml) file, on port 8123. It uses
`./.venv` when there is one, so it also works from a plain shell outside the
container.

Notes for maintainers:

- `scripts/help` (shown when the container starts) lists each script with the
  text of its `# script/<name>:` header line, so give a new script that header,
  60 characters or fewer.
- Raising the Python floor means changing `requires-python` in
  `pyproject.toml`, the version check in `scripts/bootstrap` and the image tag
  in `.devcontainer.json` together. `tests/test_scripts.py` and
  `tests/test_devcontainer.py` fail if they disagree, and Dependabot does not
  bump the devcontainer base image.
- A Dependabot pull request that bumps an npm package in `frontend-src` fails
  the bundle check when the update changes the build output. Check it out, run
  `npm ci && npm run build` in `frontend-src`, and commit
  `custom_components/apollo_mmwave/www/` to that pull request.
- Dependabot does not bump `homeassistant`, `pytest-homeassistant-custom-component`
  or `home-assistant-frontend`. Move them by hand in one commit:
  `homeassistant==` in `requirements.txt`, the
  `pytest-homeassistant-custom-component` release that pins that same Home
  Assistant, and a `home-assistant-frontend` whose YYYYMMDD prefix matches it.
- A version bump touches five files, all listed under [Versions](#versions).

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
