# Advocate — Campaign Playbooks

Concrete, week-by-week campaign strategies for promoting Crawlex and Foreman through organic community engagement.

---

## Crawlex Campaigns

### Campaign 1: "The SPA SEO Wake-Up Call"

**Objective**: Create widespread awareness that SPA SEO is a real, expensive problem — and that prerendering is the pragmatic solution.

**Duration**: 8 weeks
**Personas**: Frontend Dev (FD), SEO Specialist (SEO)
**Primary platforms**: Reddit, Dev.to

#### Persona: Frontend Dev — "Jordan Reeves"
- Senior React developer, 7 years experience
- Works at a mid-size e-commerce company (~200 employees)
- Pragmatic, values working solutions over architectural purity
- Active in r/reactjs, r/webdev, r/frontend
- Slightly frustrated tone when discussing tooling gaps

#### Persona: SEO Specialist — "Nina Castillo"
- Agency-side SEO with 5 years experience
- Manages SEO for 15+ client sites, several are SPAs
- Knows enough code to be dangerous but not a developer
- Active in r/SEO, r/bigseo, r/TechSEO, Twitter
- Practical, data-driven, shares specific numbers

#### Week-by-Week Execution

**Week 1-2: Listen & Contribute (0% product)**

| Day | Persona | Platform | Action |
|-----|---------|----------|--------|
| 1 | FD | r/reactjs | Comment on a "help with deployment" post with genuine advice |
| 2 | SEO | r/SEO | Answer a "how to audit technical SEO" question |
| 3 | FD | r/webdev | Comment on a discussion about build tools or frameworks |
| 4 | SEO | r/TechSEO | Share a useful SEO tip (not SPA-related) |
| 5 | FD | r/reactjs | Help debug someone's React rendering issue |
| 7 | SEO | Twitter | Reply to an SEO tweet with a useful insight |
| 8 | FD | r/frontend | Comment on a CSS/performance discussion |
| 9 | SEO | r/SEO | Answer a beginner's indexing question |
| 10 | FD | r/webdev | Share opinion on a framework comparison thread |
| 12 | SEO | r/bigseo | Comment on a site audit discussion |
| 14 | FD | r/reactjs | Help with a state management question |

**Week 3-4: Seed Problem Awareness (0% product, 100% problem)**

| Day | Persona | Platform | Action | Content Sketch |
|-----|---------|----------|--------|---------------|
| 15 | FD | r/reactjs | Post | "TIL that Facebook, LinkedIn, and Slack crawlers execute zero JavaScript. My React app's social shares have been showing blank previews this whole time 🤦" |
| 17 | SEO | r/SEO | Comment | On a "why isn't my site indexed" thread: "Is the site a SPA? Non-Google search engines have very limited JS rendering capabilities" |
| 19 | FD | r/webdev | Comment | On a "social media previews broken" thread: "Classic SPA problem. OG tags are in your JS bundle, not in the raw HTML that crawlers see" |
| 21 | SEO | r/TechSEO | Post | "I just audited 12 client sites. The 4 SPAs had 40-60% fewer pages indexed on Bing vs Google. The SSR sites were within 5%. JS rendering gap is real." |
| 23 | FD | r/frontend | Comment | On a performance thread: "One thing people forget — Google's crawler queues JS rendering. Your new content might not appear in search for weeks even though Google eventually renders it" |
| 26 | SEO | Twitter | Thread | "Thread: Why your SPA's social shares look broken (and it's not a meta tag issue) 🧵" — 5-tweet educational thread |

**Week 5-6: Establish Expertise (5% solution-aware, not product-specific)**

