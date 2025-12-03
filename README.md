# git-recap

Generate marketing-ready year-in-review summaries of your git contributions. Perfect for LinkedIn posts, blog articles, and personal branding.

## Features

- **AI-Enhanced Highlights**: Uses Claude to transform raw commit messages into compelling achievement descriptions
- **Smart Diff Analysis**: Extracts functions, classes, and patterns from diffs for richer context
- **Multiple Output Formats**: Markdown (blog-ready) and LinkedIn (plain text, optimized for engagement)
- **GitHub Integration**: Fetches all your contributions via `gh` CLI
- **Three-Phase Architecture**: Fetch → Process → Generate (each step can be re-run independently)

## Installation

```bash
npm install -g git-recap
```

### Prerequisites

- Node.js 20+
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (optional, for AI-enhanced highlights)

## Usage

### Step 1: Fetch Your Data

```bash
git-recap fetch --year 2025 --github
```

This creates a `recap-2025/` folder with:

- `recap.json` - Metrics, repositories, and highlights
- `commits/*.json` - Per-commit metadata
- `commits/*.diff` - Per-commit diffs

### Step 2: Process with AI (Optional)

```bash
git-recap process --input recap-2025
```

This uses Claude to:

1. Generate marketing-ready descriptions for each commit
2. Create per-repository achievement summaries
3. Synthesize top 5 achievements across all repos

### Step 3: Generate Output

```bash
# Markdown (blog-ready)
git-recap generate --input recap-2025

# LinkedIn (plain text)
git-recap generate --input recap-2025 --format linkedin

# With AI polish (engagement-optimized tone)
git-recap generate --input recap-2025 --format linkedin --ai-polish

# Save to file
git-recap generate --input recap-2025 --output recap.md
```

## Example Output

### Before AI Processing

```
- retry without rootId
- improve images
- WIP
```

### After AI Processing

```
- **Launched Trouvaille platform from scratch**: Built complete full-stack application
  with backend/frontend foundation, OAuth authentication with PKCE, JWT support, and
  photo management system with thumbnails (~8,000+ lines of code)
- **Implemented core listing features**: Added listing history tracking for audit trails,
  photo upload/storage with image validation, and redesigned MyAnnonces view
```

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  git-recap   │     │  git-recap   │     │  git-recap   │
│    fetch     │ ──▶ │   process    │ ──▶ │   generate   │
│  (GitHub)    │     │  (Claude)    │     │ (Formatters) │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
  recap-2025/          recap-2025/           stdout or
  ├── recap.json       ├── recap.json        recap.md
  └── commits/         │   + aiHighlights
      ├── *.json       └── commits/
      └── *.diff           └── *.json
                              + aiDescription
```

### Why Three Phases?

- **Re-run `process`** with different prompts without re-fetching data
- **Re-run `generate`** with different formats without re-processing
- **Each phase can fail independently** - partial progress is preserved

## Data Schema

### recap.json

```typescript
interface RecapData {
  meta: {
    year: number;
    username: string;
    fetchedAt: string;
  };
  metrics: {
    totalCommits: number;
    reposContributed: number;
    longestStreak: number;
    activeDays: number;
    topLanguages: Array<{ name: string; commits: number }>;
    commitTypes?: { feat; fix; refactor; docs; chore; test; perf };
  };
  repositories: Array<{
    name: string;
    owner: string;
    url: string;
    isOwner: boolean;
    commits: number;
    primaryLanguage: string;
  }>;
  highlights: {
    majorFeatures: string[];
    significantRefactors: string[];
    externalContributions: string[];
    aiGenerated?: {
      topAchievements: string[];
      byRepo: Record<string, string[]>;
    };
  };
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js fetch --year 2025 --github
node dist/index.js process --input recap-2025
node dist/index.js generate --input recap-2025
```

## License

MIT
