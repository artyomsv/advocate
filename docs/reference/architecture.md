# Advocate — Technical Architecture

## System Overview

Advocate is a multi-agent system where specialized AI agents collaborate to build authentic community presence. Each agent has a single responsibility and communicates through a shared database and event queue.

```
                           ┌─────────────────┐
                           │    Dashboard     │
                           │   (React SPA)    │
                           │                  │
                           │ Campaign mgmt    │
                           │ Content approval │
                           │ Analytics views  │
                           └────────┬─────────┘
                                    │ REST API
                                    ▼
┌───────────────────────────────────────────────────────────────┐
│                      API Gateway (Express)                     │
│  Auth · Rate Limiting · Request Validation · Websocket         │
└─────────────┬──────────────────────────────────┬──────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────┐        ┌─────────────────────────────┐
│    Orchestrator Service  │        │     Analytics Service       │
│                         │        │                             │
│ Coordinates all agents  │        │ Engagement tracking         │
│ Manages schedules       │        │ Performance metrics         │
│ Enforces safety rules   │        │ ROI attribution             │
│ Handles human approvals │        │ Strategy optimization       │
└──────────┬──────────────┘        └─────────────────────────────┘
           │
           │ dispatches jobs via BullMQ
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Job Queue (BullMQ + Redis)                │
│                                                                  │
│  Queues:                                                         │
│  ├── scout:discover     — find new communities                   │
│  ├── scout:monitor      — watch for relevant threads             │
│  ├── content:generate   — create content drafts                  │
│  ├── content:review     — quality gate check                     │
│  ├── engage:post        — publish to platform                    │
│  ├── engage:reply       — respond to comments on our posts       │
│  ├── analytics:collect  — gather engagement metrics              │
│  └── analytics:report   — generate performance reports           │
└──────────────────────────────────────────────────────────────────┘
           │
           │ consumed by workers
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                          Agent Workers                            │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │  Scout      │  │  Content     │  │  Engagement         │    │
│  │  Worker     │  │  Worker      │  │  Worker             │    │
│  │            │  │              │  │                     │    │
│  │ Community   │  │ LLM-powered  │  │ Posts via platform  │    │
│  │ discovery & │  │ content gen  │  │ APIs, tracks        │    │
│  │ monitoring  │  │ & review     │  │ responses           │    │
│  └─────────────┘  └──────────────┘  └─────────────────────┘    │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐                              │
│  │  Analytics  │  │  Safety      │                              │
│  │  Worker     │  │  Worker      │                              │
│  │            │  │              │                              │
│  │ Collects    │  │ Pre-publish  │                              │
│  │ metrics,    │  │ checks, ToS  │                              │
│  │ generates   │  │ compliance,  │                              │
│  │ reports     │  │ rate limits  │                              │
│  └─────────────┘  └──────────────┘                              │
└──────────────────────────────────────────────────────────────────┘
           │
           │ uses
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Platform Adapters                           │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Reddit  │ │Twitter/X│ │  HN    │ │  Dev.to  │ │ Facebook │ │
│  │ Adapter │ │ Adapter │ │Adapter │ │  Adapter │ │ Adapter  │ │
│  └─────────┘ └─────────┘ └────────┘ └──────────┘ └──────────┘ │
│  ┌─────────┐ ┌─────────┐ ┌────────┐                            │
│  │LinkedIn │ │ Discord │ │ Quora  │                            │
│  │ Adapter │ │ Adapter │ │Adapter │                            │
│  └─────────┘ └─────────┘ └────────┘                            │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Data Layer                                 │
│                                                                  │
│  ┌──────────────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │   PostgreSQL     │  │   Redis   │  │  Object Storage    │   │
│  │                  │  │           │  │  (S3/MinIO)        │   │
│  │ Products         │  │ Job queue │  │                    │   │
│  │ Personas         │  │ Rate      │  │ Content drafts     │   │
│  │ Communities      │  │ limiters  │  │ Screenshots        │   │
│  │ Content plans    │  │ Session   │  │ Analytics exports  │   │
│  │ Posts            │  │ cache     │  │                    │   │
│  │ Analytics        │  │           │  │                    │   │
│  └──────────────────┘  └───────────┘  └────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Agent Deep Dives

### Scout Worker

Responsible for community discovery and real-time monitoring.

```typescript
interface CommunityProfile {
  platform: Platform;
  identifier: string;          // "r/reactjs", "@webdev-discord", etc.
  name: string;
  url: string;
  subscriberCount: number;
  postsPerDay: number;
  avgCommentsPerPost: number;
  
