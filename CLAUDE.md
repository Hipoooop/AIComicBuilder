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
2. AI provider initialization (`initializeProviders`) — reads `OPENAI_API_KEY`, `GEMINI_API_KEY`, `SEEDANCE_API_KEY` env vars for defaults
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
- `src/lib/ai/prompts/` — Slot-based prompt template registry
- `messages/` — i18n translation files (zh, en, ja, ko)

### Generation Modes

Two frame generation modes affect the entire pipeline:
- **Keyframe** (`generationMode: "keyframe"`) — Generates distinct first/last frames, then interpolates video between them
- **Reference** (`generationMode: "reference"`) — Generates a single scene reference frame, then generates video from it with motion prompts

The mode is set per-project and per-episode (default: `keyframe`).

### AI Provider System

Protocol-based factory pattern. Each provider implements `AIProvider` (text/image) or `VideoProvider` interfaces defined in `src/lib/ai/types.ts`. Default providers are singletons set at bootstrap; per-request overrides come from client-side model config (Zustand store) passed through API calls.

**Supported Protocols:**
| Protocol | Text | Image | Video | Notes |
|----------|------|-------|-------|-------|
| `openai` | GPT | DALL-E | — | Default text provider |
| `gemini` | Gemini | Imagen | Veo | Uses `@ai-sdk/google` for text |
| `kling` | — | Kling Image | Kling Video | Requires AK+SK; image prompt max 2500 chars |
| `seedance` | — | — | Seedance | ByteDance video model |
| `ucloud-seedance` | — | — | Seedance via UCloud | UCloud-hosted Seedance |
| `wan` | — | Wan Image | Wan Video | Alibaba Wan models |
| `zhipu` | GLM (via OpenAI) | CogView | CogVideoX | Text API is OpenAI-compatible; image/video sizes must be multiples of 16 |
| `vidu` | — | — | Vidu Video | Vidu video generation |

**Factory functions:** `createAIProvider()`, `createVideoProvider()`, `resolveAIProvider()`, `resolveImageProvider()`, `resolveVideoProvider()` — all in `src/lib/ai/provider-factory.ts`

**Adding a New Provider:**
1. Create provider class in `src/lib/ai/providers/` implementing `AIProvider` or `VideoProvider` (from `src/lib/ai/types.ts`)
2. Register in `src/lib/ai/provider-factory.ts` — add to `createAIProvider()` for image providers, `createVideoProvider()` for video providers
3. If text provider: also add to `src/lib/ai/ai-sdk.ts`
4. If default provider: add to `src/lib/ai/setup.ts`
5. Add protocol type to `src/stores/model-store.ts` protocol union type
6. Add hardcoded models in `src/app/api/models/list/route.ts`
7. Add UI options in `src/components/settings/provider-form.tsx`

### Pipeline Architecture

Each pipeline stage is a self-contained module in `src/lib/pipeline/`. Stages use the SQLite-backed task queue for async processing and automatically enqueue subsequent stages.

**Pipeline Modules (registered in `src/lib/pipeline/index.ts`):**
| Module | Task Type | Description |
|--------|-----------|-------------|
| `script-outline.ts` | `script_outline` | Generate script outline |
| `script-parse.ts` | `script_parse` | Parse uploaded scripts |
| `character-extract.ts` | `character_extract` | Extract characters from script |
| `character-image.ts` | `character_image` | Generate character 4-view reference images |
| `shot-split.ts` | `shot_split` | Split script into shots |
| `frame-generate.ts` | `frame_generate` | Generate first/last frames per shot |
| `video-generate.ts` | `video_generate` | Generate video clips from frames |
| `audio-generate.ts` | `audio_generate` | Generate TTS audio for dialogues |
| `video-assemble.ts` | `video_assemble` | Concatenate clips with subtitles |

Additional pipeline modules not registered in the main handler (used internally): `continuity-check.ts`, `video-quality-check.ts`.

### Prompt Template System

Slot-based prompt definitions registered in `src/lib/ai/prompts/registry.ts`. Each prompt is decomposed into editable slots with a `buildFullPrompt()` function that reassembles them. Overrides are resolved in `src/lib/ai/prompts/resolver.ts` at multiple levels:

Code defaults (registry) → Global overrides (DB) → Project overrides (DB)

