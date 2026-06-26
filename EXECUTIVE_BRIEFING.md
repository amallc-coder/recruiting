# Clinilytics ATS — Executive Business Summary

**Prepared for:** Board of Directors & Executive Leadership
**Subject:** Strategic, financial, and technical review of the Clinilytics Applicant Tracking Platform
**Classification:** Confidential — Board Briefing
**Status legend:** 🟢 Live in production · 🟡 Partially built / in progress · ⚪ Planned · ◇ Assumption

> **Document note.** Every capability marked 🟢 has been built, deployed, and verified in the live environment. Items marked ⚪/🟡 are recommendations or partial builds and are labeled as such. Financial and timeline figures are **directional estimates** based on standard industry benchmarks; key assumptions are stated explicitly. Where data was unavailable, an assumption is declared rather than invented.

---

# 1. Executive Overview

**What it is.** Clinilytics ATS is a modern, AI-native **Applicant Tracking System** purpose-built for high-volume healthcare staffing. It unifies the full hiring lifecycle — open requisitions, candidate sourcing, pipeline management, interviews, offers, and analytics — into a single web platform, and it ingests an organization's existing recruiting spreadsheets in seconds rather than requiring a months-long data migration.

**The business problem it solves.** Healthcare staffing organizations run hiring out of fragmented Excel workbooks, email threads, and disconnected job boards. The result is no single source of truth, no visibility into where the pipeline is stalling, recruiter effort that can't be measured, and open positions that stay unfilled while census and revenue suffer. Clinilytics replaces that with one system of record that is **operational on day one** — because it reads the spreadsheets the team already maintains.

**Target customers and users.**

| Segment | Primary users | What they get |
|---|---|---|
| Healthcare staffing & SNF/LTC operators (initial market) | Recruiters, recruiting managers, HR/admins | A live pipeline, auto-assignment, AI matching |
| Multi-facility provider groups | Executives, regional directors | Open-positions and time-to-hire visibility |
| Any high-volume employer (expansion) | Hiring managers, interviewers | Career page, applications, scorecards |

**Vision & strategic value.** Become the **operating system for healthcare hiring** — the layer where every requisition, candidate, and recruiter action is captured, measured, and increasingly automated by AI. The platform is already live in production and managing real data: **1,366 candidates, 312 requisitions (184 open positions) across 70 facilities, with 16 recruiters onboarded.**

---

# 2. Business Value

| Value lever | Outcome | Why it matters to the business |
|---|---|---|
| **Faster time-to-fill** | Open positions surfaced and ranked; AI shortlists candidates | Each unfilled clinical role is lost census/revenue and agency premium cost |
| **Operational efficiency** | One upload replaces manual re-keying of ~1,200 candidates + 300 requisitions | Frees recruiter hours for candidate engagement, not data entry |
| **Recruiter productivity & accountability** | Per-recruiter dashboards + anonymized benchmarking | Identifies top performers and coaching needs without surveillance optics |
| **Cost savings** | Reduced agency reliance via better internal pipeline; near-zero infrastructure cost | Agency fees are the single largest recruiting cost line |
| **Revenue enablement** | Faster fills → higher facility staffing → protected census & contract revenue | Hiring velocity is directly tied to top-line capacity |
| **Risk reduction** | Audit log, role-based access, candidate data isolation | Compliance posture and defensibility for HR/legal |
| **Competitive advantage** | Spreadsheet-to-platform in minutes; AI-native; healthcare-specific | Removes the #1 barrier to ATS adoption: migration pain |
| **Scalability** | Cloud-native; supports many facilities, recruiters, and 100k+ candidates | Grows with M&A and new-facility expansion at marginal cost |

**Illustrative ROI (◇ assumptions stated).**
- ◇ If the platform reduces time-to-fill by even **10–20%** on clinical roles, the recovered census/revenue per facility typically dwarfs the platform's total cost of ownership.
- ◇ Eliminating manual spreadsheet maintenance recovers an estimated **5–10 recruiter-hours/week per recruiter**; across 16 recruiters that is **~80–160 hours/week** redirected to candidate engagement.
- ◇ Infrastructure runs on commodity cloud services (static hosting + managed database), so **incremental cost per added facility/recruiter approaches zero**.

