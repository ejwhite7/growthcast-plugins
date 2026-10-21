// The launch model: the checklist, the tiering rubric, the asset catalogue, dates, normalization, checks and readiness
// gates. Shared by the studio (browser), the server/CLI (Node) and the exports, so there is one source of truth.

export const ROLE_INFO = {
	DRI: "Owns the launch end to end; runs go/no-go",
	PMM: "Positioning, message house, announcement, enablement",
	PM: "Scope, eligibility, rollout, in-app, changelog",
	ENG: "Flag, instrumentation, rollout and rollback",
	DESIGN: "First-run experience, visuals for assets",
	WEB: "Landing page, site banner",
	CONTENT: "Video, tutorials",
	SOCIAL: "Founder, company and employee posts; creators; community",
	PAID: "Audiences, creative, budgets, search",
	LIFECYCLE: "Announcement email, nudges, winback",
	SUPPORT: "KB, AI support bot, ticket review",
	CS: "Key accounts and feature requesters",
	DATA: "Metric, baseline, dashboard, readouts",
	LEGAL: "Claims review, creator contracts",
	FOUNDER: "Narrative, founder posts (approves, doesn't run)",
};
export const ROLES = ["DRI", "PMM", "PM", "ENG", "DESIGN", "WEB", "CONTENT", "SOCIAL", "PAID", "LIFECYCLE", "SUPPORT", "CS", "DATA", "LEGAL", "FOUNDER"];
export const LAUNCH_STATUS = [["planning", "Planning"], ["building", "Building"], ["go", "Go"], ["launched", "Launched"], ["measuring", "Measuring"], ["closed", "Closed"]];
export const ITEM_STATUS = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"], ["waived", "Waived"], ["na", "N/A"]];
export const ASSET_STATUS = [["todo", "Not started"], ["draft", "Draft"], ["review", "In review"], ["approved", "Approved"], ["live", "Live"]];

export const PHASES = [
	{ id: "decide", label: "Decide", window: "T-30 → T-21" },
	{ id: "narrative", label: "Narrative", window: "T-21 → T-14" },
	{ id: "build", label: "Build assets", window: "T-14 → T-5" },
	{ id: "gonogo", label: "Go / No-go", window: "T-3" },
	{ id: "launch", label: "Launch", window: "T-0" },
	{ id: "amplify", label: "Amplify & adopt", window: "T+1 → T+30" },
	{ id: "measure", label: "Measure & learn", window: "T+7 → T+90" },
];

// The rubric: five factors scored 0–3. Total 11–15 is T1, 6–10 T2, 0–5 T3.
export const RUBRIC = [
	{ id: "reach", label: "Reach", q: "Share of active users who will notice or benefit", levels: ["<5%", "5–25%", "25–60%", ">60%"] },
	{ id: "acquisition", label: "Acquisition story", q: "Would a prospect choose us because of this?", levels: ["No", "Marginal", "Yes, for a niche segment", "Yes, a headline differentiator"] },
	{ id: "revenue", label: "Revenue link", q: "Pricing, upgrade or retention impact", levels: ["None", "Indirect", "Upgrade trigger or retention driver", "New paid SKU or pricing change"] },
	{ id: "behavior", label: "Behavior change", q: "How much must the user learn or do?", levels: ["None (it just works)", "Small", "New workflow", "New mental model"] },
	{ id: "narrative", label: "Competitive / narrative", q: "Does it shift how the market sees us?", levels: ["No", "Parity", "Leapfrogs a competitor", "Category-defining"] },
];
export const TIERS = {
	1: { label: "T1 Flagship", short: "T1", desc: "Full stack, founder-led. At most one every ~6 weeks." },
	2: { label: "T2 Notable", short: "T2", desc: "Owned channels, in-app, lifecycle, docs, light social, paid launch campaign." },
	3: { label: "T3 Minor", short: "T3", desc: "Changelog, KB, tooltip, support note. Roll into a monthly “What's new”." },
};
export const tierFromScore = (s) => (s >= 11 ? 1 : s >= 6 ? 2 : 3);

