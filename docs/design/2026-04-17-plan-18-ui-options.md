# Plan 18 UI options — Products + Agents pages

**Decision needed:** pick one Products layout + one Agents layout (or mix). Each option has a distinct personality; don't optimise for "generic admin" — Mynah is an agent-operated system, the UI should feel that way.

---

## Products page — three options

### Option P1 — Classic list + drawer (safe)

```
┌────────────────────────────────────────────────────────────────────┐
│ Products                                           [+ Add product] │
│ ───────────────────────────────────────────────────────────────── │
│ Name                  Slug               Status   Updated          │
│ ──────                ──────              ──────   ──────          │
│ Fairy Book Store      fairybookstore     active   2 days ago  →    │
│ Smoke 14              smoke-14           active   today       →    │
└────────────────────────────────────────────────────────────────────┘
                       ↓ click row
┌──────────────────────┐
│ Fairy Book Store  ✕  │   ← side drawer slides in
│ ──────────────────── │
│ https://fairybook…   │
│ Status: active       │
│                      │
│ Value props (3)      │
│ • Personalized       │
│ • Unique stories     │
│ • …                  │
│                      │
│ Pain points (2)      │
│ • Generic books …    │
│                      │
│ [Edit]  [Archive]    │
└──────────────────────┘
```

**Pros:** Fastest to build. Familiar. Works well when you have 10+ products.  
**Cons:** Feels like Jira. Doesn't showcase the rich knowledge base — everything is hidden in a drawer the user has to open.  
**Time:** ~1 day.

---

### Option P2 — Product brief as a document (knowledge-first)

```
┌──────────────────────┬───────────────────────────────────────────┐
│ Products      [+]    │ # Fairy Book Store                        │
│ ──────────────────── │ fairybookstore.com                        │
│ ▶ Fairy Book Store   │ ─────────────────────────────────────────│
│   Smoke 14           │                                           │
│                      │ ## What it is                             │
│                      │ Personalized children's books where the  │
│                      │ child is the hero of the story.           │
│                      │                                           │
│                      │ ## Value props                            │
│                      │ ✨ Unique bedtime stories starring your   │
│                      │    child                                  │
│                      │ ✨ Magical personalization                │
│                      │                                           │
│                      │ ## Pain points we address                 │
│                      │ ⚠ Generic books don't engage children     │
│                      │                                           │
│                      │ ## Never say                              │
│                      │ ✕ "AI-generated"                          │
│                      │ ✕ "automated"                             │
│                      │                                           │
│                      │ ## Target audiences                       │
│                      │ Parents of 3-8 year olds → reddit,        │
│                      │ facebook                                  │
│                      │                                           │
│                      │              [Edit brief]  [Archive]      │
└──────────────────────┴───────────────────────────────────────────┘
```

**Pros:** The product IS the knowledge base agents use. Presenting it as a readable brief makes the "why it works" obvious. Scans top-to-bottom, no hunting. Great for 1-5 products.  
**Cons:** Wastes space if you have 30+ products. Not a table you can sort/filter.  
**Time:** ~1.5 days.

---

### Option P3 — Campaign dashboard (product-as-campaign-home)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Fairy Book Store  ▼                                        owner ▾ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Legends  │ │  Queue   │ │ Scheduled│ │   Cost   │              │
│  │    1     │ │    1     │ │   none   │ │  $0.003  │              │
│  │ active   │ │ pending  │ │          │ │ this mo. │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  ## Knowledge                                       [Edit brief ▸] │
│  ✨ 3 value props ⚠ 2 pain points ✕ 2 never-say 🎯 1 audience     │
│                                                                     │
│  ## Recent activity                                                 │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 2h ago  · content_plan approved   (L1 · value_post)         │  │
│  │ 2h ago  · content_plan drafted    (strategist → writer)     │  │
│  │ 3d ago  · Sarah Mitchell (legend) created                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Product dropdown at the top of the whole app — everything (Queue, Legends, LLM) scopes to the selected product. Products page itself becomes redundant because a campaign IS a product view.

**Pros:** This is actually how multi-product owners think. Each product is a campaign. "I'm working on Fairy Book today" → all numbers are scoped.  
**Cons:** Requires re-scoping Queue/Legends/LLM to pass productId filter. Bigger rework. Worth it if you run multiple products concurrently.  
**Time:** ~3 days (restructures the whole shell).

---

## Agents page — three options

### Option A1 — Status cards grid (flat roster)

```
┌───────────────────────────────────────────────────────────────────┐
│ Agents                                                            │
│ ────────────────────────────────────────────────────────────────│
│                                                                   │
│ ┌──────────────────────┐ ┌──────────────────────┐               │
│ │ 🧠 Strategist        │ │ ✍️ Content Writer    │               │
│ │ ──────────────────── │ │ ──────────────────── │               │
│ │ Picks legend + goal  │ │ Drafts the post      │               │
│ │                      │ │                      │               │
│ │ Last run: 2h ago   ● │ │ Last run: 2h ago   ● │               │
│ │ Runs today:   3      │ │ Runs today:   3      │               │
│ │ Cost today:   $0.003 │ │ Cost today:   $0.019 │               │
│ │ Provider: claude     │ │ Provider: claude     │               │
│ └──────────────────────┘ └──────────────────────┘               │
│                                                                   │
│ ┌──────────────────────┐ ┌──────────────────────┐               │
│ │ 🔍 Quality Gate      │ │ 🛡️ Safety Worker     │               │
│ │ ──────────────────── │ │ ──────────────────── │               │
│ │ LLM review           │ │ Rules-based checks   │               │
│ │                      │ │                      │               │
│ │ Last run: 2h ago   ● │ │ Last run: 2h ago   ● │               │
│ │ Runs today:   3      │ │ Runs today:   3      │               │
│ │ Cost today:   $0.004 │ │ Cost today:   $0      │               │
│ │ Provider: gemini     │ │ Provider: — (rules)  │               │
│ └──────────────────────┘ └──────────────────────┘               │
│                                                                   │
│ ┌──────────────────────┐                                         │
│ │ 👔 Campaign Lead     │                                         │
│ │ ──────────────────── │                                         │
│ │ Final decision       │                                         │
│ │ Last run: 2h ago   ● │                                         │
│ │ …                    │                                         │
│ └──────────────────────┘                                         │
└───────────────────────────────────────────────────────────────────┘
```