  // AI-analyzed
  relevanceScore: number;      // 0-10: how relevant to our products
  activityScore: number;       // 0-10: how active the community is  
  receptivenessScore: number;  // 0-10: how well tool recommendations received
  moderationRisk: number;      // 1-10: how strict on self-promotion
  cultureSummary: string;      // "Technical, formal, values code examples..."
  rulesSummary: string;        // "No self-promo, must flair posts..."
  
  // Tactical
  bestContentTypes: ContentType[];
  bestPostingTimes: TimeWindow[];
  topContributors: string[];   // accounts to study for tone
  recentRelevantThreads: Thread[];
}
```

**Discovery flow**:
1. Seed with known communities (from campaign playbooks)
2. Search platforms for product-relevant keywords
3. Analyze sidebar links and cross-posts for related communities
4. Monitor competitor mentions to find where they're discussed
5. Score and rank all discovered communities
6. Human review of top candidates before any engagement

**Monitoring flow**:
1. Poll active communities for new posts (respecting API rate limits)
2. Filter posts by relevance keywords (configurable per product)
3. Score each relevant post: thread_score = relevance × engagement_potential × timing
4. High-scoring threads → content:generate queue for persona response
5. Store all relevant threads for analytics

### Content Worker

The creative engine. Uses Claude API to generate persona-consistent, community-appropriate content.

**Content generation prompt structure**:
```
System: You are generating a {content_type} for the persona described below,
to be posted in {community_name} on {platform}.

Persona Profile:
{persona_profile_yaml}

Community Culture:
{community_culture_summary}

Community Rules:
{community_rules_summary}

Product Knowledge (USE SPARINGLY — only if content_type allows):
{product_knowledge_card}

Recent Thread Context (if replying):
{thread_context}

Promotion Level: {0-10, where 0=pure value, 10=direct promotion}
Current promotion level for this persona: {current_level}

Generate a {content_type} that:
- Matches the persona's voice and expertise level
- Fits the community's culture and norms
- Provides genuine value to readers
- At promotion level {n}: {specific guidance per level}

CRITICAL: If the promotion level is 0-3, do NOT mention any product.
The content must stand on its own as genuinely helpful.
```

**Quality gate** (separate LLM call):
```
System: You are a content reviewer. Rate the following post on these criteria:

1. AUTHENTICITY (1-10): Does this read like a real human wrote it?
2. VALUE (1-10): Would the community find this genuinely helpful?
3. PROMOTIONAL_SMELL (1-10, lower=better): How promotional does this feel?
4. PERSONA_CONSISTENCY (1-10): Does this match the persona's voice?
5. COMMUNITY_FIT (1-10): Does this match the community's culture?

REJECT if:
- PROMOTIONAL_SMELL > 4 and promotion_level < 7
- AUTHENTICITY < 6
- VALUE < 5
- The content contains unverified claims about any product
- The content attacks competitors dishonestly

Content to review:
{generated_content}

Persona profile:
{persona_profile}

