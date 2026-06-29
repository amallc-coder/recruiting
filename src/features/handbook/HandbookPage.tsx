import { BookOpen } from 'lucide-react'
import { Card } from '../../components/primitives'

// In-app recruiter knowledge base / training handbook. Plain content, organized
// around the hire workflow (open a requisition → source → screen → interview →
// offer → hire → measure) so a new recruiter can self-onboard.

interface Section {
  id: string
  title: string
  blocks: Block[]
}
type Block =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'list'; items: string[] }

const SECTIONS: Section[] = [
  {
    id: 'workflow',
    title: 'The hire workflow, end to end',
    blocks: [
      { kind: 'p', text: 'Clinilytics follows one path from an open role to a hire. The left nav is grouped in this order.' },
      {
        kind: 'steps',
        items: [
          'Open a requisition — create the role (facility, role family, headcount, description/requirements, and the application questionnaire), then submit it for approval. Once approved it opens.',
          'Publish & source — open requisitions appear on the public Careers page. Use Sourcing to find passive candidates and rediscover past applicants; use Templates for outreach.',
          'Candidates apply — applicants answer the application questionnaire on the Careers page. AI scores fit: weak matches are auto-declined, and stronger-fit open roles are offered as one-click apply.',
          'Screen — run an AI voice or SMS screening. The agent asks your questions, records a transcript, scores fit + sentiment, and writes a scorecard. If it is a bad time, it books a callback and the call is placed automatically at that time.',
          'Match & shortlist — Matching ranks candidates against a requisition with transparent reasons; open a Match Card for the deep AI analysis.',
          'Move through the pipeline — drag candidates across stages on the requisition board. Advancing out of interview requires a completed scorecard.',
          'Interview — candidates self-book from a link; panelists get the kit and a scorecard; they can add it to their calendar.',
          'Offer — build the offer (use the AI fair-market-value suggestion), get it approved, generate the letter, and send for e-signature. Track accept/decline with a reason.',
          'Hire & onboard — on acceptance an onboarding checklist is generated and verified credentials carry forward.',
          'Measure — Analytics shows KPIs vs benchmarks, the funnel bottleneck, source-of-hire, and cost; Governance shows the AI decision + audit trail.',
        ],
      },
    ],
  },
  {
    id: 'requisitions',
    title: 'Requisitions (open postings)',
    blocks: [
      { kind: 'p', text: 'A requisition is the role you are hiring for. Create one from the Requisitions tab.' },
      {
        kind: 'list',
        items: [
          'Fill in title, facility, role family, headcount, and budget. Description and requirements feed both AI matching and the public posting.',
          'Application questionnaire: the questions candidates answer when they apply. Leave empty to use a default healthcare set. These drive the AI fit/auto-reject on the Careers page.',
          'Approval chain: draft → submit → approve → open. Only open requisitions show on the Careers page.',
          'On the detail page you also get pipeline metrics, the screening-question card, and the candidate pipeline board.',
        ],
      },
    ],
  },
  {
    id: 'careers',
    title: 'Careers page & the application questionnaire',
    blocks: [
      { kind: 'p', text: 'The public Careers page (top-right “Careers page” link, or /#/careers) lists every open, public requisition and takes applications — no login.' },
      {
        kind: 'list',
        items: [
          'Applicants answer the application questionnaire right on the form.',
          'On submit, AI scores their answers + résumé against the role. Under 50% match is auto-declined (recorded with the reason).',
          'If they match ≥50% on other open roles, those are offered for one-click apply — so a strong candidate for the wrong role still lands somewhere they fit.',
          'A candidate + application are created automatically and flow into your pipeline.',
        ],
      },
    ],
  },
  {
    id: 'sourcing',
    title: 'Sourcing & CRM',
    blocks: [
      {
        kind: 'list',
        items: [
          'Talent search: describe who you want in plain language; it searches your candidate pool under your access.',
          'Rediscover: for a requisition, surfaces past candidates who match but have not applied.',
          'Re-engagement: candidates whose licenses are expiring soon, bucketed by 30/60/90 days.',
          'Templates: reusable outreach / nurture messages with merge fields, plus multi-step sequences.',
        ],
      },
    ],
  },
  {
    id: 'screening',
    title: 'AI screening & scheduled callbacks',
    blocks: [
      { kind: 'p', text: 'Screening runs an AI voice call or SMS using your approved questions.' },
      {
        kind: 'steps',
        items: [
          'Create a screening for a candidate (it seeds from the requisition’s questions). Approve it.',
          'Send it as a call or SMS (or send a self-scheduling link). The voice agent uses a friendly female voice, gives the AI/recording disclosure, and asks one question at a time.',
          'When it ends, you get a transcript, fit score, sentiment, flags, and a scorecard — and a confident pass auto-advances + invites the candidate to book an interview.',
          'If it is a bad time, the agent captures a callback day/time, texts a confirmation, and the call is placed automatically then. Watch the “Scheduled callbacks” panel + per-row badges on the Screening tab.',
          'If a call does not connect, the candidate gets a “we’ll try again” text and you can re-send.',
        ],
      },
    ],
  },
  {
    id: 'matching',
    title: 'Matching',
    blocks: [
      {
        kind: 'list',
        items: [
          'Matching ranks candidates for a requisition by how well their text covers its requirements — with the matched terms shown, so it is explainable.',
          'Open a Match Card for the deep per-application AI analysis (logged to the AI decision trail).',
          'Screening results fold into matching, so a screened candidate’s matches sharpen over time.',
        ],
      },
    ],
  },
  {
    id: 'offers',
    title: 'Offers & onboarding',
    blocks: [
      {
        kind: 'steps',
        items: [
          'Create an offer for a candidate; tie it to the requisition to get an AI fair-market-value suggestion (web-grounded).',
          'Approve the offer (records approver + time). Send is gated until it is approved.',
          'Open the offer letter to preview, copy, or download it; paste an e-signature link to track signing.',
          'Mark accepted or declined (declines capture a reason for analytics). On acceptance an onboarding checklist is generated with verified credentials carried forward.',
        ],
      },
    ],
  },
  {
    id: 'autopilot',
    title: 'Autopilot & the command console',
    blocks: [
      {
        kind: 'list',
        items: [
          'Console: ask questions about your data in plain language (e.g. “open RN reqs in Texas”). It is read-only and logged.',
          'Autopilot: give a goal; it proposes a governed plan. Safe steps run on click, outward-facing steps need approval, and high-stakes actions (offers, rejections, hires, pay) are never automated — you do those.',
          'Everything Autopilot proposes or does is recorded in the audit trail.',
        ],
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics, governance & data',
    blocks: [
      {
        kind: 'list',
        items: [
          'Analytics: KPI cards vs benchmark/target with “what to fix”, a funnel that flags the worst-converting stage, source-of-hire, and per-recruiter views. Use the date range + segment filters to drill in; Export CSV or Capture snapshot for trends.',
          'Governance (admin): the AI decision log, agent audit trail, an adverse-impact (four-fifths) report, and live RLS security coverage.',
          'Import (admin): bring candidates in from a spreadsheet or SharePoint. Before go-live, “Go-live reset” wipes candidate data so you can import a clean file (configuration is kept).',
        ],
      },
    ],
  },
  {
    id: 'tips',
    title: 'Tips & good habits',
    blocks: [
      {
        kind: 'list',
        items: [
          'Write clear requisition requirements — AI matching and the application fit-score both read them.',
          'Curate the application questionnaire per role; it is your first automated filter.',
          'Always let a scorecard back a stage advance — it keeps decisions consistent and auditable.',
          'Check the funnel’s flagged bottleneck weekly and the “what to fix” line on each KPI.',
          'High-stakes actions are intentionally manual. AI assists; you decide.',
        ],
      },
    ],
  },
]

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'p') return <p className="text-sm leading-relaxed text-muted">{block.text}</p>
  if (block.kind === 'steps')
    return (
      <ol className="space-y-1.5">
        {block.items.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper tnum">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    )
  return (
    <ul className="ml-1 space-y-1.5">
      {block.items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

export function HandbookPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <BookOpen size={22} className="text-sage-600" /> Recruiter handbook
        </h1>
        <p className="mt-1 text-sm text-muted">How to run the platform from an open requisition to a hire. Skim it once, then use the table of contents to jump back.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Table of contents */}
        <nav className="hidden lg:block">
          <div className="sticky top-16 space-y-1">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded px-2 py-1 text-sm text-muted hover:bg-brand-50 hover:text-ink">
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {SECTIONS.map((s) => (
            <Card key={s.id} id={s.id} className="scroll-mt-16 p-5">
              <h2 className="mb-3 text-base font-semibold tracking-tight text-ink">{s.title}</h2>
              <div className="space-y-3">
                {s.blocks.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
