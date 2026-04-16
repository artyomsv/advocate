# Advocate — Consolidated Architecture

All architectural decisions finalized as of 2026-04-16. This document is the single source of truth for implementation.

---

## 1. Project Overview

**Advocate** is an agentic AI service that builds authentic community presence across social platforms to organically promote products. It operates AI personas (called **Legends**) — each with consistent identity, expertise, and posting history — that genuinely contribute to communities while strategically creating awareness.

Core philosophy: **90% genuine value, 10% strategic awareness.**

### Two Packages

The project is a monorepo with two packages:

| Package | Purpose | Reusable? |
|---|---|---|
| `@advocate/engine` | Generic multi-agent orchestration engine | Yes — extract to any project |
| `@advocate/app` | Social promotion application built on the engine | No — domain-specific |

The engine knows nothing about social media, marketing, or promotion. It only knows about agents, tasks, memory, communication, and hierarchy.

### First Product to Promote

**Fairy Book Store** (fairybookstore.com) — personalized children's book e-commerce platform. Product details to be configured after system is running. Original Crawlex/Foreman campaign examples are in `docs/reference/` as reference material only.

---

## 2. Monorepo Structure

```
advocate/
├── packages/
│   ├── engine/                    # @advocate/engine — THE REUSABLE CORE
│   │   ├── src/
│   │   │   ├── core/              # Agent definitions, roles, lifecycle
│   │   │   │   ├── agent.ts       # AgentDefinition, AgentStatus
│   │   │   │   ├── role.ts        # Role interfaces (Leader, Creator, Reviewer, etc.)
│   │   │   │   └── runtime.ts     # AgentRuntime — start, stop, wake, sleep
│   │   │   ├── hierarchy/         # Agent hierarchy and decision authority
│   │   │   │   ├── hierarchy.ts   # HierarchyManager — parent/child relationships
│   │   │   │   └── escalation.ts  # Escalation rules and routing
│   │   │   ├── memory/            # Episodic + relational memory
│   │   │   │   ├── episodic.ts    # EpisodicMemoryStore — what happened
│   │   │   │   ├── relational.ts  # RelationalMemoryStore — who they know
│   │   │   │   ├── consolidator.ts # MemoryConsolidator — compress old memories
│   │   │   │   └── types.ts       # Memory types and interfaces
│   │   │   ├── tasks/             # Kanban task system
│   │   │   │   ├── task.ts        # Task schema, lifecycle
│   │   │   │   ├── board.ts       # KanbanBoard — task management
│   │   │   │   └── types.ts       # Task types
│   │   │   ├── messaging/         # Inter-agent communication
│   │   │   │   ├── bus.ts         # MessageBus — agent-to-agent messaging
│   │   │   │   ├── log.ts         # ConversationLog — audit trail
│   │   │   │   └── types.ts       # Message types
│   │   │   ├── heartbeat/         # Cron + event-driven scheduling
│   │   │   │   ├── scheduler.ts   # HeartbeatScheduler — cron registration
│   │   │   │   ├── events.ts      # EventEmitter — event-driven triggers
│   │   │   │   └── types.ts       # Trigger types
│   │   │   ├── llm/               # LLM provider abstraction
│   │   │   │   ├── provider.ts    # LLMProvider interface
│   │   │   │   ├── router.ts      # LLMRouter — task-based model selection
│   │   │   │   └── types.ts       # LLM types (GenerateParams, etc.)
│   │   │   ├── notifications/     # Human-in-the-loop abstraction
│   │   │   │   ├── provider.ts    # NotificationProvider interface
│   │   │   │   └── types.ts       # Notification types (approval, alert, etc.)
│   │   │   ├── storage/           # Database abstraction
│   │   │   │   ├── provider.ts    # StorageProvider interface
│   │   │   │   └── types.ts       # Storage types
│   │   │   ├── credentials/       # Credential encryption
│   │   │   │   ├── store.ts       # CredentialStore — encrypt/decrypt
│   │   │   │   └── types.ts       # Credential types
│   │   │   └── index.ts           # Public API barrel export
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── biome.json
│   │
│   └── app/                       # @advocate/app — THIS APPLICATION
│       ├── src/
│       │   ├── server/            # Fastify API server
│       │   │   ├── app.ts         # Fastify instance + plugin registration
│       │   │   ├── routes/        # API route modules
│       │   │   │   ├── products.ts
│       │   │   │   ├── legends.ts
│       │   │   │   ├── campaigns.ts
│       │   │   │   ├── content.ts
│       │   │   │   ├── tasks.ts
│       │   │   │   ├── analytics.ts
│       │   │   │   ├── conversations.ts
│       │   │   │   ├── llm.ts     # LLM cost center endpoints
│       │   │   │   └── health.ts
│       │   │   ├── plugins/       # Fastify plugins
│       │   │   │   ├── auth.ts    # Keycloak JWT validation
│       │   │   │   ├── websocket.ts
│       │   │   │   └── error-handler.ts
│       │   │   └── server.ts      # Server entry point
│       │   ├── worker/            # BullMQ worker processes
│       │   │   ├── workers/
│       │   │   │   ├── scout.ts
│       │   │   │   ├── content.ts
│       │   │   │   ├── quality-gate.ts
│       │   │   │   ├── engagement.ts
│       │   │   │   ├── analytics.ts
│       │   │   │   ├── safety.ts
│       │   │   │   └── memory-consolidator.ts
│       │   │   ├── queues.ts      # Queue definitions
│       │   │   └── worker.ts      # Worker entry point
│       │   ├── agents/            # Agent definitions for this application
│       │   │   ├── campaign-lead.ts
│       │   │   ├── strategist.ts
│       │   │   ├── scout.ts
│       │   │   ├── content-writer.ts
│       │   │   ├── quality-gate.ts
│       │   │   ├── analytics-analyst.ts
│       │   │   └── safety-worker.ts
│       │   ├── legends/           # Actor identity system
│       │   │   ├── legend.ts      # Legend schema + types
│       │   │   ├── accounts.ts    # Platform account management
│       │   │   ├── soul.ts        # Soul prompt builder (three-layer)
│       │   │   └── types.ts
│       │   ├── products/          # Product knowledge management
│       │   │   ├── product.ts     # Product schema
│       │   │   ├── knowledge-card.ts # Structured talking points
│       │   │   └── types.ts
│       │   ├── platforms/         # Platform adapters
│       │   │   ├── adapter.ts     # PlatformAdapter interface
│       │   │   ├── reddit.ts      # Reddit adapter (snoowrap)
│       │   │   ├── twitter.ts     # Twitter/X adapter (stub Phase 1)
│       │   │   ├── facebook.ts    # Facebook adapter (stub Phase 1)
│       │   │   ├── hackernews.ts  # HN adapter (stub Phase 1)
│       │   │   ├── devto.ts       # Dev.to adapter (stub Phase 1)
│       │   │   └── manual.ts      # Manual posting adapter (Phase 1)
│       │   ├── campaigns/         # Campaign management
│       │   │   ├── campaign.ts
│       │   │   ├── playbook.ts
│       │   │   └── types.ts
│       │   ├── safety/            # Safety & compliance
│       │   │   ├── rate-limiter.ts
│       │   │   ├── quality-gate.ts
│       │   │   ├── rules.ts       # Platform rules engine
│       │   │   └── types.ts
│       │   ├── analytics/         # Engagement tracking
│       │   │   ├── collector.ts
│       │   │   ├── reporter.ts
│       │   │   └── types.ts
│       │   ├── llm/               # LLM provider implementations
│       │   │   ├── anthropic.ts
│       │   │   ├── google.ts
│       │   │   ├── openai.ts
│       │   │   ├── deepseek.ts    # Stub — provider added later
│       │   │   └── qwen.ts        # Stub — provider added later
│       │   ├── notifications/     # Notification implementations
│       │   │   └── telegram.ts
│       │   ├── db/                # Database layer
│       │   │   ├── schema.ts      # Drizzle schema definitions
│       │   │   ├── migrate.ts     # Migration runner
│       │   │   ├── seed.ts        # Initial seed data (config only, no synthetic data)
│       │   │   └── connection.ts  # Database connection
│       │   └── config/            # Application configuration
│       │       ├── env.ts         # Environment variable validation (Zod)
│       │       ├── models.ts      # Model routing config
│       │       └── constants.ts
│       ├── dashboard/             # React frontend
│       │   ├── src/
│       │   │   ├── main.tsx
│       │   │   ├── App.tsx
│       │   │   ├── pages/
│       │   │   │   ├── Dashboard.tsx          # Overview
│       │   │   │   ├── Campaigns.tsx          # Campaign management
│       │   │   │   ├── ContentQueue.tsx       # Content approval queue
│       │   │   │   ├── Kanban.tsx             # Agent task board
│       │   │   │   ├── Legends.tsx            # Actor registry
│       │   │   │   ├── Analytics.tsx          # Engagement analytics
│       │   │   │   ├── Conversations.tsx      # Agent conversation log
│       │   │   │   ├── LLMCostCenter.tsx      # LLM usage + costs
│       │   │   │   └── Settings.tsx           # System settings
│       │   │   ├── components/
│       │   │   │   ├── ui/                    # shadcn/ui components
│       │   │   │   ├── layout/                # Shell, sidebar, header
│       │   │   │   ├── campaigns/             # Campaign-specific components
│       │   │   │   ├── content/               # Content queue components
│       │   │   │   ├── kanban/                # Kanban board components
│       │   │   │   ├── legends/               # Legend management components
│       │   │   │   └── analytics/             # Charts, metrics
│       │   │   ├── hooks/                     # React hooks
│       │   │   ├── lib/                       # Utilities, API client
│       │   │   │   ├── api.ts                 # API client (fetch wrapper)
│       │   │   │   └── auth.ts                # Keycloak integration
│       │   │   └── stores/                    # Zustand stores
│       │   ├── index.html
│       │   ├── vite.config.ts
│       │   ├── tailwind.config.ts
│       │   └── package.json
│       ├── drizzle/               # Database migrations
│       │   └── migrations/
│       ├── package.json
│       ├── tsconfig.json
│       ├── biome.json
│       └── Dockerfile
│
├── docker-compose.yml             # Development environment
├── .env.example                   # Environment template
├── package.json                   # Monorepo root
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json                     # Root Biome config
├── tsconfig.base.json             # Shared TypeScript config
└── .dockerignore
```