// Assets the launch produces. `item` links each to the checklist item it completes.
export const ASSETS = [
	{ id: "founder-announcement", label: "Founder product announcement", tiers: [1, 2], role: "PMM", item: "founder-post", spec: "Outcome-led headline; short personal opening (why we built it); per feature: benefit subhead, 2–4 sentences, [VISUAL] placeholder, who it's for, deep-link CTA; what's next; sign-off." },
	{ id: "announcement-video", label: "Announcement video script & storyboard", tiers: [1, 2], role: "CONTENT", item: "video-script", spec: "Two-column script (what's on screen | what's said) for the hero cut. Hook in the first 2 seconds, one message, one proof moment, one CTA. Shot list per scene (screen capture, founder on camera, AI or b-roll), on-screen text, and notes for the vertical and paid cutdowns. Production details live on the Video tab." },
	{ id: "social-founder", label: "Founder social posts", tiers: [1, 2], role: "SOCIAL", item: "social-founder", spec: "One native post per platform (X thread, LinkedIn, TikTok/IG caption). Video is the hero. Hook in line one. LinkedIn link in the first comment." },
	{ id: "social-company", label: "Company social posts + calendar", tiers: [1, 2], role: "SOCIAL", item: "social-company", spec: "Launch-day posts per platform, then a T-0 → T+14 calendar." },
	{ id: "employee-kit", label: "Employee advocacy kit", tiers: [1], role: "SOCIAL", item: "employee-kit", spec: "3 voice variants (builder, customer-facing, simple share), a per-employee UTM template, and the T-0 Slack nudge." },
	{ id: "creator-brief", label: "Creator / UGC briefs", tiers: [1], role: "SOCIAL", item: "creators", spec: "Separate organic seeding and performance UGC briefs: the one message, 3 hooks, must-show moments, do/don't, #ad disclosure, usage rights and whitelisting, deliverables." },
	{ id: "in-app", label: "In-app announcement", tiers: [1, 2, 3], role: "PM", item: "in-app", spec: "Modal (≤6-word title, 1 sentence, deep-link CTA, Learn more → KB), plus banner, tooltip and ineligible-plan upsell variants. Targeting and frequency cap." },
	{ id: "site-banner", label: "Marketing-site banner", tiers: [1, 2], role: "WEB", item: "banner", spec: "≤12 words, a CTA, an expiry date." },
	{ id: "landing-page", label: "Feature landing page", tiers: [1, 2], role: "PMM", item: "landing-page", spec: "H1, subhead, 3 pillar sections with proof, a demo video slot, FAQ (schema-ready), a CTA for each audience, the target keyword." },
	{ id: "changelog-entry", label: "Changelog entry", tiers: [1, 2, 3], role: "PM", item: "changelog", spec: "Benefit-led title (≤8 words), New / Improved / Fixed, link to the KB." },
	{ id: "kb-article", label: "Knowledge base article", tiers: [1, 2, 3], role: "SUPPORT", item: "kb", spec: "“How to…” title. Eligibility first, numbered steps with [SCREENSHOT] markers, troubleshooting, limitations. One task per article so the AI support bot can answer from it." },
	{ id: "youtube-tutorial", label: "YouTube tutorial", tiers: [1, 2], role: "CONTENT", item: "youtube", spec: "Search-intent title, chapters, a script with on-screen actions, a description with links, a pinned comment." },
	{ id: "webinar", label: "Webinar deep-dive", tiers: [1], role: "PMM", item: "webinar", spec: "Title, 45-minute agenda (story, live demo, Q&A), registration page copy, 3 reminder emails." },
	{ id: "paid-ads", label: "Paid ads by audience", tiers: [1, 2], role: "PAID", item: "paid-creative", spec: "Per audience (prospects / warm engagers / users / churned, excluding users who have adopted the feature): 3 hooks, 2 primary texts, headline, description, CTA, creative concept, format, exclusions. Boost the announcement video to warm audiences first." },
	{ id: "lifecycle", label: "Lifecycle emails", tiers: [1, 2], role: "LIFECYCLE", item: "email-announce", spec: "Announcement email (3 subject lines, preheader, body, CTA). Non-adopter sequence at D+3/D+10/D+21 (use case → proof → friction removal), each exiting on activation. Upgrade nudge. Winback (T1)." },
	{ id: "app-store", label: "App store & push copy", tiers: [1, 2], role: "PM", item: "mobile", spec: "“What's New” (first line ≤170 characters) and push notification copy (title ≤40 characters)." },
	{ id: "support-pack", label: "Support pack", tiers: [1, 2, 3], role: "PMM", item: "support-pack", spec: "2-sentence positioning, eligibility, top 10 FAQ, known limitations and workarounds, 3 macros, escalation path, ticket tag." },
	{ id: "cs-pack", label: "Customer success pack", tiers: [1, 2], role: "PMM", item: "cs-pack", spec: "Talk track per segment, “why this matters for your account”, demo script, objections, and the outreach email to key accounts and feature requesters." },
	{ id: "internal-announcement", label: "Internal announcement", tiers: [1, 2], role: "DRI", item: "internal", spec: "Slack post, all-hands demo outline, internal FAQ." },
];

// The launch video: formats, the deliverables cut from the master, the approvers, and who it's handed off to.
export const VIDEO_FORMATS = [["", "Choose a format"], ["screen-demo", "Screen demo (recorded product UI)"], ["founder", "Founder on camera + product UI"], ["ai-hybrid", "AI-generated shots + product UI"], ["animated", "Motion graphics / animated UI"], ["ugc", "Creator / UGC style"]];
export const VIDEO_DELIVERABLES = [
	{ id: "hero", label: "Hero cut", spec: "16:9 · 60–90s · captions burned in", use: "YouTube, landing page, announcement post, webinar", tiers: [1, 2] },
	{ id: "vertical", label: "Vertical", spec: "9:16 · 30–45s · UI inside safe zones", use: "TikTok, Reels, Shorts, founder and employee social", tiers: [1, 2] },
	{ id: "square", label: "Square", spec: "1:1 · 30s", use: "LinkedIn, X and Facebook feeds", tiers: [1] },
	{ id: "loop", label: "In-app / KB loop", spec: "Silent · 10–20s · MP4 + GIF fallback", use: "In-app modal, KB article, changelog", tiers: [1, 2] },
	{ id: "ads", label: "Paid cuts", spec: "6s, 15s, 30s · 3 hook variants · 9:16, 1:1, 4:5", use: "Meta, TikTok and YouTube ads", tiers: [1, 2] },
	{ id: "captions", label: "Captions & thumbnails", spec: "SRT per cut and language · 2 thumbnail options", use: "Every upload", tiers: [1, 2] },
];
export const VIDEO_APPROVERS = [["PMM", "Message and claims match the message house"], ["FOUNDER", "Voice and narrative"], ["LEGAL", "Claims, music and talent rights"]];
export const VIDEO_HANDOFFS = [
	{ id: "social", role: "SOCIAL", label: "Social & founder", what: "Vertical and square files, captions, post copy per platform, posting order for T-0", tiers: [1, 2] },
	{ id: "employee", role: "SOCIAL", label: "Employee advocacy", what: "Download link and pre-written posts added to the advocacy kit", tiers: [1] },
	{ id: "paid", role: "PAID", label: "Paid media", what: "Ad cuts to spec, hook variants, proof that music and talent are cleared for paid, UTMs", tiers: [1, 2] },
	{ id: "web", role: "WEB", label: "Website", what: "Hero embed and poster frame for the landing page and announcement post", tiers: [1, 2] },
	{ id: "support", role: "SUPPORT", label: "Support / KB", what: "Loop and hero link embedded in the KB article; cross-link from the YouTube tutorial", tiers: [1, 2] },
	{ id: "cs", role: "CS", label: "Customer success", what: "Hero link and a one-line intro for key-account outreach", tiers: [1, 2] },
	{ id: "archive", role: "CONTENT", label: "Archive", what: "Master, project files, raw footage and licenses in the shared drive", tiers: [1, 2] },
];
export const DELIVERABLE_STATUS = [["todo", "Not started"], ["editing", "Editing"], ["review", "In review"], ["ready", "Ready"], ["live", "Live"]];

