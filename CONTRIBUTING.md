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

The README's [Development](README.md#development) section has the full command
list, including the frontend build.

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
the open items (the zone-map bundle repeats its source comments, so it is left
out):

```bash
git grep -n "TODO(REVIEW_REPORT.md" -- ':!custom_components/apollo_mmwave/www'
```

## Test your code modification

This custom component is based on [integration_blueprint template](https://github.com/ludeeus/integration_blueprint).

Before opening a pull request, run what CI runs:

- Python: `uv run --no-project pytest tests/` and `scripts/lint-check`.
- Frontend, when you changed anything in `frontend-src/`: in that folder,
  `npm ci`, `npx tsc --noEmit`, `npm test` and `npm run build`, then commit the
  rebuilt files under `custom_components/apollo_mmwave/www/`. CI builds the
  bundles on Node 22 and fails when a fresh build changes anything there, so
  rebuild with Node 22 too.

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
- A version bump touches five files, all listed in the README's
  [Development](README.md#development) section.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