---

## 3. Agent Engine — Core Abstractions

### 3.1 Agent Definition

```typescript
// engine/src/core/agent.ts

interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  soul: string;                      // system prompt — the agent's identity
  modelConfig: ModelConfig;
  memoryConfig: MemoryConfig;
  permissions: AgentPermission[];
  parentId?: string;                 // hierarchy — who this agent reports to
  metadata?: Record<string, unknown>; // application-specific data
}

interface ModelConfig {
  taskType: string;                  // maps to LLM router task type
  temperatureOverride?: number;
  maxTokensOverride?: number;
}

interface MemoryConfig {
  episodicEnabled: boolean;
  relationalEnabled: boolean;
  consolidationIntervalHours: number; // how often to compress old memories
  maxRecentEpisodes: number;          // how many raw episodes to keep
}

type AgentPermission =
  | 'create_task'
  | 'assign_task'
  | 'approve_content'
  | 'escalate_to_human'
  | 'modify_strategy'
  | 'post_content'
  | 'access_credentials';

interface AgentStatus {
  agentId: string;
  state: 'idle' | 'working' | 'waiting_approval' | 'sleeping' | 'stopped';
  currentTaskId?: string;
  lastActiveAt: Date;
  metrics: {
    tasksCompleted: number;
    tasksInProgress: number;
    messagesExchanged: number;
  };
}
```