**Pros:** Clean. At-a-glance health. Works forever as you add agents.  
**Cons:** Flat. Doesn't show WHO reports to WHOM. Doesn't show the handoff pipeline.  
**Time:** ~1 day.

---

### Option A2 — Org chart (hierarchy-first)

```
┌───────────────────────────────────────────────────────────────────┐
│ Agents — org chart                                                │
│ ────────────────────────────────────────────────────────────────│
│                                                                   │
│                    ┌────────────────────┐                        │
│                    │  👔 Campaign Lead  │                        │
│                    │  approves | rejects│                        │
│                    │  3 runs · $0.002   │                        │
│                    └──────────┬─────────┘                        │
│                               │                                   │
│            ┌──────────────────┼──────────────────┐               │
│            ▼                  ▼                  ▼               │
│   ┌────────────────┐  ┌──────────────┐  ┌──────────────┐       │
│   │🧠 Strategist   │  │🔍 Quality    │  │🛡️ Safety     │       │
│   │picks plan      │  │reviews draft │  │hard rules    │       │
│   │3 runs · $0.003 │  │3 runs· $0.004│  │3 runs · $0   │       │
│   └────────┬───────┘  └──────────────┘  └──────────────┘       │
│            │                                                     │
│            ▼                                                     │
│   ┌────────────────┐                                            │
│   │✍️ Content      │                                            │
│   │  Writer        │                                            │
│   │drafts post     │                                            │
│   │3 runs · $0.019 │                                            │
│   └────────────────┘                                            │
└───────────────────────────────────────────────────────────────────┘
```

**Pros:** Matches your original "Campaign Lead → Strategist/Scout/Analytics" vision. Teaches the system shape at a glance. Click a node → drawer with that agent's recent runs.  
**Cons:** Hierarchies get ugly when you add Scout + Analytics + more. Org-chart layouts look cute at 5 nodes and weird at 15.  
**Time:** ~2 days (SVG lines between boxes, or a lightweight graph lib like `dagre`).

---

### Option A3 — Activity stream (narrative)

```
┌───────────────────────────────────────────────────────────────────┐
│ Agents — live activity                       [All agents ▾] [⚡] │
│ ────────────────────────────────────────────────────────────────│
│                                                                   │
│ 🟢 2h ago — content_plan 8a1b47… approved                         │
│   └ 👔 Campaign Lead decided: post                               │
│     ├ from 🛡️ Safety: cleared (rules)                            │
│     ├ from 🔍 Quality: score 8.2/10, fluency high                │
│     ├ from ✍️ Writer: 421 chars, gemini-2.5-flash, $0.00057      │
│     └ from 🧠 Strategist: picked Sarah Mitchell for r/Parenting  │
│                                                                   │
│ 🟡 3h ago — content_plan 6168b5… rejected                         │
│   └ 👔 Campaign Lead decided: reject                             │
│     └ reason: community too thin, receptiveness 7.0              │
│                                                                   │
│ 🟢 1d ago — legend Sarah Mitchell created                        │
│   └ by owner, linked to product fairybookstore                   │
│                                                                   │
│ [Load older activity]                                             │
└───────────────────────────────────────────────────────────────────┘
```

**Pros:** The most useful view when things ARE running autonomously. You don't want a status grid; you want to see what happened. Tells the story of each content_plan backward from decision to strategy.  
**Cons:** Needs per-agent-run data (currently only `llm_usage` + final `content_plan` survive; intermediate "Strategist said X to Writer" messages don't persist — that's Plan 11.5 territory).  
**Time:** ~2 days for the view, but **the data layer depends on Plan 11.5** to be rich. Without Plan 11.5 you get a thin version that only knows content_plan outcomes.

---

## Recommended combos

| Goal | Products | Agents | Rationale |
|------|----------|--------|-----------|
| **Fastest win** | P1 list+drawer | A1 cards grid | 2 days total, ships real utility, no backend changes |
| **Feels like a real product** | P2 brief as document | A1 cards grid | Shows the knowledge base as the first-class thing. Agents stay utilitarian. ~3 days |
| **Campaign operator vibe** | P3 campaign dashboard | A2 org chart | Most ambitious; rewrites shell; best for multi-product runs. ~5 days |
| **Wait for Plan 11.5 then full narrative** | P2 brief | A3 activity stream | Depends on persisted messages. Delay until 11.5 lands. ~3-4 days after 11.5 |

## Questions for you

1. **Products — P1, P2, or P3?** (My lean: **P2**. The knowledge IS the product; showing it as a document makes the system feel grounded.)
2. **Agents — A1, A2, or A3?** (My lean: **A1 now**, **A3 after Plan 11.5 lands**. A2 looks cool but doesn't scale.)
3. **Top-of-app product switcher (P3's core idea)?** Worth doing even if we don't go full P3? It's the single biggest UX improvement for running multiple products.
4. **Aesthetic** — stay dark/minimal like today? Or want a different direction (lighter, more colour, more whitespace)?

Tell me your picks and I'll write Plan 18 against them.