Community:
{community_name}
```

**Content types and their templates**:

| Type | Purpose | Promotion Level | Template |
|------|---------|----------------|----------|
| `helpful_comment` | Build karma, establish presence | 0 | Direct answer to someone's question |
| `value_post` | Establish expertise | 0-1 | Tutorial, guide, or experience sharing |
| `problem_question` | Seed problem awareness | 0-2 | Ask about a pain point the product solves |
| `comparison_question` | Create opening for mentions | 1-3 | "What do you use for X?" |
| `experience_share` | Soft product mention | 4-6 | "I tried X and here's what happened" |
| `recommendation` | Direct product mention | 7-8 | "I'd recommend X for this use case" |
| `launch_post` | Product announcement | 9-10 | Show HN, "I built X" posts (rare, high-karma personas only) |

### Engagement Worker

Handles the actual posting to platforms via adapters.

**Pre-post checklist** (automated):
1. Is the persona's account old enough? (minimum age per platform)
2. Has the persona posted enough value content? (minimum karma/reputation)
3. Is the rate limit OK? (per persona, per platform, per community)
4. Has the safety worker approved this content?
5. Is there a cool-down active? (after product mentions)
6. Is this within the persona's active hours?

**Post-post actions**:
1. Record platform post ID for tracking
2. Schedule engagement metric collection (1h, 6h, 24h, 7d)
3. Monitor for replies (if the post generates discussion, persona should follow up)
4. Trigger reply generation if engagement threshold met

### Safety Worker

The guardrail system that prevents every bad outcome.

**Pre-publish checks**:
```typescript
interface SafetyCheck {
  // Rate limiting
  postsToday: number;           // max per persona per platform per day
  postThisWeek: number;         // max per persona per platform per week  
  mentionsThisMonth: number;    // max product mentions per persona per month
  
  // Timing
  lastPostTime: Date;           // enforce minimum gap
  lastMentionTime: Date;        // enforce mention cool-down (3-5 days)
  
  // Cross-persona
  otherPersonaRecentPosts: Post[];  // ensure personas don't post in same thread
  
  // Content
  containsProductMention: boolean;
  promotionLevel: number;
  qualityGateResult: QualityGateResult;
  
  // Platform
  communityRulesViolation: boolean;
  accountAge: number;           // days since account creation
  accountKarma: number;         // current reputation score
}
```

**Escalation triggers** (require human review):
- Any content with promotion level > 5
- First-ever product mention by a persona
- Post in a community with moderation_risk > 7
- Content flagged by quality gate
- Reply to a moderator or high-profile community member
- Any post that could be interpreted as a competitor attack

## Database Schema

```sql
-- Products we're promoting
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  value_props JSONB NOT NULL,        -- structured value propositions
  pain_points JSONB NOT NULL,         -- problems it solves
  talking_points JSONB NOT NULL,      -- approved ways to mention
  competitor_comparisons JSONB,       -- fair comparison data
  never_say JSONB,                    -- things to never claim
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI personas
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  name VARCHAR(100) NOT NULL,
  background TEXT NOT NULL,           -- full backstory
  personality TEXT NOT NULL,          -- personality traits
  posting_style TEXT NOT NULL,        -- writing style guide
  expertise_areas JSONB NOT NULL,     -- what they know
  knowledge_gaps JSONB,              -- what they don't know
  interests JSONB,                   -- non-product interests
  origin_story TEXT,                 -- how they "discovered" the product
  warm_up_weeks INTEGER DEFAULT 4,
  maturity_level VARCHAR(20) DEFAULT 'lurking',  -- lurking, engaging, established, promoting
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform accounts for personas
CREATE TABLE persona_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  platform VARCHAR(50) NOT NULL,      -- reddit, twitter, devto, etc.
  username VARCHAR(100),
  account_created_at TIMESTAMPTZ,
  current_karma INTEGER DEFAULT 0,
  current_followers INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active', -- active, warned, suspended, banned
  UNIQUE(persona_id, platform)
);