### 3.2 Role Interfaces

```typescript
// engine/src/core/role.ts

// Roles are contracts. Any agent assigned a role must fulfill it.

interface LeaderRole {
  makeDecision(context: DecisionContext): Promise<Decision>;
  delegateTask(task: TaskDefinition, toAgentId: string): Promise<string>;
  escalateToHuman(request: EscalationRequest): Promise<HumanResponse>;
  reviewWork(taskId: string): Promise<ReviewResult>;
}

interface ContentCreatorRole {
  generateDraft(brief: ContentBrief): Promise<ContentDraft>;
  reviseDraft(draft: ContentDraft, feedback: string): Promise<ContentDraft>;
}

interface ReviewerRole {
  review(content: ContentDraft): Promise<ReviewResult>;
}

interface ScoutRole {
  discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]>;
  monitor(targets: MonitorTarget[]): Promise<MonitorEvent[]>;
}

interface AnalystRole {
  analyze(data: AnalysisInput): Promise<AnalysisReport>;
  recommend(report: AnalysisReport): Promise<Recommendation[]>;
}
```

### 3.3 Agent Runtime

```typescript
// engine/src/core/runtime.ts

interface AgentRuntime {
  // Lifecycle
  register(definition: AgentDefinition): Promise<void>;
  start(agentId: string): Promise<void>;
  stop(agentId: string): Promise<void>;
  wake(agentId: string, trigger: Trigger): Promise<void>;

  // Status
  getStatus(agentId: string): Promise<AgentStatus>;
  listAgents(): Promise<AgentStatus[]>;

  // Execution
  execute(agentId: string, task: AgentTask): Promise<TaskResult>;
}
```

---

## 4. Agent Hierarchy

```
You (Human Owner)
  │
  │ Telegram (approve/reject/answer)
  │ Dashboard (deep management)
  ▼
Campaign Lead (one per product)
  │
  ├── Strategist
  │     └── Content Writer
  │           └── Quality Gate
  │
  ├── Scout
  │
  ├── Analytics Analyst
  │
  └── Safety Worker
```

### Decision Authority

| Decision | Decider | Escalates To |
|---|---|---|
| Which thread to engage | Strategist | Campaign Lead (high-risk community) |
| Content draft creation | Content Writer | Quality Gate → Campaign Lead |
| Promotion level 0-3 | Quality Gate auto-approves | — |
| Promotion level 4-6 | Campaign Lead | Human (via Telegram) |
| Promotion level 7+ | Human approval required | — |
| New community to enter | Scout recommends | Campaign Lead approves |
| Strategy pivot | Analytics Analyst recommends | Campaign Lead decides |
| Account warned/flagged | Safety Worker halts everything | Campaign Lead + Human |

### Model Assignment Per Agent