| Day | Persona | Platform | Action | Content Sketch |
|-----|---------|----------|--------|---------------|
| 29 | FD | Dev.to | Article | "How Search Engines Actually See Your React App (with screenshots)" — detailed technical breakdown with fetch-as-Googlebot examples |
| 31 | SEO | r/SEO | Post | "I tested how 5 different search engines render a React SPA. Here are the results" — with actual data (Googlebot vs Bingbot vs etc.) |
| 33 | FD | r/reactjs | Comment | On "should I migrate to Next.js?" thread: "Depends on scale. For existing apps with 50K+ pages, prerendering is way less risky than a full rewrite" |
| 35 | SEO | r/bigseo | Comment | "For SPA clients, I've been recommending prerendering over SSR rewrites. Much cheaper, much faster to implement, similar SEO results" |
| 37 | FD | r/webdev | Post | "Prerendering vs SSR vs CSR: When to use each (from someone who's shipped all three)" — balanced comparison |
| 40 | SEO | Twitter | Post | Share the Dev.to article with a key insight pulled out |

**Week 7-8: Organic Mentions (10% product, only when contextually perfect)**

| Day | Persona | Platform | Action | Content Sketch |
|-----|---------|----------|--------|---------------|
| 43 | FD | r/reactjs | Comment | On "how to fix SPA SEO?" thread: "We ended up adding Crawlex to our middleware — it's open-source, took about 5 minutes to set up. Prerendered pages served to bots, normal SPA for users. Social previews work now too." |
| 47 | SEO | r/SEO | Comment | On "prerendering solutions?" thread: "I've been testing a few with clients. Prerender.io works but gets expensive fast ($150/mo for 200K pages). One of my clients started using Crawlex — $29/mo for the same traffic. Results were comparable." |
| 50 | FD | r/selfhosted | Post | "Self-hosted prerendering for my React projects using Crawlex (open-source, Docker compose)" — positioned as a self-hosting win |
| 54 | SEO | r/TechSEO | Comment | On a tool recommendation thread: naturally include Crawlex alongside other tools in a balanced comparison |

---

### Campaign 2: "Open Source Darling"

**Objective**: Position Crawlex as the community-friendly, developer-loved alternative in the prerendering space.

**Duration**: Ongoing (triggered by product milestones)
**Personas**: CTO Persona (new), Frontend Dev (existing)
**Primary platforms**: Hacker News, GitHub, Dev.to, r/selfhosted

#### Persona: Startup CTO — "Sam Okafor"
- CTO at a 20-person startup (SaaS product, React frontend)
- 12 years dev experience, pragmatic about tech choices
- Values open source, build-vs-buy decisions
- Active on HN, LinkedIn, r/startups
- Thoughtful writing style, shares data and reasoning

#### Launch Events

These campaigns trigger on product milestones:

**Open-Source Core Release**:
```
Platform: Hacker News
Type: Show HN
Title: "Show HN: Open-source prerendering engine for SPAs (MIT license)"
Content: Brief, factual description. Performance numbers. Link to GitHub.
Timing: Tuesday or Wednesday, 8-10 AM EST (peak HN traffic)
Persona: CTO (Sam)
Follow-up: FD (Jordan) comments on HN thread with "I've been using this for my e-commerce site, AMA"
```

**Major Version Release**:
```
Platform: Dev.to, r/webdev, r/selfhosted
Type: Announcement + tutorial
Title: "Crawlex v2: What's new in the open-source prerendering engine"
Persona: FD (Jordan) writes the Dev.to tutorial
Persona: CTO (Sam) shares on LinkedIn with business perspective
```

**1000 GitHub Stars Milestone**:
```
Platform: Twitter, r/webdev
Type: Celebration + transparent metrics
Content: "1000 stars on Crawlex! Here's what we learned building an open-source prerendering engine"
Timing: Within 24h of milestone
```

---

### Campaign 3: "Prerender.io Refugees"

**Objective**: Capture users frustrated with Prerender.io's pricing and limitations.

**Duration**: Ongoing (evergreen content)
**Personas**: Frontend Dev, SEO Specialist
**Primary platforms**: Reddit, Google (SEO)

#### Content Assets