-- Discovered communities
CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(50) NOT NULL,
  identifier VARCHAR(200) NOT NULL,   -- "r/reactjs", "dev.to/t/react"
  name VARCHAR(200) NOT NULL,
  url TEXT,
  subscriber_count INTEGER,
  posts_per_day NUMERIC(8,2),
  relevance_score NUMERIC(3,1),
  activity_score NUMERIC(3,1),
  receptiveness_score NUMERIC(3,1),
  moderation_risk NUMERIC(3,1),
  culture_summary TEXT,
  rules_summary TEXT,
  best_posting_times JSONB,
  last_scanned_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'discovered', -- discovered, approved, active, paused, blacklisted
  UNIQUE(platform, identifier)
);

-- Content plans (what to post and when)
CREATE TABLE content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID REFERENCES personas(id),
  community_id UUID REFERENCES communities(id),
  content_type VARCHAR(50) NOT NULL,  -- helpful_comment, value_post, problem_question, etc.
  promotion_level SMALLINT DEFAULT 0, -- 0-10
  thread_url TEXT,                    -- if replying to existing thread
  thread_context TEXT,                -- summary of thread for context
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'planned', -- planned, generating, review, approved, rejected, posted, failed
  generated_content TEXT,
  quality_score JSONB,               -- quality gate results
  reviewed_by VARCHAR(100),          -- 'auto' or human reviewer name
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actual posts made
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_plan_id UUID REFERENCES content_plans(id),
  persona_account_id UUID REFERENCES persona_accounts(id),
  community_id UUID REFERENCES communities(id),
  platform_post_id VARCHAR(200),     -- ID on the platform
  platform_url TEXT,                 -- direct link to post
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  promotion_level SMALLINT DEFAULT 0,
  posted_at TIMESTAMPTZ,
  
  -- Engagement metrics (updated periodically)
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  
  -- Moderation
  was_removed BOOLEAN DEFAULT FALSE,
  moderator_action TEXT,
  
  last_metrics_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track engagement over time for trend analysis
CREATE TABLE post_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id),
  measured_at TIMESTAMPTZ NOT NULL,
  upvotes INTEGER,
  downvotes INTEGER,
  replies_count INTEGER,
  views INTEGER
);

-- Campaign grouping
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL,            -- campaign strategy description
  persona_ids JSONB NOT NULL,        -- which personas participate
  community_ids JSONB NOT NULL,      -- which communities to target
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'planned', -- planned, active, paused, completed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limiting and safety tracking
CREATE TABLE safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_account_id UUID REFERENCES persona_accounts(id),
  event_type VARCHAR(50) NOT NULL,   -- rate_limit_hit, content_rejected, account_warned, etc.
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_content_plans_status ON content_plans(status);
CREATE INDEX idx_content_plans_scheduled ON content_plans(scheduled_at) WHERE status = 'approved';
CREATE INDEX idx_posts_persona ON posts(persona_account_id, posted_at);
CREATE INDEX idx_posts_community ON posts(community_id, posted_at);
CREATE INDEX idx_communities_platform ON communities(platform, status);
CREATE INDEX idx_safety_events_persona ON safety_events(persona_account_id, created_at);
```

## Platform Adapter Interface

Every platform adapter implements the same interface:

```typescript
interface PlatformAdapter {
  readonly platform: Platform;
  
  // Authentication
  authenticate(credentials: PlatformCredentials): Promise<void>;
  
  // Community operations
  searchCommunities(keywords: string[]): Promise<CommunityResult[]>;
  getCommunityInfo(identifier: string): Promise<CommunityProfile>;
  getRecentPosts(communityId: string, limit: number): Promise<PlatformPost[]>;
  
  // Content operations
  createPost(params: CreatePostParams): Promise<PlatformPostResult>;
  createComment(params: CreateCommentParams): Promise<PlatformPostResult>;
  editPost(postId: string, content: string): Promise<void>;
  deletePost(postId: string): Promise<void>;
  
