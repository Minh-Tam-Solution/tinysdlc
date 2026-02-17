# Contributing to TinySDLC

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/jlia0/tinyclaw.git
cd tinyclaw
npm install
npm run build
```

## Development

```bash
# Build TypeScript
npm run build

# Run locally
./tinyclaw.sh start

# View logs
./tinyclaw.sh logs all
```

### Project Structure

- `src/` - TypeScript source (queue processor, channel clients, routing)
- `lib/` - Bash scripts (daemon, setup wizard, messaging)
- `scripts/` - Installation and bundling scripts
- `.agents/skills/` - Agent skill definitions
- `docs/` - Documentation

## Documentation Standards

This project follows SDLC Enterprise Framework v6.0.6 (LITE tier). When adding documentation:

- Place docs in the appropriate stage folder under `docs/`:
  - `00-foundation/` - Why the project exists
  - `01-planning/` - Requirements and user stories
  - `02-design/` - Architecture and design decisions
  - `03-integrate/` - API contracts and integrations
  - `04-build/` - Development guides
- Use kebab-case for filenames: `my-feature-design.md`
- Do NOT put dates, sprint numbers, or versions in filenames
- See `docs/README.md` for the full documentation index

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test locally with `tinysdlc start`
4. Open a pull request

## Reporting Issues

Open an issue at [github.com/jlia0/tinyclaw/issues](https://github.com/jlia0/tinyclaw/issues) with:

- What you expected vs what happened
- Steps to reproduce
- Relevant logs (`tinyclaw logs all`)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