```yaml
campaign_lead:
  taskType: "strategy"
  # Routes to: claude-sonnet-4-6 (primary), gemini-2.5-pro (fallback), deepseek-r1 (budget)

strategist:
  taskType: "strategy"
  # Same routing as campaign_lead

scout:
  taskType: "classification"
  # Routes to: gemini-2.5-flash (primary), gpt-4.1-mini (fallback), qwen-3-32b (budget)

content_writer:
  taskType: "content_writing"
  temperatureOverride: 0.8
  # Routes to: claude-sonnet-4-6 (primary), gpt-4.1 (fallback), deepseek-v3 (budget)

quality_gate:
  taskType: "classification"
  temperatureOverride: 0.2
  # Routes to: gemini-2.5-flash (primary), gpt-4.1-mini (fallback), qwen-3-32b (budget)

analytics_analyst:
  taskType: "bulk"
  # Routes to: gemini-2.5-flash (primary), gpt-4.1-nano (fallback), qwen-3-32b (budget)

memory_consolidator:
  taskType: "bulk"
  # Routes to: gemini-2.5-flash (primary), gpt-4.1-nano (fallback), qwen-3-32b (budget)
```

---

## 5. Memory System

### 5.1 Episodic Memory

What happened to an agent. Conversations, reactions, lessons learned.

```typescript
// engine/src/memory/types.ts

interface Episode {
  id: string;
  agentId: string;
  timestamp: Date;
  context: {
    platform?: string;
    community?: string;
    threadId?: string;
    threadTitle?: string;
  };
  action: string;                // what the agent did
  outcome: string;               // what happened (upvotes, replies, removal)
  lesson?: string;               // AI-extracted learning
  sentiment: 'positive' | 'neutral' | 'negative';
  metadata?: Record<string, unknown>;
}

interface ConsolidatedMemory {
  id: string;
  agentId: string;
  consolidatedAt: Date;
  sourceEpisodeIds: string[];    // which episodes were compressed
  summary: string;               // AI-generated summary
  lessons: string[];             // extracted patterns
  period: { from: Date; to: Date };
}
```

### 5.2 Relational Memory

Who an agent has interacted with.

```typescript
interface Relationship {
  id: string;
  agentId: string;
  externalUsername: string;
  platform: string;
  context: string;               // how they met
  sentiment: 'positive' | 'neutral' | 'negative';
  interactionCount: number;
  lastInteractionAt: Date;
  notes: string;                 // AI-generated relationship summary
  tags: string[];                // "moderator", "friendly", "expert", etc.
}
```

### 5.3 Memory Consolidation

Daily job that compresses old episodes into summaries. Recent episodes (last 7 days) stay raw. Older ones get consolidated into lesson summaries.

Uses the `bulk` task type (cheapest LLM — Gemini Flash or equivalent).

Memory is injected into agent prompts as a compressed summary, not raw events:
```
YOUR MEMORY (relevant to this interaction):
- r/Plumbing responds well to specific dollar amounts in advice
- r/smallbusiness flagged you once — more value-only posts needed
- User copper_joe_philly is a friendly contact in r/Plumbing
```

---

## 6. Task / Kanban System

### 6.1 Task Schema

```typescript
// engine/src/tasks/types.ts

interface AgentTask {
  id: string;
  projectId: string;             // which product/campaign this belongs to

  // Task details
  title: string;
  description: string;
  type: string;                  // application-defined (content, research, etc.)
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'backlog' | 'in_progress' | 'in_review' | 'approved' | 'done' | 'blocked';

  // Assignment
  assignedTo: string;            // agent ID
  createdBy: string;             // agent ID (usually Campaign Lead)

  // Collaboration
  comments: TaskComment[];

  // Tracking
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Output
  artifacts: TaskArtifact[];     // content drafts, reports, etc.

  // Dependencies
  dependsOn?: string[];          // task IDs that must complete first
}

interface TaskComment {
  id: string;
  agentId: string;
  agentRole: string;
  content: string;
  timestamp: Date;
}

interface TaskArtifact {
  id: string;
  type: string;                  // 'content_draft', 'analysis_report', etc.
  content: string;
  createdAt: Date;
  createdBy: string;
}
```

### 6.2 Kanban Board

The KanbanBoard interface manages task lifecycle. The Campaign Lead creates tasks, assigns them, and agents move them through statuses. The dashboard renders this as a visual board.

---

## 7. Inter-Agent Communication

### 7.1 Message Types