Templates are grouped by category: `script`, `character`, `shot`, `frame`, `video`. Key templates include `script_generate`, `script_parse`, `character_extract`, `shot_split`, `frame_generate_first`, `frame_generate_last`, `scene_frame_generate`, `video_generate`, `ref_video_prompt`.

### Database Schema

SQLite with Drizzle ORM. Schema in `src/lib/db/schema.ts`. Key hierarchy:

```
Project → Episodes → Scenes → StoryboardVersions → Shots → Dialogues
                                                                → ShotActions
       → Characters ←→ EpisodeCharacters (join table)
                     → CharacterCostumes
                     → CharacterRelations
       → ImportLogs
       → Tasks (background job queue)
       → PromptTemplates → PromptVersions
                          PromptPresets
       → MoodBoardImages
       → PromptAbTests
```

**Shot Asset Versioning:** The `shotAssets` table is a unified per-shot asset table. Each row is one generated artifact (image or video) with a `type` discriminator (`first_frame`, `last_frame`, `reference`, `keyframe_video`, `reference_video`). Regenerating creates a new row with incremented `assetVersion` and sets `isActive=1`, while flipping the previous active row to `isActive=0`. Both keyframe and reference modes coexist on the same shot.

Notable fields:
- `projects.generationMode`: `"keyframe"` or `"reference"`
- `projects.useProjectPrompts`: Enable project-level prompt overrides
- `shots.status`: `"pending" | "generating" | "completed" | "failed"`
- `tasks.type`: One of the 9 pipeline task types; tasks auto-retry up to `maxRetries` (default 3)

### Storyboard Versioning

Episodes support multiple storyboard versions (`StoryboardVersion` table). Each version has its own set of shots, enabling A/B comparison and iteration. The `versionNum` and `label` fields identify versions; shots are scoped to a specific version via `versionId`. The UI allows switching between versions and creating new ones.

### Script Import Pipeline

Separate from the main generation pipeline, the import flow handles file uploads (TXT/DOCX/PDF) through multi-step processing:
1. File upload → `/api/uploads/` stores the file
2. Script parse → extracts text from uploaded file
3. Character extraction → identifies characters from parsed text (`import_character_extract` prompt)
4. Script splitting → divides long scripts into episodes (`script_split` prompt)
5. Auto-generate → creates episodes and assigns characters

Import state is tracked via the `ImportLogs` table.

### Client State Management

Zustand stores in `src/stores/`:
- `model-store.ts` — AI provider/model configuration (persisted to localStorage)
- `project-store.ts` — Current project state, episode/shot selection, storyboard version
- `prompt-template-store.ts` — Prompt template overrides and presets
- `episode-store.ts` — Episode list management

API calls from stores go through `src/lib/api-fetch.ts`, a thin wrapper around fetch with base URL handling.

### User Identity

No auth system — user identity is handled via a fingerprint cookie (`ai_comic_uid`). The middleware (`src/middleware.ts`) sets a random UUID cookie if missing, and the client-side `FingerprintProvider` may overwrite it with a browser fingerprint. Server components and API routes filter data by `userId`.

### Build & Deployment

- `next.config.ts`: `output: "standalone"` for Docker; `serverExternalPackages: ["better-sqlite3"]` for native module
- Dockerfile: Multi-stage build on `node:20-alpine` with FFmpeg and CJK fonts
- Docker volumes: `./data` (SQLite) and `./uploads` (generated assets)
- Dev server port: 37000 (not 3000)

## Environment Variables

```bash
DATABASE_URL=file:./data/aicomic.db   # SQLite database path
UPLOAD_DIR=./uploads                   # File storage for uploads and generated assets
OPENAI_API_KEY=...                     # Optional: default text/image provider
GEMINI_API_KEY=...                     # Optional: default text/image provider
SEEDANCE_API_KEY=...                   # Optional: default video provider
```

API keys can also be configured via the Settings UI and stored in localStorage (Zustand persist), which takes precedence over env vars at runtime.

## i18n

Uses next-intl with locale-based routing. Supported locales: zh (default), en, ja, ko. Translation files in `messages/`. Locale routing configured in `src/i18n/request.ts` and `src/i18n/routing.ts`.

## UI Components

Uses shadcn/ui (base-nova style) with Tailwind CSS 4. Component aliases: `@/components/ui` for shadcn primitives, `@/components/editor` for editor-specific components, `@/components/settings` for settings forms. Icon library: lucide-react.
