# git-recap

A TypeScript CLI tool that generates marketing-ready year-in-review summaries of git contributions.

## Project Structure

```
src/
├── index.ts                    # CLI entry point (Commander.js)
├── commands/
│   ├── fetch.ts                # Fetches commits from GitHub via gh CLI
│   ├── process.ts              # AI-enhances highlights via Claude CLI
│   └── generate.ts             # Outputs markdown/linkedin formats
├── providers/
│   └── github.ts               # GitHub API wrapper using gh CLI
├── collectors/
│   ├── contributions.ts        # Commit/repo metrics aggregation
│   ├── highlights.ts           # Basic achievement detection
│   ├── diff-extractor.ts       # Extracts functions/classes from diffs
│   └── ai-highlights.ts        # Claude CLI integration (3-stage summarization)
├── formatters/
│   ├── markdown.ts             # Blog-ready markdown output
│   ├── linkedin.ts             # Plain text, engagement-optimized
│   └── ai-polish.ts            # AI polish for tone/engagement
└── types/
    └── recap-data.ts           # TypeScript interfaces
```

## Commands

```bash
# Fetch data from GitHub
git-recap fetch --year 2025 --github

# Process with AI (uses Claude CLI with haiku model)
git-recap process --input recap-2025

# Generate output
git-recap generate --input recap-2025 [--format markdown|linkedin] [--output file.md] [--ai-polish]
```

## Key Patterns

### Three-Phase Architecture

1. **fetch**: GitHub API → `recap-{year}/` folder (slow, API-bound)
2. **process**: Claude AI → enhanced highlights (optional, AI-bound)
3. **generate**: Formatters → stdout/file (fast, local)

Each phase can be re-run independently.

### AI Summarization (3 stages)

1. Per-commit: Generate marketing-ready description for each commit
2. Per-repo: Summarize achievements for each repository
3. Synthesis: Select top 5 achievements across all repos

### Data Flow

```
recap-2025/
├── recap.json          # Metrics, repos, highlights (+ aiGenerated after process)
└── commits/
    ├── {sha}.json      # Commit metadata (+ aiDescription after process)
    └── {sha}.diff      # Raw diff for context extraction
```

## Dependencies

- **Runtime**: Node.js 20+, `gh` CLI (authenticated), `claude` CLI (optional)
- **Build**: TypeScript, ESLint
- **Libraries**: Commander.js (CLI)

## Development

```bash
npm install
npm run build
node dist/index.js <command>
```

## Testing

```bash
# Full workflow
node dist/index.js fetch --year 2025 --github
node dist/index.js process --input recap-2025
node dist/index.js generate --input recap-2025
```

## Key Files

- `src/collectors/ai-highlights.ts`: Claude CLI integration with batching and fallback
- `src/collectors/diff-extractor.ts`: Regex patterns for extracting code structure
- `src/formatters/ai-polish.ts`: AI polish for final output (LinkedIn/blog tone)
- `src/types/recap-data.ts`: All TypeScript interfaces