---

# 3. Platform Capabilities

For each capability: **what it does · why it matters · business impact · end-user benefit.**

### Core features
| Capability | Status | What it does / Why it matters / Business impact / End-user benefit |
|---|---|---|
| **Excel/CSV import engine** | 🟢 | Reads the team's "Recruitment Team Sheet" directly — unpivots candidates, extracts open positions, auto-assigns recruiters (fuzzy name matching), and links candidates to their opening. *Removes the migration barrier; the platform is useful on day one; re-uploads self-heal assignments without duplicates.* |
| **Requisition / Job management** | 🟢 | Create, publish, pause, close requisitions with openings counts, locations, departments, pay ranges, status. *Single source of truth for what's open; "open positions" rolls up automatically.* |
| **Candidate pipeline** | 🟢 | Stage-based pipeline (sourced → interview → offer → onboarding → active) with full stage history. *Visibility into where candidates stall; nothing falls through the cracks.* |
| **Applications & public Career page** | 🟢 | A no-login, mobile-responsive careers site; applicants apply and flow straight into the pipeline. *Owns the top of funnel; reduces dependence on paid boards.* |
| **Interviews & Offers** | 🟢 | Schedule interviews, capture feedback/scores, extend offers with salary/start date and status. *Structures the late-funnel; feeds analytics.* |

### Administrative functions
| Capability | Status | Summary |
|---|---|---|
| Team management | 🟢 | Manage users, roles, activation; **set a recruiter's login email and trigger password reset from the admin panel.** |
| Placeholder recruiters | 🟢 | Imported recruiters exist as assignable "placeholder" accounts; an admin grants login later by setting a real email — no candidate re-assignment needed. |
| Cloud setup & data export | 🟢 | One-click export of local data to the production database; guided connection. |

### User roles & permissions
| Capability | Status | Summary |
|---|---|---|
| Role-based access (Admin / Recruiter) | 🟢 | Admins see everything; recruiters see **only their assigned records**, enforced in the database (not just the UI). |
| Strict per-recruiter isolation | 🟢 | Server-enforced row-level security; one recruiter cannot read another's candidates. |
| Extended role model (Supervisor / Hiring Manager / Interviewer / Viewer) | 🟡 | Roles defined in the data model; full UI enforcement is a Phase-2 item. |

### Automation
| Capability | Status | Summary |
|---|---|---|
| Auto-assignment | 🟢 | Candidates auto-assigned to recruiters; placeholders auto-created for unknown names. |
| Application → candidate creation | 🟢 | A career-page application automatically creates and links a candidate (server-side). |
| Immutable event log | 🟢 | Every key action is recorded as an event — the foundation for analytics and audit. |
| Rules/workflow engine (multi-step automations) | ⚪ | Recommended Phase-2 (e.g., auto-email on apply, auto-reminders). |

### AI functionality
| Capability | Status | Summary |
|---|---|---|
| AI candidate matching | 🟢 | Ranks candidates against an open position with fit score, strengths, and gaps (powered by Claude). |
| AI job/role generation | 🟢 | Drafts responsibilities, requirements, and pay ranges from a title. |
| AI candidate summaries, email drafting, interview questions | ⚪ | High-value Phase-2 extensions of the existing AI layer. |

