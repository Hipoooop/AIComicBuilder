# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
pnpm dev              # Start dev server on port 37000
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm drizzle-kit push # Initialize/push database schema
```

## Architecture Overview

AIComicBuilder is an AI-powered comic/video generation pipeline that transforms scripts into animated videos through a multi-stage workflow:

```
Script → Script Parsing → Character Extraction → Character 4-View Images
                                                              ↓
                         Storyboard Generation → Frame Generation (First/Last)
                                                              ↓
                         Video Prompt Generation → Video Generation → Video Assembly + Subtitles
```

### Key Directories

- `src/lib/ai/` - Pluggable AI provider system with protocol-based routing
- `src/lib/pipeline/` - Generation pipeline handlers (each stage is a separate module)
- `src/lib/db/` - Drizzle ORM schema and database operations
- `src/lib/video/` - FFmpeg video processing utilities
- `src/lib/task-queue/` - SQLite-backed background task processing
- `src/stores/` - Zustand state management with persist middleware

### AI Provider System

The provider system uses a protocol-based factory pattern. Each provider implements `AIProvider` (text/image) or `VideoProvider` interfaces.

**Supported Protocols:**
- `openai` - OpenAI GPT/DALL-E
- `gemini` - Google Gemini/Imagen/Veo
- `kling` - Kling AI (image/video, requires AK+SK)
- `seedance` - ByteDance Seedance (video)
- `zhipu` - Zhipu CogVideoX (video)

**Adding a New Provider:**
1. Create provider class in `src/lib/ai/providers/` implementing `AIProvider` or `VideoProvider`
2. Register in `src/lib/ai/provider-factory.ts`
3. Add protocol type to `src/stores/model-store.ts`
4. Add UI options in `src/components/settings/provider-form.tsx`

### Pipeline Architecture

Each pipeline stage is a self-contained module in `src/lib/pipeline/`. Stages use the task queue for async processing and automatically enqueue subsequent stages.

**Pipeline Modules:**
- `script-parse.ts` - Parse uploaded scripts
- `character-extract.ts` - Extract characters from script
- `character-image.ts` - Generate character 4-view reference images
- `shot-split.ts` - Split script into shots
- `frame-generate.ts` - Generate first/last frames per shot
- `video-generate.ts` - Generate video clips from frames
- `video-assemble.ts` - Concatenate clips with subtitles

### Prompt Template System

Prompts are versioned and overrideable at multiple levels:
- Code defaults in `src/lib/ai/prompts/`
- Project-level overrides via database
- Slot-based decomposition for dynamic prompt building

### Database

SQLite with Drizzle ORM. Schema defined in `src/lib/db/schema.ts`. Key entities:
- Project → Episodes → Shots
- Characters (project-scoped or episode-scoped)
- Tasks (background job queue)

### Video Ratios

The pipeline respects aspect ratios throughout: 16:9, 9:16, 1:1, and custom. Frame generation and video synthesis use consistent ratios.

## Environment Variables

```bash
DATABASE_URL=file:./data/aicomic.db
UPLOAD_DIR=./uploads
```

API keys are configured via the Settings UI and stored in localStorage (Zustand persist), not environment variables.

## i18n

Uses next-intl with locale-based routing. Supported locales: zh (default), en, ja, ko. Translations in `messages/` directory.