```typescript
// engine/src/messaging/types.ts

interface AgentMessage {
  id: string;
  from: string;                  // agent ID
  to: string;                    // agent ID
  type: 'request' | 'response' | 'notification' | 'escalation';
  subject: string;
  content: string;
  replyTo?: string;              // message ID being replied to
  taskId?: string;               // associated task
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

### 7.2 Conversation Log

All inter-agent messages are stored in a conversation log, queryable by:
- Product / campaign
- Agent pair
- Time range
- Task ID
- Message type

The dashboard's "Conversations" page renders these as threaded discussions.

---

## 8. Heartbeat System

### 8.1 Cron Heartbeats (periodic)

| Interval | Agent | Action |
|---|---|---|
| Every 15 min | Scout | Check for new relevant threads |
| Every 30 min | Strategist | Review opportunity queue |
| Every 1 hour | Campaign Lead | Review pending items |
| Every 4 hours | Analytics Analyst | Collect post metrics |
| Every 24 hours | Memory Consolidator | Compress old episodes |
| Every 24 hours | Campaign Lead | Review daily plan |
| Every 7 days | Scout | Discover new communities |
| Every 7 days | Analytics Analyst | Generate weekly report |

### 8.2 Event-Driven Triggers (immediate)

| Event | Triggers |
|---|---|
| High-relevance thread found | Scout → Strategist |
| Content draft ready | Content Writer → Quality Gate |
| Quality Gate passed | Quality Gate → Campaign Lead |
| Post published | Engagement Worker → schedule metric collection |
| Post removed/warned | Safety Worker → halt + alert |
| Human approval received | Campaign Lead → Engagement Worker |

Both types flow through BullMQ queues with cron scheduling (using `upsertJobScheduler`) for periodic and `queue.add()` for event-driven.

---

## 9. LLM Routing

### 9.1 Provider Interface

```typescript
// engine/src/llm/provider.ts

interface LLMProvider {
  readonly providerId: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
  estimateCost(params: GenerateParams): CostEstimate;
}

interface GenerateParams {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

interface GenerateResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
  };
  costCents: number;             // cost in cents
  model: string;
  latencyMs: number;
}
```

### 9.2 Router

The LLM Router selects models based on task type and operating mode.

```typescript
// engine/src/llm/router.ts

interface LLMRouter {
  route(taskType: string, sensitive: boolean): Promise<LLMProvider>;
  setMode(mode: 'primary' | 'balanced' | 'budget'): void;
  getMode(): string;
  getStats(): ModelStats;
  getBudgetStatus(): BudgetStatus;
}

interface ModelRoute {
  primary: string;               // provider:model (e.g., "anthropic:claude-sonnet-4-6")
  fallback: string;
  budget: string;
}

interface BudgetStatus {
  monthlyCapCents: number;
  spentCents: number;
  remainingCents: number;
  projectedMonthEndCents: number;
  autoSwitchToBudget: boolean;   // auto-switch when budget exceeded
}
```

### 9.3 Task Type Routes

| Task Type | Primary | Fallback | Budget |
|---|---|---|---|
| `content_writing` | claude-sonnet-4-6 | gpt-4.1 | deepseek-v3 |
| `strategy` | claude-sonnet-4-6 | gemini-2.5-pro | deepseek-r1 |
| `classification` | gemini-2.5-flash | gpt-4.1-mini | qwen-3-32b |
| `bulk` | gemini-2.5-flash | gpt-4.1-nano | qwen-3-32b |

### 9.4 Quality-Based Auto-Escalation

If a cheap model produces content that scores below the quality threshold, the router automatically retries with the next-tier model. Tracked in analytics.

### 9.5 Sensitive Data Routing

Tasks involving credentials, strategy docs, or internal discussions are **never routed to budget-tier models** (Chinese providers). Enforced at the router level via a `sensitive: boolean` parameter.

### 9.6 Prompt Caching

Soul prompts are static and should use Anthropic's prompt caching. The engine marks the soul portion with cache breakpoints to avoid re-processing the ~2K token identity on every call.

### 9.7 Budget Cap

Configurable monthly ceiling in cents. Default: 2000 ($20). When exceeded:
- If `autoSwitchToBudget` is enabled: automatically switch to budget mode
- Always: send Telegram alert to owner
- Never: silently stop working (alert + degrade, don't halt)

### 9.8 Available Providers (Phase 1)

| Provider | SDK | Status |
|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | Ready (user has key) |
| Google | `@google/generative-ai` | Ready (user has key) |
| OpenAI | `openai` | Ready (user has key) |
| DeepSeek | `openai` (compatible API) | Placeholder — key not yet available |
| Qwen | `openai` (compatible API via DashScope) | Placeholder — key not yet available |

---

## 10. Legend System (Actor Identity)

### 10.1 Legend Schema

```typescript
// app/src/legends/types.ts

interface Legend {
  id: string;
  productId: string;

  // Core identity
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'non-binary';
  age: number;
  location: {
    city: string;
    state: string;
    country: string;
    timezone: string;
  };

  // Life details
  maritalStatus: 'single' | 'married' | 'divorced' | 'partner';
  partnerName?: string;
  children?: number;
  pets?: { type: string; name: string }[];

  // Professional
  occupation: string;
  company: string;                     // fictional but realistic
  industry: string;
  yearsExperience: number;
  education: string;