// The checklist. `due` is days from T-0 (negative = before). `gate` marks a hard go/no-go gate (gate: 1 = T1 only).
const I = (phase, id, tiers, role, due, text, extra = {}) => ({ phase, id, tiers, role, due, text, ...extra });
export const ITEMS = [
	I("decide", "tier", [1, 2, 3], "DRI", -21, "Tier assigned with the rubric, with the reasoning written down"),
	I("decide", "dri", [1, 2, 3], "DRI", -21, "One accountable launch DRI named, plus an owner for every workstream"),
	I("decide", "calendar", [1, 2], "DRI", -21, "Date checked against the launch calendar: no other T1/T2 within ±7 days, no holiday, no billing or pricing change"),
	I("decide", "eligibility", [1, 2, 3], "PM", -21, "Eligibility defined: plans, platforms, regions, languages, feature flag"),
	I("decide", "packaging", [1, 2], "PM", -21, "Packaging decided, including what an ineligible-plan user sees and how they upgrade"),
	I("decide", "rollout-plan", [1, 2], "PM", -21, "Rollout plan agreed: 100% of the announced audience has access by T-0"),
	I("decide", "metric", [1, 2, 3], "DATA", -21, "Primary metric, activation definition, guardrails and targets set before launch (Measure tab)"),
	I("decide", "baseline", [1, 2], "DATA", -14, "Baseline captured for the job this feature replaces (trailing 4 weeks)"),
	I("decide", "holdout", [1], "DATA", -21, "Holdout design agreed: lifecycle holdout (5–10%) and paid geo/audience holdout"),

	I("narrative", "message-house", [1, 2, 3], "PMM", -14, "Message house approved (Messaging tab)", { gate: true }),
	I("narrative", "evidence", [1, 2], "PMM", -14, "Customer evidence secured: beta users, quotes, before/after numbers, permission to use"),
	I("narrative", "name", [1, 2], "PMM", -14, "Feature name checked: plain-language, searchable, translatable, trademark-safe"),
	I("narrative", "founder-angle", [1], "FOUNDER", -14, "Founder narrative angle agreed: why we built it, what it says about where we're going"),
	I("narrative", "claims", [1, 2], "LEGAL", -7, "Claims review: performance numbers, AI claims, competitor comparisons, “free”/“unlimited”"),
	I("narrative", "video-brief", [1, 2], "PMM", -21, "Video brief: the one message, audience, format (screen demo, founder on camera, AI or hybrid), length, channels, approvers (Video tab)"),
	I("narrative", "video-script", [1, 2], "CONTENT", -14, "Video script and storyboard approved: hook in 2 seconds, one message, proof, CTA"),
	I("narrative", "requesters", [1, 2], "PMM", -14, "Users who requested it identified (request board, support tags, CS notes) so they hear first"),

	I("build", "founder-post", [1, 2], "PMM", -5, "Founder product announcement written in product-marketing terms"),
	I("build", "ui-freeze", [1, 2], "PM", -12, "Feature UI frozen in a capture environment with realistic demo data (video and screenshots depend on it)"),
	I("build", "video-production", [1, 2], "CONTENT", -9, "Video production: screen capture, founder takes, AI shots, voiceover, music licensed for paid use"),
	I("build", "video-review", [1, 2], "PMM", -6, "Video review closed: PMM, founder and legal signed off on the cut (2 rounds max)"),
	I("build", "video-final", [1, 2], "CONTENT", -5, "Video master approved and archived with project files and licenses", { gate: 1 }),
	I("build", "video-cutdowns", [1, 2], "CONTENT", -4, "Video cutdowns and captions: vertical, square, in-app loop, paid cuts, SRT files, thumbnails"),
	I("build", "video-handoff", [1, 2], "CONTENT", -3, "Video hand-off packet sent to social, paid, web, support and CS, each with files, captions and specs (Video tab)"),
	I("build", "teaser-motion", [1, 2], "DESIGN", -4, "Pre-launch teaser motion graphic (optional)"),
	I("build", "teaser-post", [1, 2], "SOCIAL", -2, "Teaser post scheduled to go out at T-2"),
	I("build", "paid-handoff", [1, 2], "PMM", -3, "Product marketing, launch video and vertical-specific assets handed off to paid once created"),
	I("build", "landing-page", [1, 2], "WEB", -5, "Feature landing page live-ready: indexable, target keyword, FAQ schema"),
	I("build", "banner", [1, 2], "WEB", -5, "Marketing-site banner built, with an expiry date"),
	I("build", "changelog", [1, 2, 3], "PM", -5, "Changelog entry written for users (curated, not raw release notes)"),
	I("build", "social-founder", [1, 2], "SOCIAL", -5, "Founder social posts drafted and approved by the founder"),
	I("build", "social-company", [1, 2], "SOCIAL", -5, "Company posts and the T-0 → T+14 content calendar"),
	I("build", "employee-kit", [1], "SOCIAL", -5, "Employee advocacy kit shared, with per-employee UTMs"),
	I("build", "creators", [1], "SOCIAL", -10, "Creator briefs out: organic + performance UGC, disclosure and usage rights signed"),
	I("build", "community", [1, 2], "SOCIAL", -5, "Community seeding plan that follows each community's rules"),
	I("build", "in-app", [1, 2, 3], "PM", -5, "In-app announcement built, targeted to eligible users, frequency-capped, deep-linked"),
	I("build", "first-run", [1, 2], "DESIGN", -5, "Empty state and first-run experience inside the feature"),
	I("build", "mobile", [1, 2], "PM", -5, "Mobile: app store “What's New”, screenshots, push plan"),
	I("build", "kb", [1, 2, 3], "SUPPORT", -3, "Knowledge base article ready to publish at T-0, screenshots match production", { gate: true }),
	I("build", "kb-bot", [1, 2], "SUPPORT", -3, "KB fed into the AI support bot and tested with 10 real questions"),
	I("build", "youtube", [1, 2], "CONTENT", -5, "YouTube tutorial: search-titled, chaptered, linked from KB and in-app"),
	I("build", "webinar", [1], "PMM", -5, "Webinar scheduled, registration opens at T-0"),
	I("build", "localization", [1], "PMM", -5, "In-app, KB and lifecycle copy localized for supported languages"),
	I("build", "audiences", [1, 2], "PAID", -5, "Paid audiences built (prospects, warm engagers, users, churned), excluding users who have adopted the feature, checked for consent and suppression"),
	I("build", "paid-creative", [1, 2], "PAID", -5, "Paid creative per audience, plus the announcement video boost"),
	I("build", "paid-budget", [1, 2], "PAID", -5, "Budget, flights, kill criteria and UTM taxonomy agreed"),
	I("build", "search", [1, 2], "PAID", -5, "Search: brand + feature keywords, competitor gaps, sitelinks"),
	I("build", "email-announce", [1, 2], "LIFECYCLE", -5, "Announcement email to eligible users, holdout excluded"),
	I("build", "nonadopter", [1, 2], "LIFECYCLE", -5, "Non-adopter sequence D+3 / D+10 / D+21, exits on activation"),
	I("build", "upgrade-path", [1, 2], "LIFECYCLE", -5, "Upgrade nudge for ineligible-plan users who show intent"),
	I("build", "winback", [1], "LIFECYCLE", -5, "Winback to churned users whose churn reason this fixes"),
	I("build", "collision", [1, 2], "LIFECYCLE", -5, "Collision check: frequency caps, no other send to the segment within 48h"),
	I("build", "support-pack", [1, 2, 3], "PMM", -3, "Support pack shared: positioning, FAQ, limits, macros, escalation, ticket tag", { gate: true }),
	I("build", "cs-pack", [1, 2], "PMM", -5, "CS pack: talk tracks, key-account list, demo script"),
	I("build", "partners", [1], "PMM", -5, "Partner, affiliate and agency enablement kit"),
	I("build", "press", [1], "PMM", -7, "Press or analyst outreach (embargoed briefing if newsworthy)"),
	I("build", "internal", [1, 2], "DRI", -1, "Internal launch: all-hands demo, Slack post, internal FAQ"),
	I("build", "events", [1, 2, 3], "ENG", -7, "Events implemented per the tracking plan and verified in production", { gate: true }),
	I("build", "dashboard", [1, 2], "DATA", -3, "Launch dashboard: exposure → discovery → first use → activation → retained"),
	I("build", "utms", [1, 2], "DATA", -3, "UTMs and deep links tested from every asset"),

	I("gonogo", "readiness", [1, 2, 3], "DRI", -3, "Readiness review run; every blocker resolved or waived by the DRI"),
	I("gonogo", "rollout-ready", [1, 2], "ENG", -3, "Feature at the agreed rollout %, error rates normal, kill switch tested", { gate: true }),
	I("gonogo", "rollback-comms", [1, 2], "PMM", -3, "Rollback comms drafted (status page and in-app copy)", { gate: 1 }),
	I("gonogo", "run-of-show", [1], "DRI", -3, "Run-of-show with owners and a war-room channel"),

	I("launch", "flag-live", [1, 2, 3], "ENG", 0, "Feature live for the announced audience before anything public goes out"),
	I("launch", "vip-notify", [1], "CS", 0, "Key accounts and feature requesters told personally, 1 hour before public"),
	I("launch", "social-sequence", [1, 2], "SOCIAL", 0, "Founder post → company post → employee advocacy, within 60 minutes"),
	I("launch", "publish-owned", [1, 2], "PMM", 0, "Announcement published; in-app and site banner on; email sent"),
	I("launch", "publish-docs", [1, 2, 3], "PM", 0, "Changelog published; KB live; support pack posted to support"),
	I("launch", "paid-launch-campaign", [1, 2], "PAID", 0, "Launch campaign live with the launch ad creative, one ad set per audience: Prospects (all, minus engaged audiences and customers), Warm engagers (engaged audiences, minus users), Users (current users), Churned (former users), each excluding users who have adopted the feature. Objective: custom conversion on the first step of feature usage. Announcement video boosted to warm engagers first"),
	I("launch", "war-room", [1, 2], "DRI", 0, "War room watching errors, support volume, social replies and the dashboard"),

	I("amplify", "replies", [1, 2], "SOCIAL", 2, "Every comment on founder and company posts answered for 48 hours"),
	I("amplify", "feedback-prompt", [1, 2], "PM", 3, "In-product feedback prompt (1 question, after second use)"),
	I("amplify", "lifecycle-check", [1, 2], "LIFECYCLE", 7, "Non-adopter sequence running; deliverability and unsubscribes checked"),
	I("amplify", "ticket-review", [1, 2], "SUPPORT", 7, "Weekly ticket review: confusion → docs/UX, bugs → backlog"),
	I("amplify", "video-performance", [1, 2], "DATA", 7, "Video performance read: hook retention, completion, click-through and activations by cut; refresh weak paid cuts"),
	I("amplify", "webinar-held", [1], "PMM", 10, "Webinar held; recording cut into clips"),
	I("amplify", "creator-waves", [1], "SOCIAL", 14, "Creator content in waves; top performers moved into paid"),
	I("amplify", "second-wave", [1, 2], "PMM", 14, "Second wave: a customer story and a “you asked, we answered” post"),
	I("amplify", "retire-banners", [1, 2], "WEB", 21, "Banner expired; in-app announcement retired"),

	I("measure", "t7", [1, 2, 3], "DATA", 7, "T+7 pulse: exposure and first use vs target; biggest drop-off diagnosed"),
	I("measure", "retro", [1, 2], "DRI", 14, "Retro held; checklist changes agreed (Retro tab)"),
	I("measure", "t30", [1, 2], "DATA", 30, "T+30 readout: activation, holdout lift, channels, guardrails, support load"),
	I("measure", "t90", [1], "DATA", 90, "T+90 readout: retention and revenue impact; double down, iterate or sunset"),
];
export const itemById = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// --- Dates (ISO yyyy-mm-dd, computed in UTC so they never shift with the timezone) ---
const D = (iso) => new Date(`${iso}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);
export const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") && !Number.isNaN(D(s).getTime());
export function addDays(s, n) {
	const d = D(s);
	d.setUTCDate(d.getUTCDate() + n);
	return iso(d);
}
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 864e5);
// Due dates before T-0 move back to the Friday when they land on a weekend; after T-0 they move forward to Monday.
export function weekday(s, forward) {
	let d = D(s);
	while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + (forward ? 1 : -1));
	return iso(d);
}
export const tLabel = (n) => (n === 0 ? "T-0" : n < 0 ? `T${n}` : `T+${n}`);
export const fmtDate = (s) => (validDate(s) ? D(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "—");

// --- The launch document ---
const str = (v, max = 20000) => (v == null ? "" : String(v)).slice(0, max);
const bool = (v) => v === true;
const oneOf = (v, opts, d) => (opts.some(([k]) => k === v) ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);
export const newId = () => `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const slugify = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "launch";

export const STAGES = [
	["eligible", "Eligible", "Active user on an eligible plan/platform in the window"],
	["exposed", "Exposed", "Saw any launch touchpoint (in-app, email open, ad impression)"],
	["discovered", "Discovered", "Opened the feature surface"],
	["first_use", "First use", "Completed the core action once"],
	["activated", "Activated", "Core value action within the activation window (the primary metric)"],
	["retained", "Retained use", "Used again in weeks 2–4"],
];
export const DEFAULT_GUARDRAILS = ["Support tickets tagged to the feature per 1k exposed", "Error rate on the feature surface", "Unsubscribe rate on launch emails", "Overall product engagement (cannibalization)"];
const defaultEvents = (slug) => {
	const s = slug.replace(/-/g, "_");
	return [
		["launch_touchpoint_viewed", "Any launch surface rendered", "launch_id, channel, variant"],
		["launch_touchpoint_clicked", "A launch CTA clicked", "launch_id, channel, variant"],
		[`${s}_opened`, "Feature surface opened", "entry_point (in_app_modal, email, kb, nav, …)"],
		[`${s}_core_action`, "Core value action completed (rename it)", "domain-specific"],
		[`${s}_paywall_viewed`, "Ineligible user hit the gate", "plan"],
	].map(([name, trigger, props]) => ({ name, trigger, props, staging: false, prod: false }));
};

export function newLaunch(name = "Untitled launch", t0 = addDays(today(), 35)) {
	return normalize({ id: newId(), name, t0: weekday(t0, true), createdAt: new Date().toISOString() }).launch;
}

// Fill every field with a well-typed value so the studio, Claude and the exports can rely on the shape.
export function normalize(raw) {
	const errors = [];
	if (!raw || typeof raw !== "object") return { launch: null, errors: ["Launch must be a JSON object"] };
	const r = raw;
	if (r.t0 && !validDate(r.t0)) errors.push(`t0 "${r.t0}" isn't a yyyy-mm-dd date`);
	const slug = slugify(r.slug || r.name);
	const b = r.brief ?? {};
	const t = r.tier ?? {};
	const m = r.message ?? {};
	const me = r.measure ?? {};
	const items = {};
	const rawItems = { ...(r.items ?? {}) };
	if (rawItems.video && !rawItems["video-final"]) rawItems["video-final"] = rawItems.video;
	for (const [k, v] of Object.entries(rawItems)) {
		if (!itemById[k] && !arr(r.custom).some((c) => c.id === k)) continue;
		items[k] = { status: oneOf(v?.status, ITEM_STATUS, "todo"), owner: str(v?.owner, 120), due: validDate(v?.due) ? v.due : "", evidence: str(v?.evidence, 2000), note: str(v?.note, 4000) };
		// A default item can be reworded, moved to another phase or role, or removed from this launch.
		if (itemById[k]) {
			if (str(v?.text, 400).trim()) items[k].text = str(v.text, 400).trim();
			if (ROLES.includes(v?.role)) items[k].role = v.role;
			if (PHASES.some((p) => p.id === v?.phase)) items[k].phase = v.phase;
			if (v?.removed === true) items[k].removed = true;
		}
	}
	const assets = {};
	for (const [k, v] of Object.entries(r.assets ?? {})) {
		if (!ASSETS.some((a) => a.id === k)) continue;
		assets[k] = { status: oneOf(v?.status, ASSET_STATUS, "todo"), owner: str(v?.owner, 120), link: str(v?.link, 2000), body: str(v?.body, 60000), updatedBy: str(v?.updatedBy, 40) };
	}
	const scores = {};
	for (const f of RUBRIC) scores[f.id] = Number.isInteger(t.scores?.[f.id]) && t.scores[f.id] >= 0 && t.scores[f.id] <= 3 ? t.scores[f.id] : null;
	const reasons = {};
	for (const f of RUBRIC) reasons[f.id] = str(t.reasons?.[f.id], 400);
	const stages = Object.fromEntries(STAGES.map(([k]) => [k, Object.fromEntries(["baseline", "t7", "t30", "a7", "a30", "a90"].map((c) => [c, str(me.stages?.[k]?.[c], 40)]))]));
	const launch = {
		schema: 1,
		id: str(r.id, 64),
		name: str(r.name, 160) || "Untitled launch",
		slug,
		status: oneOf(r.status, LAUNCH_STATUS, "planning"),
		t0: validDate(r.t0) ? r.t0 : addDays(today(), 35),
		dri: str(r.dri, 120),
		rollout: { full: r.rollout?.full === false ? false : r.rollout?.full === true ? true : null, note: str(r.rollout?.note, 1000) },
		brief: {
			description: str(b.description, 6000),
			persona: str(b.persona, 1000),
			job: str(b.job, 1000),
			alternative: str(b.alternative, 1000),
			evidence: str(b.evidence, 4000),
			plans: str(b.plans, 400),
			platforms: str(b.platforms, 400),
			regions: str(b.regions, 400),
			pricing: str(b.pricing, 1000),
			pricingDecided: bool(b.pricingDecided),
			outcome: str(b.outcome, 400),
			risks: str(b.risks, 4000),
			links: str(b.links, 2000),
		},
		tier: { scores, reasons, override: [1, 2, 3].includes(t.override) ? t.override : null, overrideReason: str(t.overrideReason, 1000) },
		items,
		custom: arr(r.custom).filter((c) => c && c.id && c.text).map((c) => ({ id: str(c.id, 64), phase: PHASES.some((p) => p.id === c.phase) ? c.phase : "build", text: str(c.text, 400), role: ROLES.includes(c.role) ? c.role : "DRI", due: Number.isInteger(c.due) ? c.due : -5 })),
		message: {
			status: m.status === "approved" ? "approved" : "draft",
			approvedAt: str(m.approvedAt, 40),
			featureName: str(m.featureName, 120),
			oneLiner: str(m.oneLiner, 200),
			elevator: str(m.elevator, 800),
			promise: str(m.promise, 400),
			pillars: arr(m.pillars).slice(0, 5).map((p) => ({ claim: str(p?.claim, 400), proof: str(p?.proof, 800), approved: bool(p?.approved) })),
			forWho: str(m.forWho, 600),
			notFor: str(m.notFor, 600),
			before: str(m.before, 600),
			after: str(m.after, 600),
			objections: arr(m.objections).slice(0, 10).map((o) => ({ q: str(o?.q, 400), a: str(o?.a, 1000) })),
			useWords: str(m.useWords, 600),
			avoidWords: str(m.avoidWords, 600),
			limits: str(m.limits, 1500),
			ctas: { prospect: str(m.ctas?.prospect, 200), customer: str(m.ctas?.customer, 200), ineligible: str(m.ctas?.ineligible, 200), churned: str(m.ctas?.churned, 200) },
			quotes: str(m.quotes, 3000),
		},
		assets,
		measure: {
			primary: str(me.primary, 400),
			activation: str(me.activation, 800),
			window: str(me.window, 40) || "14 days",
			eligibleCount: str(me.eligibleCount, 40),
			stages,
			events: (Array.isArray(me.events) ? me.events : defaultEvents(slug)).slice(0, 40).map((e) => ({ name: str(e?.name, 120), trigger: str(e?.trigger, 400), props: str(e?.props, 400), staging: bool(e?.staging), prod: bool(e?.prod) })),
			guardrails: (Array.isArray(me.guardrails) ? me.guardrails : DEFAULT_GUARDRAILS.map((metric) => ({ metric }))).slice(0, 12).map((g) => ({ metric: str(g?.metric, 300), baseline: str(g?.baseline, 40), threshold: str(g?.threshold, 40), actual: str(g?.actual, 40) })),
			holdout: str(me.holdout, 40),
			utm: str(me.utm, 600) || `utm_source={platform}&utm_medium={owned|paid|social|email|inapp|employee|creator}&utm_campaign=launch_${slug.replace(/-/g, "_")}&utm_content={variant}`,
			channels: arr(me.channels).slice(0, 20).map((c) => ({ channel: str(c?.channel, 80), exposed: str(c?.exposed, 20), discovered: str(c?.discovered, 20), activated: str(c?.activated, 20), cost: str(c?.cost, 20) })),
			readouts: Object.fromEntries(["7", "30", "90"].map((k) => [k, { verdict: oneOf(me.readouts?.[k]?.verdict, [["", ""], ["on_track", ""], ["behind", ""], ["ahead", ""]], ""), recommendation: str(me.readouts?.[k]?.recommendation, 40), notes: str(me.readouts?.[k]?.notes, 8000), at: str(me.readouts?.[k]?.at, 40) }])),
		},
		feedback: {
			at: str(r.feedback?.at, 40),
			summary: str(r.feedback?.summary, 4000),
			items: arr(r.feedback?.items).slice(0, 60).map((f) => ({ severity: ["blocker", "high", "medium", "info"].includes(f?.severity) ? f.severity : "medium", area: str(f?.area, 60), text: str(f?.text, 1200), fix: str(f?.fix, 1200), owner: str(f?.owner, 60), item: str(f?.item, 64), resolved: bool(f?.resolved) })),
		},
		video: normalizeVideo(r.video),
		people: arr(r.people).filter((x) => x && x.id && (x.name || x.email)).slice(0, 60).map((x) => ({ id: str(x.id, 64), name: str(x.name, 120), email: str(x.email, 200).trim().toLowerCase(), title: str(x.title, 120), capacity: str(x.capacity, 40), linearUserId: str(x.linearUserId, 64) })),
		staffing: Object.fromEntries(ROLES.map((k) => [k, arr(r.people).some((x) => x?.id && x.id === r.staffing?.[k]) ? r.staffing[k] : ""]).filter(([, v]) => v)),
		sync: { linear: normalizeLinear(r.sync?.linear) },
		// The portal project a hosted launch belongs to (the GrowthCast client portal). Empty for local launches.
		project: { id: str(r.project?.id, 128), name: str(r.project?.name, 160) },
		retro: { outcome: str(r.retro?.outcome, 2000), worked: str(r.retro?.worked, 6000), didnt: str(r.retro?.didnt, 6000), gaps: str(r.retro?.gaps, 6000), benchmarks: str(r.retro?.benchmarks, 4000) },
		createdAt: str(r.createdAt, 40),
		updatedAt: str(r.updatedAt, 40),
	};
	return { launch, errors };
}

function normalizeVideo(x) {
	const v = x ?? {};
	const approvers = Object.fromEntries(VIDEO_APPROVERS.map(([role]) => [role, { status: ["pending", "approved", "changes"].includes(v.approvers?.[role]?.status) ? v.approvers[role].status : "pending", note: str(v.approvers?.[role]?.note, 1000), at: str(v.approvers?.[role]?.at, 40) }]));
	return {
		format: VIDEO_FORMATS.some(([k]) => k === v.format) ? v.format : "",
		length: str(v.length, 40),
		hook: str(v.hook, 400),
		concept: str(v.concept, 3000),
		talent: str(v.talent, 400),
		music: str(v.music, 400),
		tools: str(v.tools, 400),
		rights: { music: bool(v.rights?.music), talent: bool(v.rights?.talent), paid: bool(v.rights?.paid) },
		approvers,
		rounds: arr(v.rounds).slice(0, 12).map((x) => ({ at: str(x?.at, 40), link: str(x?.link, 1000), reviewer: str(x?.reviewer, 120), decision: ["changes", "approved", ""].includes(x?.decision) ? x.decision : "", notes: str(x?.notes, 6000) })),
		master: str(v.master, 1000),
		archive: str(v.archive, 1000),
		deliverables: Object.fromEntries(VIDEO_DELIVERABLES.map((d) => [d.id, { status: oneOf(v.deliverables?.[d.id]?.status, DELIVERABLE_STATUS, "todo"), link: str(v.deliverables?.[d.id]?.link, 1000), captions: bool(v.deliverables?.[d.id]?.captions) }])),
		handoff: Object.fromEntries(VIDEO_HANDOFFS.map((h) => [h.id, { sent: bool(v.handoff?.[h.id]?.sent), link: str(v.handoff?.[h.id]?.link, 1000) }])),
	};
}

function normalizeLinear(x) {
	const o = x ?? {};
	const issues = {};
	for (const [k, v] of Object.entries(o.issues ?? {})) if (v?.id) issues[str(k, 64)] = { id: str(v.id, 64), identifier: str(v.identifier, 40), url: str(v.url, 400), state: str(v.state, 40), syncedAt: str(v.syncedAt, 40) };
	const milestones = {};
	for (const [k, v] of Object.entries(o.milestones ?? {})) if (PHASES.some((p) => p.id === k) && v) milestones[k] = str(v, 64);
	return { teamId: str(o.teamId, 64), teamName: str(o.teamName, 120), projectId: str(o.projectId, 64), projectUrl: str(o.projectUrl, 400), syncedAt: str(o.syncedAt, 40), pulledAt: str(o.pulledAt, 40), milestones, issues };
}

// --- Derived values ---
export function tierScore(l) {
	const vals = RUBRIC.map((f) => l.tier.scores[f.id]);
	return { total: vals.reduce((a, v) => a + (v ?? 0), 0), complete: vals.every((v) => v != null) };
}
export function tierOf(l) {
	if (l.tier.override) return l.tier.override;
	const { total, complete } = tierScore(l);
	return complete ? tierFromScore(total) : null;
}
// Until the launch is scored, show the T1 superset so nothing is hidden.
export const effectiveTier = (l) => tierOf(l) ?? 1;

// Who's accountable for an item: an explicit owner that names someone on the roster, else whoever is staffed on its role.
export const personById = (l, id) => l.people.find((p) => p.id === id) ?? null;
export function ownerOf(l, role, owner = "") {
	const o = owner.trim().toLowerCase();
	if (o) return l.people.find((p) => p.name.toLowerCase() === o || p.email === o) ?? null;
	return personById(l, l.staffing[role]);
}

export function itemsFor(l) {
	const tier = effectiveTier(l);
	const custom = l.custom.map((c) => ({ ...c, tiers: [1, 2, 3], custom: true }));
	return [...ITEMS, ...custom]
		// Gates can't be removed: waive them instead, with a reason.
		.filter((i) => i.tiers.includes(tier) && !(l.items[i.id]?.removed && !(i.gate === true || (i.gate === 1 && tier === 1))))
		.map((i) => {
			const st = l.items[i.id] ?? { status: "todo", owner: "", due: "", evidence: "", note: "" };
			const planned = weekday(addDays(l.t0, i.due), i.due > 0);
			const due = st.due || planned;
			const open = !["done", "waived", "na"].includes(st.status);
			const gate = i.gate === true || (i.gate === 1 && tier === 1);
			const person = ownerOf(l, st.role || i.role, st.owner);
			const { removed, ...edits } = st;
			return { ...i, ...edits, def: i, edited: !!(st.text || st.role || st.phase), gate, planned, due, open, overdue: open && due < today(), person, ownerName: person?.name || st.owner || "", issue: l.sync.linear.issues[i.id] ?? null };
		})
		.sort((a, b) => PHASES.findIndex((p) => p.id === a.phase) - PHASES.findIndex((p) => p.id === b.phase) || a.due.localeCompare(b.due));
}
export const assetsFor = (l) => ASSETS.filter((a) => a.tiers.includes(effectiveTier(l))).map((a) => ({ ...a, ...(l.assets[a.id] ?? { status: "todo", owner: "", link: "", body: "" }) }));

export function progress(l) {
	const items = itemsFor(l);
	const counted = items.filter((i) => i.status !== "na");
	const done = counted.filter((i) => ["done", "waived"].includes(i.status)).length;
	return { total: counted.length, done, pct: counted.length ? Math.round((100 * done) / counted.length) : 0, overdue: items.filter((i) => i.overdue).length, items };
}

const VANITY = /\b(view|views|impression|impressions|click|clicks|ctr|awareness|reach|open rate|opens|likes|followers|engagement rate|traffic|visits)\b/i;
// The studio's own lint: what the kickoff and readiness skills would flag. severity: error | warn | info.
export function checks(l, others = []) {
	const out = [];
	const add = (severity, area, text, item) => out.push({ severity, area, text, item });
	const tier = tierOf(l);
	const days = daysBetween(today(), l.t0);
	if (!tier) add("warn", "Brief", "Score the tier. Until then the checklist shows every T1 item.");
	if (!l.dri.trim()) add("error", "Brief", "No launch DRI. One person has to own the launch.");
	else if (/founder|ceo/i.test(l.dri)) add("warn", "Brief", "The DRI looks like the founder. Founders approve; someone else should run the launch.");
	if (l.rollout.full === false) add("error", "Brief", "Rollout won't reach 100% of the announced audience by T-0. Narrow the announcement or move the date.", "rollout-plan");
	if (l.rollout.full == null) add("warn", "Brief", "Confirm whether 100% of the announced audience has access at T-0.", "rollout-plan");
	if (!l.brief.pricingDecided && days < 14 && days > -1) add("error", "Brief", `Pricing / packaging is undecided ${days} days out.`, "packaging");
	if (tier === 1 && !l.brief.evidence.trim()) add("error", "Brief", "A T1 with no customer evidence. Find proof before committing founder and paid attention.", "evidence");
	if (!l.measure.primary.trim()) add("warn", "Measure", "No primary success metric yet.", "metric");
	else if (VANITY.test(l.measure.primary) && !/activat/i.test(l.measure.primary)) add("error", "Measure", "The primary metric reads like a vanity metric. Measure activation, not exposure.", "metric");
	if (!l.measure.activation.trim()) add("warn", "Measure", "Define activation: the smallest repeatable action that delivers the value.", "metric");
	if (l.measure.events.length && !l.measure.events.some((e) => /entry_point/.test(e.props))) add("warn", "Measure", "No event carries entry_point, so adoption can't be attributed to channels.", "events");
	if (tier === 1 && !l.measure.holdout.trim()) add("warn", "Measure", "T1 with no holdout. Lifecycle and paid lift won't be measurable.", "holdout");
	if (l.message.status !== "approved" && days <= 14) add(days <= 7 ? "error" : "warn", "Messaging", "Message house isn't approved yet.", "message-house");
	l.message.pillars.forEach((p, i) => p.claim && !p.proof.trim() && add("warn", "Messaging", `Pillar ${i + 1} has no proof. Add a number, quote or demo moment, or cut it.`, "message-house"));
	if (l.message.featureName && /[A-Z]{2,}[a-z]*\d|v\d|_|^[a-z]+[A-Z]/.test(l.message.featureName)) add("warn", "Messaging", "The feature name looks like internal jargon.", "name");
	for (const o of others) {
		if (o.id === l.id || !o.t0 || o.status === "closed") continue;
		const ot = o.tier ?? 3;
		if (ot <= 2 && (tier ?? 1) <= 2 && Math.abs(daysBetween(o.t0, l.t0)) <= 7) add("warn", "Calendar", `“${o.name}” (T${ot}) launches ${fmtDate(o.t0)}, within 7 days.`, "calendar");
	}
	if ((tier ?? 1) <= 2) {
		const v = l.video;
		const its = Object.fromEntries(itemsFor(l).map((i) => [i.id, i]));
		if (!v.format && days <= 21) add("warn", "Video", "No video format chosen. The brief is due now.", "video-brief");
		if (v.rounds.length >= 3 && v.rounds.at(-1)?.decision !== "approved") add("warn", "Video", `${v.rounds.length} review rounds and still no approval. Lock the script or cut scope.`, "video-review");
		if (its["ui-freeze"]?.open && !its["video-production"]?.open) add("warn", "Video", "Production is marked done before the UI froze. Recheck the capture against the final UI.", "ui-freeze");
		if (its["ui-freeze"]?.overdue && its["video-production"]?.open) add("error", "Video", "UI isn't frozen and production is due. The video will show unfinished UI or slip.", "ui-freeze");
		const pending = VIDEO_APPROVERS.filter(([r]) => v.approvers[r].status !== "approved").map(([r]) => r);
		if (its["video-review"] && today() >= its["video-review"].due && pending.length) add("warn", "Video", `Video sign-off still pending from ${pending.join(", ")}.`, "video-review");
		if ((tier === 1 || tier === 2) && v.deliverables.ads.status !== "todo" && !v.rights.paid) add("error", "Video", "Paid cuts are in progress but music and talent aren't cleared for paid use.", "video-final");
		if (days <= 5 && days >= 0 && !["ready", "live"].includes(v.deliverables.hero.status)) add("error", "Video", `Hero cut isn't ready ${days} days before launch.`, "video-final");
	}
	const w = workload(l);
	const unstaffed = w.roles.filter((r) => !r.person && r.open);
	if (l.people.length && unstaffed.length) add("warn", "Staffing", `Nobody staffed for ${unstaffed.map((r) => `${r.role} (${r.open})`).join(", ")}.`);
	else if (!l.people.length && (tier ?? 1) <= 2) add("info", "Staffing", "Add the team on the Staffing tab so every item has a named owner.");
	for (const p of w.people) {
		if (w.openTotal >= 10 && p.open / w.openTotal > 0.4 && p.roles.length > 1) add("warn", "Staffing", `${p.name} owns ${p.open} of ${w.openTotal} open items (${p.roles.join(", ")}). Spread the load.`);
		if (p.peakWeek && p.peakWeek.count >= 8) add("warn", "Staffing", `${p.name} has ${p.peakWeek.count} items due the week of ${fmtDate(p.peakWeek.week)}.`);
	}
	if (l.sync.linear.projectId && l.people.some((p) => w.people.find((x) => x.id === p.id)?.open && !p.email)) add("info", "Staffing", "Some owners have no email, so their Linear issues will be unassigned.");
	const p = progress(l);
	if (p.overdue) add("warn", "Checklist", `${p.overdue} item${p.overdue > 1 ? "s are" : " is"} overdue.`);
	return out;
}

// Hard gates: any failing one means NO-GO.
export function readiness(l) {
	const items = itemsFor(l);
	const by = Object.fromEntries(items.map((i) => [i.id, i]));
	const ok = (id) => !by[id] || ["done", "waived"].includes(by[id].status);
	const gates = [
		{ id: "rollout", label: "Feature at the agreed rollout for the announced audience", ok: ok("rollout-ready") && l.rollout.full !== false, item: "rollout-ready" },
		{ id: "events", label: "Primary-metric events verified in production", ok: ok("events") && l.measure.events.filter((e) => e.name).every((e) => e.prod), item: "events" },
		{ id: "docs", label: "KB article and support pack ready and shared with support", ok: ok("kb") && ok("support-pack"), item: "kb" },
		{ id: "message", label: "Message house approved", ok: l.message.status === "approved", item: "message-house" },
	];
	if (effectiveTier(l) <= 2) gates.push({ id: "video", label: "Launch video approved, hero cut ready", ok: ok("video-final") && ["ready", "live"].includes(l.video.deliverables.hero.status), item: "video-final" });
	if (effectiveTier(l) === 1) gates.push({ id: "rollback", label: "Rollback comms drafted", ok: ok("rollback-comms"), item: "rollback-comms" });
	const blockers = items.filter((i) => ["decide", "narrative", "build", "gonogo"].includes(i.phase) && i.open && i.id !== "readiness");
	const waived = items.filter((i) => i.status === "waived");
	const redTeam = l.feedback.items.filter((f) => f.severity === "blocker" && !f.resolved);
	const verdict = gates.some((g) => !g.ok) || redTeam.length || blockers.length ? "no-go" : waived.length ? "go-waivers" : "go";
	return { gates, blockers, waived, redTeam, verdict };
}
// Per-person load across this tier's checklist and assets, plus roles the plan needs that nobody holds.
export function workload(l) {
	const items = itemsFor(l);
	const assets = assetsFor(l);
	const week = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
	const people = l.people.map((p) => {
		const mine = items.filter((i) => i.person?.id === p.id);
		const open = mine.filter((i) => i.open);
		const weeks = {};
		for (const i of open) weeks[week(i.due)] = (weeks[week(i.due)] ?? 0) + 1;
		const peak = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0] ?? null;
		return {
			...p,
			roles: ROLES.filter((r) => l.staffing[r] === p.id),
			items: mine,
			open: open.length,
			done: mine.length - open.length,
			overdue: open.filter((i) => i.overdue).length,
			assets: assets.filter((a) => (a.owner ? a.owner.toLowerCase() === p.name.toLowerCase() : l.staffing[a.role] === p.id)).length,
			peakWeek: peak ? { week: peak[0], count: peak[1] } : null,
		};
	});
	const needed = [...new Set(items.map((i) => i.role))];
	const roles = needed.map((r) => ({ role: r, person: personById(l, l.staffing[r]), items: items.filter((i) => i.role === r).length, open: items.filter((i) => i.role === r && i.open).length }));
	const unassigned = items.filter((i) => !i.person);
	return { people, roles, unassigned, openTotal: items.filter((i) => i.open).length };
}

export const VERDICT = { go: "GO", "go-waivers": "GO WITH WAIVERS", "no-go": "NO-GO" };

// A short listing row, used by the portfolio and collision checks.
export const summary = (l) => {
	const p = progress(l);
	return { id: l.id, name: l.name, status: l.status, t0: l.t0, tier: tierOf(l), dri: l.dri, pct: p.pct, overdue: p.overdue, updatedAt: l.updatedAt, project: l.project };
};