### Reporting & analytics
| Capability | Status | Summary |
|---|---|---|
| Executive dashboard | 🟢 | Open positions, active candidates, applications, offers, hires, time-to-hire, funnel, conversion, sources. |
| Pipeline & velocity | 🟢 | Stage conversion, average days-in-stage, **bottleneck detection**. |
| Interviews & Offers dashboards | 🟢 | Status breakdowns, no-show rate, acceptance rate, salary distribution, interviewer leaderboard. |
| Finance / cost-per-hire | 🟢 | Spend by category, cost per hire/interview/offer, budget tracking. |
| Recruiter performance + **anonymized benchmarking** | 🟢 | Personal KPIs plus rank/percentile vs. peers **without exposing peer identities** (computed server-side). |
| CSV export on every dashboard | 🟢 | One-click data export. |
| Full 18-dashboard enterprise BI suite + drill-down + scheduled email | 🟡/⚪ | Core dashboards live; the full executive BI vision is a phased roadmap item. |

### Workflow, integrations, security, compliance, mobile, API, customization
| Capability | Status | Summary |
|---|---|---|
| **Integrations marketplace** | 🟢 | 15 providers (Indeed, LinkedIn, Google/Outlook Calendar, Gmail, Checkr, DocuSign, ADP, BambooHR, Workday, Slack, Zapier, Custom REST/Webhook) with connect/configure/disconnect, field mapping, and logs. |
| OAuth + sync + webhook engine | 🟢 (framework) / 🟡 (per-provider live data) | Secure OAuth handshake, token refresh, and webhook receiver are built and deployed; turning each provider "live" is incremental. |
| **Developer API & documentation** | 🟢 (docs/spec) / ⚪ (public GA) | In-app API reference, payload schemas, webhook events, code samples. |
| Security model | 🟢 | Managed authentication, row-level security, **credentials stored write-only (never exposed to the browser)**, admin-only sensitive tables, audit logging. |
| Compliance features | 🟡 | Audit trail and access controls in place; EEOC/diversity reporting and retention policies are Phase-2/3. |
| Mobile / responsive | 🟢 | Responsive web across desktop/tablet/phone; native mobile app is ⚪ future. |
| Customization | 🟢/🟡 | Configurable jobs, field mappings, role taxonomy; custom pipelines per job is ⚪ Phase-2. |

---

# 4. Major Value Adds (Differentiators)

| Differentiator | Why it's hard to replicate | Quantified benefit (◇) |
|---|---|---|
| **Spreadsheet-to-platform in minutes** | Most ATSs require services-led migration | ◇ Eliminates a typical **4–12 week** data-migration project; verified: ~1,200 candidates + ~300 requisitions ingested from one file |
| **AI-native matching & generation** | Built on a frontier model, integrated into the workflow | ◇ Cuts shortlisting from hours to **seconds**; drafts a requisition in <1 minute vs. 20–40 minutes manual |
| **Self-healing re-import** | Re-uploads back-fill assignments without duplicates | ◇ Removes the "import broke my data" risk that stalls ATS adoption |
| **Privacy-preserving recruiter benchmarking** | Server-computed, identity-masked peer comparison | Drives performance **without** the morale cost of surveillance |
| **Near-zero infrastructure economics** | Static front end + managed backend | ◇ Marginal cost per facility/recruiter ≈ **$0**; no per-seat infra tax |
| **Enterprise scalability path** | Cloud-native data + RLS isolation | Designed for **100k+ candidates, 10k+ jobs** |

**Productivity / time-savings summary (◇):** manual data entry largely eliminated; recruiter shortlisting reduced from hours to seconds; requisition authoring reduced ~95%; reporting that previously required manual spreadsheet assembly is now **real-time and one click**.

---

# 5. Technical Architecture (Executive Level)

In business-friendly terms, the platform is built on a **modern, cloud-native, low-operational-overhead** stack — the same architectural pattern used by fast-moving SaaS companies to minimize cost and maximize reliability.

```
   Applicants & Public            Recruiters / Admins (Browser)
        │                                   │
        ▼                                   ▼
 ┌─────────────────────────────────────────────────────┐
 │     Web Application  (responsive, single-page)        │   ← Front end
 └─────────────────────────────────────────────────────┘
        │  secure API calls (encrypted in transit)
        ▼
 ┌─────────────────────────────────────────────────────┐
 │  Managed Cloud Backend                                │
 │   • Database (system of record)                       │
 │   • Authentication & per-user data isolation (RLS)    │
 │   • Serverless functions (AI, OAuth, webhooks, admin) │
 │   • File storage (résumés)                            │
 └─────────────────────────────────────────────────────┘
        │
        ▼   AI model (Claude) · External platforms (job boards, calendars, HRIS, e-sign)
```

