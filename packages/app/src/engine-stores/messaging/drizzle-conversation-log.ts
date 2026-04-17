import type {
  AgentId,
  AgentMessage,
  ConversationLog,
  IsoTimestamp,
  MessageId,
  MessageType,
  NewAgentMessage,
  TaskId,
} from '@mynah/engine';
import { asc, eq, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema.js';
import { agentMessages } from '../../db/schema.js';

function rowToMessage(r: typeof agentMessages.$inferSelect): AgentMessage {
  return {
    id: r.id as MessageId,
    fromAgent: r.fromAgent as AgentId,
    toAgent: r.toAgent as AgentId,
    type: r.type as MessageType,
    subject: r.subject,
    content: r.content,
    replyTo: (r.replyTo ?? undefined) as MessageId | undefined,
    taskId: (r.taskId ?? undefined) as TaskId | undefined,
    metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: r.createdAt.toISOString() as IsoTimestamp,
  };
}

export class DrizzleConversationLog implements ConversationLog {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async append(input: NewAgentMessage): Promise<AgentMessage> {
    const [row] = await this.db
      .insert(agentMessages)
      .values({
        fromAgent: input.fromAgent,
        toAgent: input.toAgent,
        type: input.type,
        subject: input.subject,
        content: input.content,
        replyTo: input.replyTo,
        taskId: input.taskId,
        metadata: input.metadata,
      })
      .returning();
    if (!row) throw new Error('message insert returned no row');
    return rowToMessage(row);
  }

  async get(id: MessageId): Promise<AgentMessage | undefined> {
    const [row] = await this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.id, id))
      .limit(1);
    return row ? rowToMessage(row) : undefined;
  }

  async listByAgent(agentId: AgentId): Promise<readonly AgentMessage[]> {
    const rows = await this.db
      .select()
      .from(agentMessages)
      .where(or(eq(agentMessages.fromAgent, agentId), eq(agentMessages.toAgent, agentId)))
      .orderBy(asc(agentMessages.createdAt));
    return rows.map(rowToMessage);
  }

  async listByTask(taskId: TaskId): Promise<readonly AgentMessage[]> {
    const rows = await this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.taskId, taskId))
      .orderBy(asc(agentMessages.createdAt));
    return rows.map(rowToMessage);
  }

  async getThread(rootId: MessageId): Promise<readonly AgentMessage[]> {
    // BFS over replyTo edges. Chat-like threads are 1-3 hops; one query per
    // level is fine at this volume. Deep threads could use a recursive CTE.
    const root = await this.get(rootId);
    if (!root) return [];
    const collected: AgentMessage[] = [root];
    const seen = new Set<string>([root.id]);
    let frontier: MessageId[] = [root.id];
    while (frontier.length > 0) {
      const children = await this.db
        .select()
        .from(agentMessages)
        .where(or(...frontier.map((id) => eq(agentMessages.replyTo, id))));
      frontier = [];
      for (const c of children) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        collected.push(rowToMessage(c));
        frontier.push(c.id as MessageId);
      }
    }
    return collected.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
