# Vibe-1

Personalized learning hub — RSS feeds, AI-curated content, notes & bookmarks. React + Vite + TypeScript, deployed on Netlify.

## Behavioral Rules

**Think before coding.** State assumptions. If ambiguous, ask — don't pick silently. If a simpler approach exists, say so.

**Simplicity first.** Minimum code that solves the problem. No speculative features, no abstractions for single-use code, no error handling for impossible cases. If 200 lines could be 50, rewrite it.

**Surgical changes.** Touch only what's asked. Don't refactor working code. Match existing style. Note dead code, don't delete it. Every changed line must trace to the request.

**Goal-driven execution.** Transform tasks into tests. "Fix the bug" → "write a failing test, then pass it." For multi-step work, state a plan with verification per step.

## Workflow

```bash
# Install
npm install

# Dev
npm run dev

# Typecheck
npx tsc --noEmit

# Test (single file)
npx vitest run src/path/to/file.test.ts

# Build
npm run build

# Deploy [VERIFY — confirm Netlify CLI vs git-based deploy]
netlify deploy --prod
```

## Structure

```
src/
  components/    # React components
  pages/         # Route-level views
  hooks/         # Custom React hooks
  services/      # API clients, RSS parsing, AI integration
  utils/         # Pure helper functions
  types/         # Shared TypeScript types
public/          # Static assets
```

## Conventions

- Functional components only. No class components.
- Named exports, no default exports (except route pages if required by router).
- Co-locate tests: `Component.test.tsx` next to `Component.tsx`.
- Environment variables prefixed with `VITE_` for client access.
- Netlify Functions in `netlify/functions/` for server-side logic (API keys, AI calls).

## Do NOT

- Commit `.env` files or embed API keys in client-side code.
- Add state management libraries without discussion — start with React context + hooks.
- Install CSS frameworks without discussion — decide styling approach first.
- Create `index.ts` barrel files that re-export everything from a directory.

## Current State

- Empty repository — CLAUDE.md is the first file.
- Stack chosen: React + Vite + TypeScript + Netlify.
- No scaffolding yet — `npm create vite@latest` is the next step.
- Features planned: RSS/article aggregation, AI-curated feeds, personal notes & bookmarks.
- No CI/CD configured yet — Netlify build settings TBD.

## Meta

Living document. After every correction, propose an update so the mistake doesn't repeat.