| Layer | In plain terms | Business benefit |
|---|---|---|
| **Front end** | The website/app users see | Fast, responsive, works on any device |
| **Database** | The single source of truth | Reliable, auditable, scalable |
| **Authentication** | Secure login + per-user access | Right people see the right data |
| **Serverless functions** | Small secure programs for AI, integrations, admin actions | Pay-per-use; nothing to maintain |
| **AI model** | Frontier large language model | Matching, drafting, summarization |
| **Cloud infrastructure** | Managed hosting (static front end + managed DB) | Minimal ops cost; high uptime |
| **Security model** | Row-level security, write-only secrets, audit log | Defensible, enterprise-grade posture |
| **Scalability/performance** | Cloud-elastic; indexed data | Grows with the business at marginal cost |

**Security highlights:** encrypted in transit, row-level data isolation enforced in the database, third-party credentials stored **write-only** (never returned to the browser), admin-only sensitive tables, and an immutable audit log of permission-sensitive actions.

---

# 6. Development Progress — Executive Dashboard

**Two lenses:** (A) progress toward a **deployable, in-use product** and (B) progress toward the **full multi-phase enterprise vision** captured in the requirements.

| Lens | Completion (◇ estimate) | Interpretation |
|---|---|---|
| **A. Deployable v1 / working product** | **~85%** 🟢 | Live, in production, managing real data today |
| **B. Full enterprise vision (all phases)** | **~40%** 🟡 | Core complete; advanced BI, automation, and breadth are roadmap |

### Module status (RAG)

| Module | Status | Notes |
|---|---|---|
| Import engine (candidates, openings, recruiter mapping, linking) | 🟢 Complete | Verified on live data |
| Jobs / requisitions & open-positions | 🟢 Complete | |
| Candidate pipeline & stage history | 🟢 Complete | |
| Public career page & applications | 🟢 Complete | |
| Interviews & offers | 🟢 Complete | Core flows live |
| Analytics (Exec, Pipeline, Interviews, Offers, Finance) + benchmarking | 🟢 Complete | 5 dashboards live |
| AI matching & generation | 🟢 Complete | Live via serverless + Claude |
| RBAC, admin, audit log | 🟢 Complete | Strict isolation enforced |
| Integrations framework + marketplace + OAuth/webhook engine | 🟢 Framework / 🟡 per-provider live | 15 providers configurable; live data sync per provider is incremental |
| Developer API & docs | 🟡 | Documented; public GA pending |
| Full enterprise BI (18 dashboards), drill-down, scheduled email | 🟡/⚪ | Core in place; remainder roadmap |
| Workflow automation engine | ⚪ | Planned Phase-2 |
| Compliance/EEOC, talent pool, referrals, mobile app | ⚪ | Planned Phase-2/3 |

**Highest-risk / dependency items:**
- ⚠️ **Third-party OAuth approvals** (LinkedIn/Indeed job-data scopes require partner approval) — outside our control; basic auth works immediately.
- ⚠️ **Email deliverability at volume** — default provider limits reset/invite email throughput; resolved by connecting a dedicated SMTP provider (a configuration step).
- ⚠️ **Data hygiene at the source** — spreadsheet inconsistencies (e.g., duplicate names) are now auto-normalized, but source-data quality remains a shared responsibility.

**Technical debt:** low and contained. Notable items: a few legacy domain concepts retained from the original prototype, the public API not yet hardened for external GA, and front-end bundle size growth (a known, low-risk optimization). None block production use.

---

# 7. Development Timeline (Traditional, Non-AI-Assisted Equivalent)

