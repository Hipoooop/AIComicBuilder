import { db } from "@/lib/db";
import { shots, dialogues, characters, projects } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { EdgeTTSProvider, DEFAULT_VOICE } from "@/lib/ai/providers/tts-base";
import type { Task } from "@/lib/task-queue";

const ttsProvider = new EdgeTTSProvider();

export async function handleAudioGenerate(task: Task) {
  const payload = task.payload as { projectId: string; episodeId?: string };
  const projectId = payload.projectId;

  // Check if TTS is enabled
  const [project] = await db
    .select({ enableTts: projects.enableTts })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project?.enableTts) {
    console.log("[AudioGenerate] TTS not enabled, skipping");
    return { skipped: true };
  }

  // Load all characters for the project to build a voice map
  const projectCharacters = await db
    .select({ id: characters.id, name: characters.name, ttsVoice: characters.ttsVoice })
    .from(characters)
    .where(eq(characters.projectId, projectId));

  const voiceMap = new Map<string, string>();
  for (const char of projectCharacters) {
    voiceMap.set(char.id, char.ttsVoice || DEFAULT_VOICE);
  }

  // Load shots for this project (optionally filtered by episode)
  const shotConditions = [eq(shots.projectId, projectId)];
  if (payload.episodeId) {
    shotConditions.push(eq(shots.episodeId, payload.episodeId));
  }

  const projectShots = await db
    .select({ id: shots.id, sequence: shots.sequence, duration: shots.duration })
    .from(shots)
    .where(and(...shotConditions))
    .orderBy(asc(shots.sequence));

  let totalGenerated = 0;

  for (const shot of projectShots) {
    // Get dialogues for this shot
    const shotDialogues = await db
      .select({
        id: dialogues.id,
        text: dialogues.text,
        characterId: dialogues.characterId,
        sequence: dialogues.sequence,
      })
      .from(dialogues)
      .where(eq(dialogues.shotId, shot.id))
      .orderBy(asc(dialogues.sequence));

    if (shotDialogues.length === 0) continue;

    // Generate audio for each dialogue
    const dialogueCount = shotDialogues.length;
    const shotDuration = shot.duration || 10;
    const segmentDuration = shotDuration / dialogueCount;

    for (let i = 0; i < shotDialogues.length; i++) {
      const dialogue = shotDialogues[i];
      const voice = voiceMap.get(dialogue.characterId) || DEFAULT_VOICE;

      try {
        const result = await ttsProvider.synthesize(dialogue.text, { voice });

        // Calculate timing ratios based on actual audio duration vs allocated segment
        const startRatio = (i * segmentDuration) / shotDuration;
        const endRatio = Math.min(((i + 1) * segmentDuration) / shotDuration, 1.0);

        // Update dialogue with audio URL and timing
        await db
          .update(dialogues)
          .set({
            audioUrl: result.filePath,
            startRatio: String(startRatio),
            endRatio: String(endRatio),
          })
          .where(eq(dialogues.id, dialogue.id));

        totalGenerated++;
        console.log(`[AudioGenerate] Shot ${shot.sequence}, Dialogue ${i + 1}/${dialogueCount}: ${result.duration.toFixed(2)}s`);
      } catch (err) {
        console.error(`[AudioGenerate] Failed for dialogue ${dialogue.id}: ${err}`);
        // Continue with other dialogues — don't fail the whole task
      }
    }
  }

  console.log(`[AudioGenerate] Complete: ${totalGenerated} dialogues generated for project ${projectId}`);
  return { totalGenerated };
}