  // Personality (Big Five, 1-10 scale)
  personality: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };

  // Online behavior
  techSavviness: number;               // 1-10
  typingStyle: {
    capitalization: 'proper' | 'lowercase' | 'mixed';
    punctuation: 'correct' | 'minimal' | 'excessive';
    commonTypos: string[];
    commonPhrases: string[];
    avoidedPhrases: string[];
    paragraphStyle: 'short' | 'walls_of_text' | 'varied';
    listStyle: 'never' | 'sometimes' | 'frequently';
    usesEmojis: boolean;
    formality: number;                 // 1-10
  };
  activeHours: { start: number; end: number }; // 0-23 in legend's timezone
  activeDays: number[];                // 0=Sun through 6=Sat
  averagePostLength: 'short' | 'medium' | 'long';

  // Interests (for non-product engagement — 90% of activity)
  hobbies: string[];
  sportsTeam?: string;
  otherSubreddits: string[];

  // Knowledge areas
  expertiseAreas: string[];
  knowledgeGaps: string[];

  // Product relationship
  productRelationship: {
    discoveryStory: string;
    usageDuration: string;
    satisfactionLevel: number;         // 7-8 range, NEVER 10
    complaints: string[];              // real drawbacks
    useCase: string;
    alternativesConsidered: string[];
  };

  // Opinions (consistent across all posts)
  opinions: Record<string, string>;    // topic → stance

  // What this legend NEVER does
  neverDo: string[];

  createdAt: Date;
  updatedAt: Date;
}
```

### 10.2 Account Management

```typescript
interface LegendAccounts {
  legendId: string;

  email: {
    provider: 'gmail' | 'outlook' | 'protonmail';
    address: string;
    passwordCredentialId: string;       // reference to encrypted credential
    recoveryPhone?: string;
    recoveryEmail?: string;
    createdAt: Date;
    status: 'active' | 'locked' | 'suspended';
  };

  platforms: PlatformRegistration[];
}

interface PlatformRegistration {
  platform: string;
  username: string;
  email: string;
  registeredAt: Date;
  status: 'active' | 'warming_up' | 'warned' | 'suspended' | 'banned';

  // Metrics
  karma?: number;
  followers?: number;
  postsCount?: number;

  // Warming
  warmUpPhase: 'lurking' | 'engaging' | 'established' | 'promoting';
  warmUpStartedAt: Date;
  warmUpCompletedAt?: Date;

  // Rate tracking
  postsToday: number;
  postsThisWeek: number;
  lastPostAt?: Date;
  lastProductMentionAt?: Date;

  // API credentials (encrypted)
  apiCredentialId?: string;            // reference to encrypted credential

  notes: string;
}
```

### 10.3 Legend Creation

Legends are **manually orchestrated by the system owner**, not auto-generated. The dashboard provides a form-based legend editor where the owner fills in all fields. The system does NOT generate legends autonomously.

### 10.4 Account Creation

Email and platform accounts are **created manually** by the owner. The system tracks them but does not create them. Future phases may add automated account creation for Proton/Outlook (space reserved in architecture, not implemented in Phase 1).

---

## 11. Three-Layer Prompt Architecture

Each persona agent's prompt is composed from three layers at runtime:

### Layer 1: Soul (static)

The agent's complete identity. Built from the Legend schema. This is the `soul` field in `AgentDefinition`. Example structure:

```
You are {name}, {age}, {occupation} in {city}, {state}.
{background paragraph from legend fields}

PERSONALITY: {derived from Big Five scores}
WRITING STYLE: {from typingStyle fields}
KNOWLEDGE: {from expertiseAreas + knowledgeGaps}
OPINIONS: {from opinions map}
PERSONAL DETAILS: {from life details}
WHAT YOU NEVER DO: {from neverDo list}
```

### Layer 2: Product Knowledge (semi-static)

Filtered through the legend's understanding level. Different legends know the product differently based on their `techSavviness`, `expertiseAreas`, and `productRelationship`.

### Layer 3: Context (dynamic, per interaction)

Injected per interaction:
- Platform and community info
- Thread context (if replying)
- Content type and promotion level
- Community rules summary
- Relevant memories from episodic/relational stores
- Recent persona activity (avoid repetition)

---

## 12. Platform Adapters

### Common Interface

```typescript
// app/src/platforms/adapter.ts

interface PlatformAdapter {
  readonly platform: string;

  // Community operations
  searchCommunities(keywords: string[]): Promise<CommunityResult[]>;
  getCommunityInfo(identifier: string): Promise<CommunityProfile>;
  getRecentPosts(communityId: string, limit: number): Promise<PlatformPost[]>;

  // Content operations
  createPost(params: CreatePostParams): Promise<PlatformPostResult>;
  createComment(params: CreateCommentParams): Promise<PlatformPostResult>;

  // Engagement metrics
  getPostMetrics(postId: string): Promise<PostMetrics>;
  getReplies(postId: string): Promise<PlatformPost[]>;