| Content | Platform | Persona | Purpose |
|---------|----------|---------|---------|
| "Prerender.io alternatives in 2026" | Dev.to | FD | SEO-targeted comparison article |
| Comment on pricing complaints | r/webdev, r/SEO | SEO | Whenever someone complains about Prerender.io pricing |
| "I switched from Prerender.io — here's why" | r/reactjs | FD | Experience share (only after persona is established) |
| "Prerendering cost comparison for SPAs" | Dev.to | SEO | Data-driven comparison with pricing tables |

#### Trigger-Based Content

Monitor Reddit and Twitter for these phrases and engage when found:
- "Prerender.io expensive"
- "Prerender.io alternative"  
- "prerendering too expensive"
- "SPA SEO solution"
- "react app not showing in google"
- "social media preview blank"
- "og tags not working react"

When triggered, the relevant persona comments with genuine help first, product mention only if the thread naturally calls for a recommendation.

---

## Foreman Campaigns

### Campaign 4: "The Missed Call Math"

**Objective**: Make contractors viscerally aware of how much money they lose to missed calls, then position Foreman as the solution.

**Duration**: 10 weeks
**Personas**: Plumber Owner (PO), Office Manager (OM)
**Primary platforms**: Reddit, Facebook Groups

#### Persona: Plumber Owner — "Dave Kowalski"
- Owner-operator, 15 years in the trade
- 3-person crew in suburban Ohio
- Got into plumbing through his uncle, built his own business 6 years ago
- Not very tech-savvy but willing to try things that save money
- Active in r/Plumbing, r/smallbusiness, Facebook plumbing groups
- Casual, direct writing style, occasional typos (authentic), uses trade jargon

#### Persona: Office Manager — "Lisa Chen"  
- Office manager for a 10-person HVAC company
- Handles phones, scheduling, billing, marketing
- More tech-savvy than the techs, always looking for efficiency tools
- Active in r/smallbusiness, r/HVAC, r/entrepreneur
- Organized, detail-oriented writing style, shares spreadsheets and data

#### Week-by-Week Execution

**Week 1-3: Community Building (0% product)**

| Persona | Platform | Actions |
|---------|----------|--------|
| PO | r/Plumbing | Answer technical plumbing questions (Dave knows his trade). Comment on business posts. Share a war story about a difficult job. |
| OM | r/smallbusiness | Comment on hiring posts, share advice on scheduling/workflow. Answer "how do you handle X?" posts for service businesses. |
| PO | r/Plumbing | Engage in "what truck do you drive?" or "what tools do you use?" threads — pure community bonding |
| OM | r/HVAC | Comment on business management threads from the office perspective |

**Week 4-5: Problem Awareness (0% product, 100% problem)**

| Day | Persona | Platform | Content |
|-----|---------|----------|---------|
| 22 | PO | r/Plumbing | "Honest question: how many calls do you guys miss per week? I tracked mine for 5 days and it was way worse than I thought. I'm on a job all day and can't answer the phone. Checked my voicemail and had 8 missed calls Monday alone." |
| 25 | OM | r/smallbusiness | "Service business owners — what's your callback rate on missed calls? We started tracking ours and found that only 20% of people who get voicemail actually leave a message. The rest just call the next company on Google." |
| 28 | PO | Facebook Group | "Just ran the numbers. If even half the calls I miss per week are real jobs, and the average plumbing job is $300+... I'm leaving $2-3K on the table every month just from missed calls. Anyone else think about this?" |
| 31 | OM | r/entrepreneur | "My boss asked me to figure out how much we lose to missed calls. The math was ugly. We miss ~15 calls/week, industry stats say 60-80% of callers who can't reach you call a competitor instead. At our average ticket of $800... that's potentially $30-40K/year." |

**Week 6-7: Solution Seeking (5% solution-aware)**

