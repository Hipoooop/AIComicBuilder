# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
pnpm install            # Install dependencies (better-sqlite3 is a native dep, requires build tools)
pnpm dev                # Start dev server on port 37000
pnpm build              # Production build (standalone output)
pnpm start              # Start production server
pnpm lint               # Run ESLint
pnpm drizzle-kit push   # Initialize/push database schema to SQLite
```

No test framework is configured.

## Architecture Overview

AIComicBuilder is an AI-powered comic/video generation pipeline built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, and SQLite (Drizzle ORM). It transforms scripts into animated videos through a multi-stage workflow:

```
Script → Script Parsing → Character Extraction → Character 4-View Images
                                                              ↓
                         Storyboard Generation → Frame Generation (First/Last)
                                                              ↓
                         Video Prompt Generation → Video Generation → Video Assembly + Subtitles
```

### Server Bootstrap Sequence

`src/instrumentation.ts` triggers `src/lib/bootstrap.ts` on server start, which runs in order:
1. Database migrations (`runMigrations`)
2. AI provider initialization (`initializeProviders`)
3. Pipeline handler registration (`registerPipelineHandlers`)
4. Task worker startup (`startWorker`)

This ensures the SQLite-backed task queue is ready before serving requests.

### Key Directories

- `src/lib/ai/` — Pluggable AI provider system with protocol-based routing
- `src/lib/pipeline/` — Generation pipeline handlers (each stage is a separate module)
- `src/lib/db/` — Drizzle ORM schema and database operations
- `src/lib/video/` — FFmpeg video processing utilities
- `src/lib/task-queue/` — SQLite-backed background task processing
- `src/stores/` — Zustand state management with localStorage persistence
- `src/lib/ai/prompts/` — Slot-based prompt template registry (13 templates)
- `messages/` — i18n translation files (zh, en, ja, ko)

### Generation Modes

Two frame generation modes affect the entire pipeline:
- **Keyframe** (`generationMode: "keyframe"`) — Generates distinct first/last frames, then interpolates video between them
- **Reference** (`generationMode: "reference"`) — Generates a single scene reference frame, then generates video from it with motion prompts

The mode is set per-project and per-episode (default: `keyframe`).

### AI Provider System

Protocol-based factory pattern. Each provider implements `AIProvider` (text/image) or `VideoProvider` interfaces defined in `src/lib/ai/types.ts`.

**Supported Protocols:**
| Protocol | Text | Image | Video | Notes |
|----------|------|-------|-------|-------|
| `openai` | GPT | DALL-E | — | Default text provider |
| `gemini` | Gemini | Imagen | Veo | Uses `@ai-sdk/google` for text |
| `kling` | — | Kling Image | Kling Video | Requires AK+SK; image prompt max 2500 chars |
| `seedance` | — | — | Seedance | ByteDance video model |
| `zhipu` | GLM (via OpenAI) | CogView | CogVideoX | Text API is OpenAI-compatible; image/video sizes must be multiples of 16 |

**Factory functions:** `createAIProvider()`, `createVideoProvider()`, `resolveAIProvider()`, `resolveImageProvider()`, `resolveVideoProvider()` — all in `src/lib/ai/provider-factory.ts`

**Adding a New Provider:**
1. Create provider class in `src/lib/ai/providers/` implementing `AIProvider` or `VideoProvider`
2. Register in `src/lib/ai/provider-factory.ts` (both `createAIProvider` and `createVideoProvider` switches)
3. If text provider: also add to `src/lib/ai/ai-sdk.ts`
4. Add protocol type to `src/stores/model-store.ts`
5. Add hardcoded models in `src/app/api/models/list/route.ts`
6. Add UI options in `src/components/settings/provider-form.tsx`

### Pipeline Architecture

Each pipeline stage is a self-contained module in `src/lib/pipeline/`. Stages use the SQLite-backed task queue for async processing and automatically enqueue subsequent stages.

**Pipeline Modules (registered in `src/lib/pipeline/index.ts`):**
| Module | Task Type | Description |
|--------|-----------|-------------|
| `script-parse.ts` | `script_parse` | Parse uploaded scripts |
| `character-extract.ts` | `character_extract` | Extract characters from script |
| `character-image.ts` | `character_image` | Generate character 4-view reference images |
| `shot-split.ts` | `shot_split` | Split script into shots |
| `frame-generate.ts` | `frame_generate` | Generate first/last frames per shot |
| `video-generate.ts` | `video_generate` | Generate video clips from frames |
| `video-assemble.ts` | `video_assemble` | Concatenate clips with subtitles |

### Prompt Template System

13 prompt definitions registered in `src/lib/ai/prompts/registry.ts`. Each prompt is decomposed into editable slots with a `buildFullPrompt()` function that reassembles them. Overrides are resolved in `src/lib/ai/prompts/resolver.ts` at multiple levels:

Code defaults (registry) → Global overrides (DB) → Project overrides (DB)

Key templates: `script_generate`, `script_parse`, `character_extract`, `shot_split`, `frame_generate_first`, `frame_generate_last`, `scene_frame_generate`, `video_generate`, `ref_video_prompt`.

### Database Schema

SQLite with Drizzle ORM. Schema in `src/lib/db/schema.ts`. Key hierarchy:

```
Project → Episodes → StoryboardVersions → Shots → Dialogues
       → Characters ←→ EpisodeCharacters (join table)
       → ImportLogs
       → Tasks (background job queue)
       → PromptTemplates → PromptVersions
                          PromptPresets
```

Notable fields:
- `projects.generationMode`: `"keyframe"` or `"reference"`
- `projects.useProjectPrompts`: Enable project-level prompt overrides
- `shots.status`: `"pending" | "generating" | "completed" | "failed"`
- `tasks.type`: One of the 7 pipeline task types; tasks auto-retry up to `maxRetries` (default 3)

### Build & Deployment

- `next.config.ts`: `output: "standalone"` for Docker; `serverExternalPackages: ["better-sqlite3"]` for native module
- Dockerfile: Multi-stage build on `node:20-alpine` with FFmpeg and CJK fonts
- Docker volumes: `./data` (SQLite) and `./uploads` (generated assets)
- CI: GitHub Actions builds and publishes Docker images on push to main and version tags

## Environment Variables

```bash
DATABASE_URL=file:./data/aicomic.db   # SQLite database path
UPLOAD_DIR=./uploads                   # File storage for uploads and generated assets
```

API keys are configured via the Settings UI and stored in localStorage (Zustand persist), not environment variables.

## i18n

Uses next-intl with locale-based routing. Supported locales: zh (default), en, ja, ko. Translation files in `messages/`. Locale routing configured in `src/i18n/request.ts`.