  // Engagement
  upvote(postId: string): Promise<void>;  // used only for genuine engagement, NEVER for manipulation
  getPostMetrics(postId: string): Promise<PostMetrics>;
  getReplies(postId: string): Promise<PlatformPost[]>;
  
  // Account
  getAccountInfo(): Promise<AccountInfo>;
  getAccountKarma(): Promise<number>;
  
  // Rate limiting (per platform rules)
  getRateLimits(): RateLimitInfo;
}
```

### Reddit Adapter (Primary — Phase 1)

```typescript
// Uses snoowrap (Reddit API wrapper)
// Key considerations:
// - Rate limit: 100 requests per minute per OAuth client
// - New accounts: heavily rate-limited, posts may be auto-removed
// - Self-promotion rule: most subreddits enforce 10:1 ratio
//   (10 non-promotional interactions per 1 promotional)
// - Minimum account age varies by subreddit (some require 30+ days)

interface RedditAdapterConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;     // per persona account
  userAgent: string;        // must be descriptive per Reddit rules
  
  // Safety overrides
  maxPostsPerDay: number;          // default: 3
  maxCommentsPerDay: number;       // default: 10
  minTimeBetweenPosts: number;     // default: 2 hours (ms)
  minAccountAgeDays: number;       // default: 14
  minKarmaForProductMention: number; // default: 100
}
```

## LLM Integration

### Model Selection

| Task | Model | Why |
|------|-------|-----|
| Content generation (comments, short posts) | Claude Haiku 4.5 | Fast, cheap (~$0.001/generation), good enough for comments |
| Content generation (articles, long posts) | Claude Sonnet 4.6 | Better quality for longer-form content |
| Quality gate review | Claude Haiku 4.5 | Structured evaluation, fast turnaround |
| Strategic decisions (persona creation, campaign planning) | Claude Sonnet 4.6 | Needs deeper reasoning |
| Community culture analysis | Claude Sonnet 4.6 | Nuanced understanding of tone and norms |

### Cost Estimation

| Activity | Frequency | Tokens/Call | Model | Cost/Call | Monthly Cost |
|----------|-----------|-------------|-------|-----------|-------------|
| Comment generation | 40/day | ~1,500 | Haiku | ~$0.001 | ~$1.20 |
| Post generation | 4/day | ~3,000 | Sonnet | ~$0.015 | ~$1.80 |
| Quality review | 44/day | ~2,000 | Haiku | ~$0.001 | ~$1.32 |
| Community analysis | 5/week | ~5,000 | Sonnet | ~$0.025 | ~$0.50 |
| Thread monitoring | 20/day | ~2,000 | Haiku | ~$0.001 | ~$0.60 |
| **Total** | | | | | **~$5.42/mo** |

LLM costs are negligible compared to the value of organic promotion.

## Deployment

### Development (Docker Compose)

```yaml
services:
  api:
    build: ./api
    ports: ["3000:3000"]
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://advocate:advocate@postgres:5432/advocate
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  worker:
    build: ./worker
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://advocate:advocate@postgres:5432/advocate
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  dashboard:
    build: ./dashboard
    ports: ["5173:5173"]

  postgres:
    image: postgres:17-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
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
    volumes: ["redisdata:/data"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

### Production

Same Hetzner Kubernetes cluster used for other services. Advocate is lightweight — a single API pod, 1-3 worker pods, shared PostgreSQL and Redis.

## Security Considerations

1. **Credential storage**: Platform API keys and OAuth tokens stored encrypted in database, never in code
2. **Proxy/VPN**: Each persona uses a distinct IP (residential proxy service) to avoid platform linking accounts by IP
3. **Browser fingerprinting**: If browser-based automation needed, use distinct fingerprints per persona
4. **Secrets isolation**: Anthropic API key and platform credentials separate from code via environment variables
5. **Audit trail**: Every action logged — who posted what, where, when, and why
6. **Access control**: Dashboard requires auth, content approval requires specific role