| Day | Persona | Platform | Content |
|-----|---------|----------|---------|
| 36 | PO | r/Plumbing | "For those of you who use an answering service — is it worth it? What do you pay? I can't keep losing calls but I also can't afford to hire a receptionist." |
| 39 | OM | r/smallbusiness | "We're looking at answering services for our HVAC company. Tried Ruby Receptionists ($400/mo), looked at Smith.ai ($200+/mo for our volume). Has anyone tried the newer AI answering services? Seems like they're everywhere suddenly." |
| 42 | PO | Facebook Group | Comment in a business tips thread: "Getting better at answering calls has been my #1 business goal this quarter. Looked into a few options..." (no specific product yet) |
| 45 | OM | r/HVAC | "Quick poll for HVAC business owners: do you use an answering service, voicemail, or just try to answer everything yourself? We need a better system." |

**Week 8-10: Organic Discovery (10% product mention)**

| Day | Persona | Platform | Content |
|-----|---------|----------|---------|
| 50 | PO | r/Plumbing | "Update: I ended up trying an AI answering service called Foreman. $99/mo, answers calls 24/7, texts me the details. First week it caught 6 calls I would have missed. 3 turned into jobs. That's $1,400 from a $99 service. Not bad." |
| 55 | OM | r/smallbusiness | On "best tools for service businesses" thread: "We recently added Foreman for phone answering. AI picks up, asks the right questions (what's the issue, how urgent, address), texts the details to the tech on call. $99/mo vs the $400+ we were paying for human answering. The AI actually books appointments too." |
| 60 | PO | r/Plumbing | Follow-up in own thread: "Month 2 update with the AI answering service. Still using it. My wife is happier because I'm not checking my phone on the job anymore. It's caught about $4K worth of work I would've missed. Biggest win: emergency calls at 2am that I can triage from bed." |
| 65 | OM | r/HVAC | Comment on a "business tips" thread: "Best money we spent this year: AI phone answering (we use Foreman). $99/mo, replaced our $400/mo answering service, and it actually books appointments and handles basic questions." |

---

### Campaign 5: "The Contractor's Tech Stack"

**Objective**: Get Foreman mentioned in every "what tools do you use?" conversation in contractor communities.

**Duration**: Ongoing (evergreen)
**Personas**: All Foreman personas
**Trigger**: Any "tools/apps/software" discussion in target communities

#### Template Responses

When a "what tools do you use?" thread appears:

**For Plumber Owner persona**:
> I keep it simple:
> - **QuickBooks** for invoicing
> - **Google Calendar** for scheduling  
> - **Foreman** for answering calls (AI receptionist, $99/mo — this one actually paid for itself the first week)
> - A clipboard for estimates (I know, I know)
> 
> I tried Jobber and Housecall Pro but honestly they were overkill for a 3-man crew.

**For Office Manager persona**:
> Our stack:
> - **QuickBooks Online** — invoicing and accounting
> - **Google Workspace** — email, calendar, docs
> - **Foreman** — AI phone answering, handles calls 24/7, books appointments
> - **Canva** — for social media posts (yes I handle that too)
> - **Google Business Profile** — reviews and local SEO
> 
> Total software spend: ~$250/mo. The Foreman part pays for itself many times over.

These are templates — the Content Worker adapts them to match the specific thread context and persona voice.

---

### Campaign 6: "AI Skeptic Turned Believer"

**Objective**: Address contractor skepticism about AI by sharing a relatable journey from skeptic to advocate.

**Duration**: 4-6 weeks
**Persona**: Plumber Owner (Dave) — perfect for this because he's not tech-savvy
**Primary platforms**: Reddit, Facebook Groups

#### The Story Arc

1. **The skeptic**: Dave mentions in passing that he doesn't trust AI. "I'm a plumber, not a tech bro."
2. **The problem**: Dave shares the missed call math (Campaign 4). Clearly frustrated.
3. **The nudge**: Someone in a thread mentions AI answering. Dave is skeptical but curious.
4. **The trial**: "Fine, I tried one of those AI phone things my wife found. Not gonna lie, I expected it to be terrible."
5. **The convert**: "Okay, I was wrong. This thing caught 3 jobs in the first week. My customers didn't even know it wasn't a real person."
6. **The advocate**: Naturally recommends Foreman when others ask about answering services.