  // Account
  getAccountInfo(): Promise<AccountInfo>;
}
```

### Phase 1 Adapters

| Adapter | Status | Notes |
|---|---|---|
| **ManualAdapter** | Full implementation | Generates content, presents to human for manual posting. Records platform URL after posting. |
| **RedditAdapter** | Full implementation | Uses snoowrap. Automated posting when credentials available. |
| All others | Stub | Interface only, throws "not implemented". Added in later phases. |

---

## 13. Safety & Compliance

### Rate Limiting

Per persona, per platform, per day/week/month:
- Max posts per day: configurable (default 3)
- Max comments per day: configurable (default 10)
- Min time between posts: configurable (default 2 hours)
- Min cool-down after product mention: configurable (default 3 days)
- Max product mentions per month per persona: configurable (default 4)

### Quality Gate

Separate LLM call that scores content on:
1. Authenticity (1-10)
2. Value (1-10)
3. Promotional smell (1-10, lower = better)
4. Persona consistency (1-10)
5. Community fit (1-10)

Auto-reject if: promo_smell > 4 when promotion_level < 7, OR authenticity < 6, OR value < 5.

### Cross-Persona Rules

- Personas NEVER interact with each other (no upvoting, replying, referencing)
- Personas never post in the same thread
- Each persona covers different communities (minimal overlap)

---

## 14. Database Schema (Drizzle ORM)

PostgreSQL 17 with Drizzle ORM. Schema defined in `app/src/db/schema.ts`.

### Core Tables

| Table | Purpose |
|---|---|
| `products` | Products being promoted |
| `legends` | Full actor identities (Legend schema as JSONB) |
| `legend_accounts` | Email + platform accounts per legend |
| `legend_credentials` | Encrypted credentials (AES-256-GCM) |
| `communities` | Discovered communities with scores |
| `campaigns` | Campaign definitions and status |
| `content_plans` | What to post and when |
| `posts` | Actual posts made, with metrics |
| `post_metrics_history` | Engagement metrics over time |

### Engine Tables (generic, used by engine)

| Table | Purpose |
|---|---|
| `agents` | Agent definitions and status |
| `agent_tasks` | Kanban tasks |
| `task_comments` | Agent comments on tasks |
| `task_artifacts` | Outputs attached to tasks |
| `agent_messages` | Inter-agent communication log |
| `episodic_memories` | Agent episodic memory |
| `consolidated_memories` | Compressed memory summaries |
| `relational_memories` | Agent relationship tracking |
| `heartbeat_schedules` | Cron schedule registry |
| `safety_events` | Rate limit hits, content rejections, warnings |
| `llm_usage` | Per-call LLM cost tracking |

---

## 15. Technology Stack

| Component | Technology | Version |
|---|---|---|
| Language | TypeScript (strict, ESM) | 5.8+ |
| Runtime | Node.js | 22 LTS |
| Package Manager | pnpm | 10+ |
| Monorepo Tooling | Turborepo | 2+ |
| Linting/Formatting | Biome | 2+ |
| API Framework | Fastify | 5+ |
| ORM | Drizzle ORM | latest |
| Migrations | Drizzle Kit | latest |
| Database | PostgreSQL | 17 |
| Job Queue | BullMQ | 5+ |
| Cache/Queue Backend | Redis | 7 |
| LLM (Anthropic) | @anthropic-ai/sdk | latest |
| LLM (Google) | @google/generative-ai | latest |
| LLM (OpenAI) | openai | latest |
| Frontend Framework | React | 19 |
| Build Tool | Vite | 6+ |
| CSS | Tailwind CSS | 4 |
| UI Components | shadcn/ui | latest |
| Server State | TanStack Query | 5+ |
| Client State | Zustand | 5+ |
| Telegram | grammy | latest |
| Auth | Keycloak (existing instance) | — |
| Testing | Vitest | 3+ |
| E2E Testing | Playwright | latest |
| Logging | Pino | 9+ |
| Containers | Docker + Docker Compose | — |

---

## 16. Infrastructure

### 16.1 Port Allocation

Project base: `364xx`

| Service | Host Port | Container Port | Notes |
|---|---|---|---|
| Dashboard (Vite) | 36400 | 5173 | Frontend dev server |
| API (Fastify) | 36401 | 3000 | Backend API |
| PostgreSQL | 36432 | 5432 | Database |
| Redis | 36479 | 6379 | Queue + cache |
| Bull Board | 36473 | 3001 | Job queue dashboard |
| Keycloak | 9080 (shared) | 8080 | Existing instance, shared with other projects |

### 16.2 Docker Compose

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: .
      dockerfile: packages/app/Dockerfile
      target: api
    ports:
      - "${API_PORT:-36401}:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://advocate:advocate@postgres:5432/advocate
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_AI_API_KEY=${GOOGLE_AI_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-placeholder}
      - QWEN_API_KEY=${QWEN_API_KEY:-placeholder}
      - CREDENTIAL_MASTER_KEY=${CREDENTIAL_MASTER_KEY}
      - KEYCLOAK_URL=${KEYCLOAK_URL:-http://host.docker.internal:9080}
      - KEYCLOAK_REALM=${KEYCLOAK_REALM:-advocate}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-placeholder}
      - TELEGRAM_CHANNEL_ID=${TELEGRAM_CHANNEL_ID:-placeholder}
      - LLM_MONTHLY_BUDGET_CENTS=${LLM_MONTHLY_BUDGET_CENTS:-2000}
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  worker:
    build:
      context: .
      dockerfile: packages/app/Dockerfile
      target: worker
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      # same env vars as api
      - DATABASE_URL=postgresql://advocate:advocate@postgres:5432/advocate
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_AI_API_KEY=${GOOGLE_AI_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-placeholder}
      - QWEN_API_KEY=${QWEN_API_KEY:-placeholder}
      - CREDENTIAL_MASTER_KEY=${CREDENTIAL_MASTER_KEY}
      - KEYCLOAK_URL=${KEYCLOAK_URL:-http://host.docker.internal:9080}
      - KEYCLOAK_REALM=${KEYCLOAK_REALM:-advocate}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-placeholder}
      - TELEGRAM_CHANNEL_ID=${TELEGRAM_CHANNEL_ID:-placeholder}
      - LLM_MONTHLY_BUDGET_CENTS=${LLM_MONTHLY_BUDGET_CENTS:-2000}
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  dashboard:
    build:
      context: .
      dockerfile: packages/app/Dockerfile
      target: dashboard
    ports:
      - "${DASHBOARD_PORT:-36400}:5173"

  postgres:
    image: postgres:17-alpine
    ports:
      - "${POSTGRES_PORT:-36432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=advocate
      - POSTGRES_USER=advocate
      - POSTGRES_PASSWORD=advocate
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "advocate"]
      interval: 10s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-36479}:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

### 16.3 Environment Variables

```bash
# .env.example

