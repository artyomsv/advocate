import type { LLMRouter } from '@mynah/engine';
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { z } from 'zod';
import { AgentStatsService } from '../../agents/agent-stats.service.js';
import { CampaignLead, CampaignLeadFormatError } from '../../agents/campaign-lead.js';
import { createContentWriter } from '../../agents/factory.js';
import { QualityGate, QualityGateFormatError } from '../../agents/quality-gate.js';
import { SafetyWorker } from '../../agents/safety-worker.js';
import { Strategist, StrategistFormatError } from '../../agents/strategist.js';
import { getDb } from '../../db/connection.js';

const draftRequestSchema = z.object({
  legendId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  communityId: z.string().uuid().optional(),
  task: z.object({
    type: z.string().min(1),
    promotionLevel: z.number().int().min(0).max(10),
    instructions: z.string().min(1),
  }),
  platform: z.object({ id: z.string(), name: z.string() }).optional(),
  community: z
    .object({
      id: z.string(),
      name: z.string(),
      platform: z.string(),
      rulesSummary: z.string().optional(),
      cultureSummary: z.string().optional(),
    })
    .optional(),
  thread: z.object({ url: z.string().optional(), summary: z.string() }).optional(),
  relevantMemories: z.array(z.string()).optional(),
  recentActivity: z.array(z.string()).optional(),
});

export interface AgentRoutesDeps {
  router: LLMRouter;
  logger: pino.Logger;
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  deps: AgentRoutesDeps,
): Promise<void> {
  const writer = createContentWriter({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });

  const stats = new AgentStatsService(getDb());

  const statsQuery = z.object({
    productId: z.string().uuid().optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
  });

  app.get('/agents/status', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = statsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    return stats.status(parsed.data.productId ?? null);
  });

  app.get('/agents/activity', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = statsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    return stats.activity(parsed.data.productId ?? null, parsed.data.limit);
  });

  app.post(
    '/agents/content-writer/draft',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = draftRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'ValidationError',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      try {
        const result = await writer.generateDraft(parsed.data);
        return result;
      } catch (err) {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return reply.code(404).send({ error: 'NotFound', message: err.message });
        }
        req.log.error({ err }, 'content writer draft failed');
        return reply.code(500).send({ error: 'InternalServerError' });
      }
    },
  );

  // Build instances once per server (router + db are stable)
  const qualityGate = new QualityGate({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });
  const safetyWorker = new SafetyWorker({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });
  const strategist = new Strategist({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });
  const campaignLead = new CampaignLead({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });

  const qualityReviewSchema = z.object({
    draftContent: z.string().min(1),
    personaSummary: z.string().min(1),
    communityRules: z.string(),
    promotionLevel: z.number().int().min(0).max(10),
  });

  app.post(
    '/agents/quality-gate/review',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = qualityReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'ValidationError',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      try {
        return await qualityGate.review(parsed.data);
      } catch (err) {
        if (err instanceof QualityGateFormatError) {
          return reply.code(502).send({
            error: 'BadGateway',
            message: 'LLM returned malformed scoring response',
            rawPreview: err.rawResponse.slice(0, 1500),
          });
        }
        req.log.error({ err }, 'quality gate failed');
        return reply.code(500).send({ error: 'InternalServerError' });
      }
    },
  );

  const safetyCheckSchema = z.object({
    legendAccountId: z.string().uuid(),
    promotionLevel: z.number().int().min(0).max(10),
  });

  app.post(
    '/agents/safety-worker/check',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = safetyCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'ValidationError',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      try {
        return await safetyWorker.check(parsed.data);
      } catch (err) {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return reply.code(404).send({ error: 'NotFound', message: err.message });
        }
        req.log.error({ err }, 'safety worker failed');
        return reply.code(500).send({ error: 'InternalServerError' });
      }
    },
  );

  const strategistSchema = z.object({
    productName: z.string().min(1),
    productOneLiner: z.string().min(1),
    campaignGoal: z.string().min(1),
    availableLegends: z
      .array(
        z.object({
          id: z.string().uuid(),
          summary: z.string().min(1),
          maturity: z.enum(['lurking', 'engaging', 'established', 'promoting']),
        }),
      )
      .min(1),
    availableCommunities: z
      .array(
        z.object({
          id: z.string().uuid(),
          platform: z.string().min(1),
          name: z.string().min(1),
          culture: z.string().optional(),
          rulesSummary: z.string().optional(),
        }),
      )
      .min(1),
    threadContext: z.string().optional(),
  });

  app.post('/agents/strategist/plan', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = strategistSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    try {
      return await strategist.planContent(parsed.data);
    } catch (err) {
      if (err instanceof StrategistFormatError) {
        return reply.code(502).send({
          error: 'BadGateway',
          message: 'Strategist LLM returned malformed output',
          rawPreview: err.rawResponse.slice(0, 1500),
        });
      }
      if (err instanceof Error && /not in the available set/i.test(err.message)) {
        return reply.code(502).send({
          error: 'BadGateway',
          message: err.message,
        });
      }
      req.log.error({ err }, 'strategist failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });

  const campaignLeadSchema = z.object({
    draftContent: z.string().min(1),
    personaSummary: z.string().min(1),
    qualityScore: z.object({
      authenticity: z.number().min(1).max(10),
      value: z.number().min(1).max(10),
      promotionalSmell: z.number().min(1).max(10),
      personaConsistency: z.number().min(1).max(10),
      communityFit: z.number().min(1).max(10),
      comments: z.string(),
    }),
    safetyResult: z.object({
      allowed: z.boolean(),
      reason: z.string().optional(),
    }),
    promotionLevel: z.number().int().min(0).max(10),
    campaignGoal: z.string().min(1),
  });

  app.post(
    '/agents/campaign-lead/decide',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = campaignLeadSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'ValidationError',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      try {
        const result = await campaignLead.decideOnContent(parsed.data);
        // Escalate maps to 202 Accepted (human action pending)
        if (result.decision.decision === 'escalate') {
          return reply.code(202).send(result);
        }
        return result;
      } catch (err) {
        if (err instanceof CampaignLeadFormatError) {
          return reply.code(502).send({
            error: 'BadGateway',
            message: 'Campaign Lead LLM returned malformed output',
            rawPreview: err.rawResponse.slice(0, 1500),
          });
        }
        req.log.error({ err }, 'campaign lead failed');
        return reply.code(500).send({ error: 'InternalServerError' });
      }
    },
  );
}