This estimates what an equivalent build would have required with a **conventional engineering team** (no AI-assisted development), for the **completed scope (Lens A)**.

◇ **Assumptions:** mid-to-senior US team; ~140 productive engineering hours per person-month; standard SDLC with discovery, design, QA, and security review.

| Phase | Est. hours (◇) |
|---|---|
| Discovery & requirements | 120–180 |
| UI/UX design | 200–280 |
| Architecture | 100–150 |
| Backend development (DB, security, serverless) | 320–450 |
| Frontend development (12+ screens, charts) | 480–680 |
| Database development | 100–150 |
| Authentication & RBAC | 120–180 |
| API & integrations framework | 220–360 |
| AI features | 140–240 |
| Testing & QA | 240–380 |
| Security review | 80–120 |
| Bug fixes | 150–250 |
| Deployment & CI/CD | 60–100 |
| Documentation | 80–120 |
| **Total** | **≈ 2,500–3,600 hours** |

| Dimension | Estimate (◇) |
|---|---|
| **Calendar timeline** | **6–9 months** to a comparable, polished v1 |
| **Team size** | **4–6 people** |
| **Typical roles** | Product Manager, UX/UI Designer, 1–2 Frontend Engineers, Backend Engineer, AI/ML Engineer, QA Engineer, part-time DevOps & Security |

> **AI-assisted reality:** the equivalent scope was delivered in a dramatically compressed window via AI-assisted development — the central strategic point for the Board: **time-to-market and cost were reduced by roughly an order of magnitude.**

---

# 8. Development Cost Estimate

◇ **Assumptions:** midpoint of **~3,000 engineering hours** for the completed scope; standard 2024–2025 blended rates; rates are fully-loaded (not salary-only).

| Delivery model | ◇ Blended rate | ◇ Estimated cost (≈3,000 hrs) |
|---|---|---|
| **US senior in-house / boutique** | $150/hr | **~$450,000** (range $375k–$600k) |
| **Offshore** | $45/hr | **~$135,000** (range $90k–$180k) |
| **Hybrid (US lead + offshore build)** | $90/hr | **~$270,000** (range $210k–$360k) |
| **Enterprise agency** | $225/hr | **~$675,000** (range $500k–$950k) |

**Ongoing run-rate (◇):** infrastructure is **commodity-priced** (static hosting + managed database + pay-per-use serverless + metered AI). The dominant variable cost is AI usage, which scales with adoption and remains a small fraction of the value created per hire.

---

# 9. Competitive Positioning

| Dimension | Clinilytics ATS | Greenhouse / Lever / Ashby | Workday / iCIMS (enterprise) | BambooHR / JazzHR (SMB) |
|---|---|---|---|---|
| Healthcare-staffing fit | **Native** | Generic | Generic, configurable | Generic |
| Spreadsheet onboarding | **Minutes** | Services-led migration | Long implementation | Manual |
| AI matching/generation | **Built-in (frontier model)** | Add-on/partial | Emerging | Limited |
| Recruiter benchmarking (privacy-safe) | **Yes** | Partial | Partial | Rare |
| Integrations marketplace | **Yes (framework)** | Yes (mature) | Yes (mature) | Limited |
| Cost of ownership | **Very low** | High per-seat | Highest | Moderate |
| Implementation time | **Days** | Weeks–months | Months–quarters | Weeks |

**Market positioning.** A **vertical-first, AI-native, low-friction** ATS that wins where incumbents are weakest: **migration pain, implementation time, cost, and verticalization.** Mature incumbents lead on breadth and ecosystem depth — which is precisely the roadmap.

**Enterprise readiness:** core security and access model are enterprise-grade; SSO, SOC 2, advanced compliance, and SLAs are roadmap items for enterprise procurement.

**Industries / expansion:** healthcare & SNF/LTC (now) → home health, behavioral health, dental/vet groups → any **high-volume, multi-location** employer.

---

# 10. Future Roadmap (prioritized by business impact)

