/** Runs forward jobs: copies videos from a source topic into another group. */
import { db, nowIso, rows } from "./db.js";
import { getClient, normalizeChatId } from "./telegram.js";

// Telegram rate limits forwards hard; this pause keeps a long job alive.
const PAUSE_BETWEEN_MESSAGES = 1500;
const running = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Forwards every pending item of a job. Re-entrant: already-running is a no-op. */
export async function runJob(jobId) {
  if (running.has(jobId)) return { success: true, status: "already running" };
  running.add(jobId);
  try {
    return await execute(jobId);
  } finally {
    running.delete(jobId);
  }
}

async function execute(jobId) {
  const jobs = rows(await db().from("forward_jobs").select("*").eq("id", jobId).limit(1));
  if (jobs.length === 0) throw new Error(`No forward job with id ${jobId}.`);
  const job = jobs[0];

  await db()
    .from("forward_jobs")
    .update({ status: "running", started_at: nowIso(), error: null })
    .eq("id", jobId);

  try {
    const client = await getClient();
    const target = await client.getEntity(normalizeChatId(job.target_chat_id));
    const targetTopic = job.target_topic_id ? Number(job.target_topic_id) : null;

    let sourceEntity = null;
    if (job.source_group_id) {
      const groups = rows(
        await db().from("groups").select("chat_id").eq("id", job.source_group_id).limit(1)
      );
      if (groups[0]) sourceEntity = await client.getEntity(normalizeChatId(groups[0].chat_id));
    }

    const items = await pendingItemsInOrder(jobId);
    let forwarded = job.forwarded_count ?? 0;
    let failed = job.failed_count ?? 0;

    for (const { item, episode } of items) {
      if (!episode?.message_id) {
        await mark(item.id, "skipped", null, "The episode is gone or has no message ID.");
        continue;
      }

      try {
        await forwardOne(client, sourceEntity, target, targetTopic, Number(episode.message_id), item.id);
        forwarded += 1;
      } catch (err) {
        // One bad message must not kill the job.
        failed += 1;
        await mark(item.id, "failed", null, String(err?.message ?? err).slice(0, 500));
      }

      await db()
        .from("forward_jobs")
        .update({ forwarded_count: forwarded, failed_count: failed })
        .eq("id", jobId);
      await sleep(PAUSE_BETWEEN_MESSAGES);
    }

    // An auto-following job stays queued so newly scanned videos get picked up.
    const finalStatus = job.auto_follow ? "queued" : failed === 0 ? "completed" : "failed";
    await db()
      .from("forward_jobs")
      .update({
        status: finalStatus,
        completed_at: job.auto_follow ? null : nowIso(),
        error: failed === 0 ? null : `${failed} video(s) could not be forwarded.`,
      })
      .eq("id", jobId);

    return { success: true, forwarded, failed, status: finalStatus };
  } catch (err) {
    await db()
      .from("forward_jobs")
      .update({
        status: "failed",
        error: String(err?.message ?? err).slice(0, 500),
        completed_at: nowIso(),
      })
      .eq("id", jobId);
    throw err;
  }
}

/** Forwards one message, falling back to a re-send when forwarding is blocked. */
async function forwardOne(client, sourceEntity, target, targetTopic, messageId, itemId) {
  let sent;

  if (targetTopic === null && sourceEntity) {
    sent = await client.forwardMessages(target, { messages: [messageId], fromPeer: sourceEntity });
  } else {
    // Forum topics (and forward-restricted chats) need a fresh send. The file
    // reference is reused, so nothing is downloaded or uploaded again.
    const message = await client.getMessages(sourceEntity, { ids: messageId });
    const found = Array.isArray(message) ? message[0] : message;
    if (!found?.media) throw new Error("The source message no longer has media.");
    sent = await client.sendFile(target, {
      file: found.media,
      caption: found.message || "",
      replyTo: targetTopic ?? undefined,
    });
  }

  const first = Array.isArray(sent) ? sent[0] : sent;
  await mark(itemId, "forwarded", first?.id ? String(first.id) : null);
}

/**
 * The job's pending items paired with their episodes, oldest first.
 *
 * Order matters: the destination group ends up in whatever order these are
 * sent, so a mirror of EP1-EP100 must not arrive shuffled. Episode number
 * leads (that is what a viewer scrolls by) and the Telegram message id breaks
 * ties, which is the original posting order. Episodes are fetched in one
 * query rather than one per item.
 */
async function pendingItemsInOrder(jobId) {
  const items = rows(
    await db().from("forward_job_items").select("*").eq("job_id", jobId).eq("status", "pending")
  );
  const episodeIds = items.map((i) => i.episode_id).filter(Boolean);
  if (episodeIds.length === 0) return items.map((item) => ({ item, episode: null }));

  const episodes = rows(await db().from("episodes").select("*").in("id", episodeIds));
  const byId = new Map(episodes.map((e) => [e.id, e]));

  return items
    .map((item) => ({ item, episode: byId.get(item.episode_id) ?? null }))
    .sort((a, b) => {
      // Episodes with no number sort after the numbered ones.
      const epA = a.episode?.ep_number ?? Number.MAX_SAFE_INTEGER;
      const epB = b.episode?.ep_number ?? Number.MAX_SAFE_INTEGER;
      if (epA !== epB) return epA - epB;
      return Number(a.episode?.message_id ?? 0) - Number(b.episode?.message_id ?? 0);
    });
}

async function mark(itemId, status, messageId = null, error = null) {
  await db()
    .from("forward_job_items")
    .update({
      status,
      forwarded_message_id: messageId,
      error,
      forwarded_at: status === "forwarded" ? nowIso() : null,
    })
    .eq("id", itemId);
}

/** Adds newly scanned videos to jobs that are set to keep forwarding. */
export async function syncAutoFollowJobs() {
  const jobs = rows(
    await db()
      .from("forward_jobs")
      .select("*")
      .eq("auto_follow", true)
      .in("status", ["queued", "completed"])
  );
  let addedTotal = 0;

  for (const job of jobs) {
    let query = db().from("episodes").select("id");
    if (job.source_topic_id) query = query.eq("topic_id", job.source_topic_id);
    else if (job.source_group_id) query = query.eq("group_id", job.source_group_id);
    else continue;

    const episodeIds = new Set(rows(await query).map((r) => r.id));
    const existing = rows(
      await db().from("forward_job_items").select("episode_id").eq("job_id", job.id)
    );
    const already = new Set(existing.map((r) => r.episode_id));

    const newIds = [...episodeIds].filter((id) => !already.has(id));
    if (newIds.length === 0) continue;

    await db()
      .from("forward_job_items")
      .insert(newIds.map((id) => ({ job_id: job.id, episode_id: id, status: "pending" })));
    await db()
      .from("forward_jobs")
      .update({ total_count: already.size + newIds.length, status: "queued" })
      .eq("id", job.id);
    addedTotal += newIds.length;
  }

  return addedTotal;
}