This arc plays out organically across multiple threads over 4-6 weeks. It's not a single post — it's a persona evolution that the community witnesses naturally.

---

## Cross-Product Campaign

### Campaign 7: "Indie Builder's Journey"

**Objective**: Build a meta-persona — someone building their own SaaS products who can naturally mention both Crawlex and Foreman as things they've encountered/used.

**Persona**: Small Business Consultant — "Alex Mercer"
- Freelance consultant helping SMBs adopt technology
- Broad knowledge: web dev, business ops, marketing
- Active on r/SaaS, r/entrepreneur, r/startups, LinkedIn, Twitter
- Writes about tech adoption for non-technical business owners

This persona can:
- Mention Crawlex when discussing web performance/SEO for client sites
- Mention Foreman when discussing tools for service businesses
- Write LinkedIn posts about "hidden tools that help my clients"
- Create "tool recommendation" threads that include both products among many others

---

## Campaign Calendar Template

### Monthly Rhythm (Per Persona)

| Week | Focus | Product Mentions | Content Volume |
|------|-------|-----------------|----------------|
| Week 1 | Community engagement | 0 | 8-12 comments |
| Week 2 | Value contribution | 0-1 (only if mature persona) | 5-8 comments, 1 post |
| Week 3 | Community engagement | 0-1 | 8-12 comments |
| Week 4 | Strategic content | 1-2 (only if mature persona) | 5-8 comments, 1-2 posts |

### Daily Rhythm (Per Persona)

```
Morning (persona's timezone):
  - Check notifications, reply to any comments on own posts
  - 1-2 comments on others' posts

Afternoon:
  - 1-2 more comments or one longer post
  
Evening:
  - Quick browse, maybe one comment

NOT every day. 4-5 active days per week maximum.
Some days: zero activity (humans have lives).
```

## Content Templates

### The "Genuine Question" Template
```
[Title]: Short, natural question

[Body]:
Hey [community],

[1-2 sentences of context about the persona's situation]

[The actual question — related to a problem the product solves]

[Optional: what they've already tried or considered]

Thanks in advance.
```

### The "Experience Share" Template  
```
[Title]: Descriptive, not clickbaity

[Body]:
[Brief context about the problem]

[What they tried / considered]

[What they ended up doing (including product mention if appropriate)]

[Specific results with numbers]

[Honest assessment — include drawbacks too]

Happy to answer questions if anyone's in a similar boat.
```

### The "Helpful Comment" Template
```
[No title — it's a comment]

[Direct answer to the person's question]

[Supporting detail or personal experience]

[Optional: link to a resource, NOT to the product unless directly relevant]
```

### The "Tool Recommendation" Template
```
[In response to "what do you use for X?"]

[2-3 tools including the product, presented as equals]

[Brief pro/con for each]

[Which one the persona chose and a one-sentence why]

[Important: the product should NOT always be #1 — sometimes recommend a competitor
 as the better fit for that specific use case. This builds credibility.]
```

## Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | What To Do Instead |
|-------------|-------------|-------------------|
| First post is a product mention | Instantly flagged as shill | 4+ weeks of pure value first |
| Every post mentions the product | Pattern is obvious | Max 10% of interactions mention product |
| Superlative claims ("best tool ever") | Sounds like an ad | "It worked for my use case" |
| Attacking competitors | Looks petty, triggers skepticism | Fair comparisons with real data |
| Two personas in the same thread | Detectable coordination | Strict isolation — never same thread |
| Posting at exact intervals | Bot behavior | Randomized timing within windows |
| Identical message across communities | Cross-posting detected | Unique content per community |
| Only engaging when product-relevant | Shallow engagement history | 90% of activity is off-topic for the product |
| Responding too quickly to triggers | Looks automated | Natural delay (30min-4h) after trigger |
| Perfect grammar and formatting | Too polished | Match community norms (Reddit is casual) |