# --- Ports (host-side, 364xx range) ---
API_PORT=36401
DASHBOARD_PORT=36400
POSTGRES_PORT=36432
REDIS_PORT=36479
BULL_BOARD_PORT=36473

# --- Database ---
DATABASE_URL=postgresql://advocate:advocate@localhost:36432/advocate

# --- Redis ---
REDIS_URL=redis://localhost:36479

# --- LLM Providers ---
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
QWEN_API_KEY=

# --- LLM Budget ---
LLM_MONTHLY_BUDGET_CENTS=2000
LLM_DEFAULT_MODE=balanced

# --- Keycloak ---
KEYCLOAK_URL=http://localhost:9080
KEYCLOAK_REALM=advocate
KEYCLOAK_CLIENT_ID=advocate-app

# --- Telegram ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=

# --- Security ---
CREDENTIAL_MASTER_KEY=          # 32-byte hex string for AES-256-GCM
```

### 16.4 Keycloak Integration

Advocate uses the existing shared Keycloak instance at port 9080. Setup:
- Create realm: `advocate`
- Create client: `advocate-app` (public client, for dashboard SPA)
- Create user: the system owner
- Dashboard uses `keycloak-js` for authentication
- API validates JWT tokens from Keycloak using Fastify plugin

---

## 17. Telegram Integration

### Channel Structure

One Telegram channel per product. Campaign Lead posts there.

### Message Types

| Type | When | Urgency |
|---|---|---|
| Approval request | Content with promotion level > threshold | Blocks posting |
| Alert | Account warned, post removed, unusual activity | Immediate |
| Daily summary | End of day | Informational |
| Weekly report | End of week | Informational |
| Strategy question | Campaign Lead unsure about direction | Blocks |
| Milestone | Karma goal hit, first successful mention | Celebratory |

### Interaction

Uses grammy library inline keyboards for approve/reject/edit actions directly in Telegram.

---

## 18. Dashboard Pages

| Page | Purpose |
|---|---|
| **Dashboard** | Overview — active campaigns, recent activity, key metrics |
| **Campaigns** | Campaign management — create, configure, start/stop |
| **Content Queue** | Content approval — pending drafts, approve/reject/edit |
| **Kanban** | Agent task board — backlog, in progress, review, done |
| **Legends** | Actor registry — legend details, account status, warm-up phase |
| **Analytics** | Engagement metrics — per persona, per community, per campaign |
| **Conversations** | Agent communication log — threaded, filterable |
| **LLM Cost Center** | LLM usage — per provider, per task type, budget status, mode toggle |
| **Settings** | System configuration — model routing, rate limits, notification prefs |

---

## 19. Ethical Framework

1. Never lie about the product — all claims must be verifiable
2. Never fabricate experiences — origin stories based on real capabilities
3. Never dishonestly attack competitors — fair comparisons with real data
4. Genuinely contribute — every interaction provides real value
5. No vote manipulation — personas never upvote each other
6. No persona interaction — personas never reply to or reference each other
7. Respect community rules — skip communities that ban self-promotion
8. Quality over quantity — one great contribution > ten mediocre shill posts
9. Kill switch — any campaign can be stopped instantly