| Priority | Phase 2 (next) | Business impact |
|---|---|---|
| 1 | **Live calendar & e-sign integrations** (interview scheduling, offer signing) | Removes manual coordination; faster close |
| 2 | **Workflow automation engine** (auto-emails, reminders, stage triggers) | Recruiter time savings; consistency |
| 3 | **Full BI suite + drill-down + scheduled email reports** | Executive self-serve insight |
| 4 | **AI summaries, email drafting, interview-question generation** | Compounds the AI advantage |
| 5 | **Custom pipelines per job + scorecards** | Fits diverse hiring processes |

| Priority | Phase 3 (scale) | Business impact |
|---|---|---|
| 1 | **Public API GA + webhook ecosystem + marketplace** | Platform/ecosystem leverage; partner channel |
| 2 | **Enterprise: SSO, SOC 2, EEOC/diversity & compliance reporting** | Unlocks enterprise procurement |
| 3 | **Talent pool, referral program, internal mobility** | Lowers cost-per-hire; reduces agency spend |
| 4 | **Native mobile app + forecasting/AI insights** | Field usability; predictive hiring |

---

# 11. Executive Conclusion

- **Why invest.** A working, in-production platform already manages real hiring operations and eliminates the two biggest barriers to ATS value — **migration friction and time-to-insight** — at a fraction of incumbent cost.
- **Organizational impact.** A single source of truth for hiring, measurable recruiter performance, faster fills, and reduced manual labor and agency dependence.
- **Long-term strategic value.** A defensible, vertical-first, AI-native platform with a clear path from a healthcare-staffing product to a broader hiring operating system and API ecosystem.
- **Potential ROI (◇).** Conservatively, recovered recruiter capacity and even modest time-to-fill improvement generate value that materially exceeds the platform's total cost of ownership; AI-assisted delivery already saved an estimated **$250k–$700k and 6–9 months** versus a traditional build.
- **Sustainable advantage.** Vertical depth + AI-native workflow + frictionless onboarding + near-zero marginal cost compound over time and are difficult for horizontal incumbents to replicate quickly.

---

# 📋 Executive Snapshot (one-page standalone)

> **Clinilytics ATS** — an AI-native Applicant Tracking System for healthcare staffing. **Live in production today**, managing **1,366 candidates, 312 requisitions (184 open positions), 70 facilities, 16 recruiters.**

| | |
|---|---|
| **What** | One platform for the full hiring lifecycle: requisitions → sourcing → pipeline → interviews → offers → analytics |
| **Wedge** | Reads existing recruiting spreadsheets in minutes — no migration project |
| **AI** | Frontier-model candidate matching & requisition generation, built into the workflow |
| **Proof points** | 5 live analytics dashboards · recruiter benchmarking · 15-provider integrations framework · strict per-recruiter security · public career page |
| **Status** | ~85% of a deployable v1 (live) · ~40% of the full enterprise vision (roadmap) |
| **Equivalent traditional build (◇)** | ~2,500–3,600 engineering hours · 6–9 months · 4–6 person team |
| **Equivalent cost (◇)** | US ~$450k · Hybrid ~$270k · Offshore ~$135k · Agency ~$675k |
| **Run-rate** | Commodity cloud; marginal cost per facility/recruiter ≈ $0 |
| **Top differentiators** | Frictionless onboarding · AI-native · vertical fit · privacy-safe benchmarking · near-zero infra cost |
| **Biggest near-term unlocks** | Live calendar/e-sign integrations · workflow automation · full BI suite |
| **Enterprise gating items** | SSO · SOC 2 · advanced compliance reporting (roadmap) |
| **The ask / takeaway** | A live, defensible, AI-native platform delivered at ~10× speed and cost advantage — fund Phase 2 to convert a strong v1 into a category-leading product |

---

*Prepared as an executive briefing. Status markers (🟢/🟡/⚪) distinguish live, in-progress, and planned functionality; ◇ marks directional estimates with stated assumptions rather than asserted fact.*
