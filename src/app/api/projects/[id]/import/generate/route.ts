import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, episodes, characters, episodeCharacters, characterRelations } from "@/lib/db/schema";
import { eq, and, max } from "drizzle-orm";
import { id as genId } from "@/lib/id";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { addImportLog } from "@/lib/import-utils";

export const maxDuration = 60;

interface EpisodeData {
  title: string;
  description: string;
  keywords: string;
  idea: string;
  characters?: string[];
}

interface CharacterData {
  name: string;
  scope: "main" | "guest";
  description: string;
  visualHint?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getUserIdFromRequest(request);

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    episodes: EpisodeData[];
    characters: CharacterData[];
    relationships?: Array<{
      characterA: string;
      characterB: string;
      relationType: string;
      description?: string;
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
  await addImportLog(
    projectId, 4, "running",
    `开始创建 ${body.episodes.length} 集和 ${body.characters.length} 个角色`
  );

  // 1. Create all characters (main + guest), build name→id map
  // Deduplicate: reuse existing characters with the same name
  const charIdByName = new Map<string, string>();
  for (const char of body.characters) {
    const key = char.name.toLowerCase().trim();
    // Skip if already mapped in this batch
    if (charIdByName.has(key)) continue;

    // Check if character already exists in DB
    const [existing] = await db.select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.projectId, projectId), eq(characters.name, char.name)));
    if (existing) {
      charIdByName.set(key, existing.id);
      continue;
    }

    const charId = genId();
    await db.insert(characters).values({
      id: charId,
      projectId,
      name: char.name,
      description: char.description,
      visualHint: char.visualHint ?? "",
      scope: char.scope,
      episodeId: null,
    });
    charIdByName.set(key, charId);
  }

  // 1b. Create character relationships
  if (body.relationships?.length) {
    for (const rel of body.relationships) {
      const aId = charIdByName.get(rel.characterA.toLowerCase().trim());
      const bId = charIdByName.get(rel.characterB.toLowerCase().trim());
      if (aId && bId && aId !== bId) {
        try {
          await db.insert(characterRelations).values({
            id: genId(),
            projectId,
            characterAId: aId,
            characterBId: bId,
            relationType: rel.relationType || "neutral",
            description: rel.description || "",
          });
        } catch {
          // skip duplicates
        }
      }
    }
  }

  await addImportLog(
    projectId, 4, "running",
    `已创建 ${charIdByName.size} 个角色${body.relationships?.length ? `和 ${body.relationships.length} 个关系` : ""}`
  );

  // 2. Create episodes
  const [seqResult] = await db
    .select({ maxSeq: max(episodes.sequence) })
    .from(episodes)
    .where(eq(episodes.projectId, projectId));

  let seq = (seqResult?.maxSeq ?? 0) + 1;

  const created = [];
  for (const ep of body.episodes) {
    const [row] = await db
      .insert(episodes)
      .values({
        id: genId(),
        projectId,
        title: ep.title,
        description: ep.description || "",
        keywords: ep.keywords || "",
        idea: ep.idea || "",
        script: ep.idea || "",
        sequence: seq++,
      })
      .returning();
    created.push(row);
  }

  // 3. Create episode_characters relations
  let relationCount = 0;
  for (let i = 0; i < body.episodes.length; i++) {
    const epData = body.episodes[i];
    const episodeId = created[i]?.id;
    if (!episodeId || !epData.characters) continue;

    for (const charName of epData.characters) {
      const charId = charIdByName.get(charName.toLowerCase().trim());
      if (!charId) continue;
      try {
        await db.insert(episodeCharacters).values({
          id: genId(),
          episodeId,
          characterId: charId,
        });
        relationCount++;
      } catch {
        // skip duplicate episode-character links
      }
    }
  }

  await addImportLog(
    projectId, 4, "done",
    `导入完成！创建了 ${charIdByName.size} 个角色和 ${created.length} 集（${relationCount} 个角色分配）`,
    { episodeCount: created.length, characterCount: charIdByName.size }
  );

  return NextResponse.json({
    episodes: created,
    characterCount: charIdByName.size,
  }, { status: 201 });

  } catch (err) {
    console.error("[import/generate] Error:", err);
    try {
      await addImportLog(projectId, 4, "error",
        `导入失败: ${err instanceof Error ? err.message : String(err)}`);
    } catch {}
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
