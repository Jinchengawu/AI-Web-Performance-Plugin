# Contributing

Thanks for improving PerfLens.

## Development

1. Fork and clone the repository.
2. Install test dependencies with `npm ci`.
3. Load the repository root as an unpacked Chrome extension.
4. Run `npm test` before submitting a pull request.
5. Run `npm run test:browser` when changing probes, popup behavior, evidence intake, or export behavior.

Keep `perflens.audit-package` backward-compatible within schema major version 1. Document protocol decisions in `docs/adr/` and update fixtures when adding an evidence Adapter.

## Pull requests

- Explain the user impact and evidence behind the change.
- Add or update tests for behavior changes.
- Never commit API keys, private reports, exported source context, or customer data.
- Keep model-generated source modifications reviewable and user-confirmed.
