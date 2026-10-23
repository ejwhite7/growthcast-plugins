// The Webinar Strategy model: session schema, normalization, validation, schedule/timezone maths, readiness,
// progress, library filters and import parsing. Pure functions with no DOM or Node imports, so the browser studio,
// the exports and node:test all share one source of truth. Planning only: nothing here publishes or sends anything.

export const SCHEMA_VERSION = 1;
export const STORE_VERSION = 1;
export const STORAGE_KEY = "growthcast.webinar-strategy.v1";
export const LIMITS = { short: 200, text: 2000, long: 6000, url: 2000, importBytes: 2_000_000, sessions: 200, tasks: 120, reminders: 30, list: 30 };

export const VISIBILITY = [["draft", "Draft"], ["unlisted", "Unlisted"], ["public", "Public"]];
export const FORMATS = [
	["", "Choose a format"], ["feature-release", "Feature release"], ["power-user", "Power user / feature support"], ["interview", "Interview (expert, vendor, customer)"],
	["panel", "Panel discussion"], ["freeform", "Freeform discussion"], ["workshop", "Workshop / how-to"], ["onboarding", "Onboarding / Q&A"],
];
export const TASK_STATUS = [["todo", "To do"], ["doing", "In progress"], ["blocked", "Blocked"], ["done", "Done"], ["na", "N/A"]];
export const PLANNING_STATES = [["idea", "Idea"], ["drafting", "Drafting"], ["in-review", "In review"], ["approved", "Approved (to publish elsewhere)"], ["delivered", "Delivered"], ["archived", "Archived"]];
export const TIER_IDS = ["crawl", "walk", "run"];
export const FIELD_MODES = [["off", "Not asked"], ["optional", "Optional"], ["required", "Required"]];
export const RSVP_FIELDS = [
	{ id: "name", label: "Full name", modes: ["required"], locked: true },
	{ id: "email", label: "Email address", modes: ["required"], locked: true },
	{ id: "phone", label: "Phone number", modes: ["off", "optional", "required"] },
	{ id: "smsConsent", label: "Marketing SMS opt-in (separate checkbox, never pre-checked)", modes: ["off", "optional"] },
	{ id: "company", label: "Company name", modes: ["off", "optional", "required"] },
	{ id: "companySize", label: "Company size", modes: ["off", "optional", "required"] },
	{ id: "jobTitle", label: "Job title", modes: ["off", "optional", "required"] },
];
const DEFAULT_FIELD_MODES = { name: "required", email: "required", phone: "off", smsConsent: "off", company: "optional", companySize: "off", jobTitle: "optional" };

export const STAGES = [
	{ id: "create", label: "Create page", deliverables: ["Event brief complete", "AIDA copy", "Hero image + alt text", "RSVP form spec"] },
	{ id: "review", label: "Review & publish", deliverables: ["Reviewed copy and links", "Approval recorded (publishing happens in your CMS, not here)"] },
	{ id: "promote", label: "Promote & RSVP", deliverables: ["Promotion posts and invites", "Confirmation + calendar + CRM handoff specified", "Reminder sequence scheduled in your email tool"] },
	{ id: "execute", label: "Execute & record", deliverables: ["Run of show", "Rehearsal done", "Session delivered and recorded"] },
	{ id: "upload", label: "Upload recording", deliverables: ["Edited, captioned recording", "Hosted at a stable URL"] },
	{ id: "attach", label: "Attach recording", deliverables: ["Recording URL on the event page", "Recorded page checked for private-link leaks"] },
	{ id: "repurpose", label: "Repurpose & readout", deliverables: ["Attendee and no-show follow-ups", "Clips, quotes, stills", "Readout of attendance, questions and pipeline"] },
];

// Repeating cadence is a fixed choice. Older free-text values are kept in `recurrenceLegacy`, never reinterpreted.
export const RECURRENCE_CADENCES = [["", "Choose a cadence"], ["weekly", "Weekly"], ["biweekly", "Biweekly (every two weeks)"], ["monthly", "Monthly"], ["quarterly", "Quarterly"]];
export const cadenceLabel = (v) => RECURRENCE_CADENCES.find(([k]) => k && k === v)?.[1] ?? "";

// Default task catalogue (template v3). Each task has exactly one responsible `role` (pre-filled) and `deps`, the ids of
// tasks that should be done first. Named owners stay optional and empty by default.
export const TASK_TEMPLATE_VERSION = 4;
export const DEFAULT_TASKS = [
	["brief", "create", "Complete the event brief (slug, titles, schedule, hosts, platform)", "Marketing lead", []],
	["aida", "create", "Write AIDA copy: attention, interest, decision, action", "Product marketer", ["brief"]],
	["hero", "create", "Prepare the hero image and its alt text", "Designer", ["brief"]],
	["rsvp-spec", "create", "Choose RSVP fields and set the form version", "Marketing ops", ["brief"]],
	["thanks", "create", "Write the thank-you message or choose a redirect page", "Content writer", ["rsvp-spec"]],
	["review-copy", "review", "Review copy, links and accessibility of the RSVP page", "Marketing lead", ["aida", "hero", "thanks"]],
	["tz-check", "review", "Confirm date, time and IANA time zone with every host", "Event owner", ["brief"]],
	["consent", "review", "Review consent wording, especially the SMS opt-in", "Privacy reviewer", ["rsvp-spec"]],
	["approve", "review", "Record approval to publish (done in your CMS; this app cannot publish)", "Event owner", ["review-copy", "tz-check", "consent"]],
	["promo-social-posts", "promote", "Schedule company social posts announcing the session", "Social media manager", ["approve"]],
	["promo-founder", "promote", "Write and schedule the founder-led announcement post", "Founder", ["approve"]],
	["promo-email-list", "promote", "Send the announcement to the email list", "Email marketer", ["approve"]],
	["promo-lifecycle", "promote", "Add the invitation to lifecycle and nurture flows", "Lifecycle marketer", ["approve"]],
	["promo-paid", "promote", "Plan paid promotion of the RSVP page (optional; mark N/A if not used)", "Paid media manager", ["approve"]],
	["promo-partner-copromo", "promote", "Ask partners to co-promote (agencies, vendors, thought leaders)", "Partnerships manager", ["approve"]],
	["create-host-session", "create", "DRI / Marketing ops: create the event or recurring series session in the livestream hosting platform; verify and save its final attendance URL as the brief's join URL (not the public RSVP URL)", "Marketing ops", ["brief"]],
	["promo-inapp-rsvp", "promote", "Schedule pre-event in-app notifications advertising the event: audience, timing, public RSVP CTA and tracking", "Product manager", ["approve"]],
	["promo-marketing-site", "promote", "Advertise the event on the marketing site: publish homepage banners, announcement bars and event listings as appropriate; link to the public RSVP page, verify mobile/accessibility and tracking, and schedule removal or recording replacement after the event", "Marketing ops", ["approve"]],
	["promo-customers", "promote", "Invite existing customers through their account contacts", "Customer success manager", ["approve"]],
	["confirm-email", "promote", "Draft the confirmation autoresponder with ICS prompt", "Lifecycle marketer", ["rsvp-spec"]],
	["calendar", "promote", "Specify calendar links (ICS download and web calendar) for the thank-you state", "Marketing ops", ["rsvp-spec"]],
	["crm-handoff", "promote", "Map the registration webhook to CRM and analytics (idempotency key, form version)", "Marketing ops", ["rsvp-spec"]],
	["reminders", "promote", "Set up the reminder sequence in your email tool", "Lifecycle marketer", ["confirm-email", "tz-check"]],
	...[['x', 'X'], ['linkedin', 'LinkedIn'], ['meta', 'Meta (Facebook/Instagram)'], ['youtube', 'YouTube']].flatMap(([id, platform]) => [
		[`social-live-${id}-plan`, "promote", `Confirm ${platform} event/live-stream eligibility, account permissions and supported delivery method; mark N/A if not used`, "Social media manager", ["approve"]],
		[`social-live-${id}-event`, "promote", `Create or schedule the approved ${platform} event/live listing where available; verify time zone, imagery and RSVP link (N/A if unsupported)`, "Social media manager", [`social-live-${id}-plan`]],
		[`social-live-${id}-connect`, "execute", `Connect the approved ${platform} destination to the streaming platform where supported; keep stream keys out of this plan`, "Producer", [`social-live-${id}-plan`]],
		[`social-live-${id}-test`, "execute", `Test ${platform} stream routing, audio/video, visibility and event link before going live; mark N/A if not used`, "Producer", [`social-live-${id}-connect`, `social-live-${id}-event`, "rehearse"]],
	]),
	["run-of-show", "execute", "Write the run of show (intro, content, Q&A, call to action)", "Host", ["aida"]],
	["rehearse", "execute", "Rehearse with hosts and test audio, video and screen share", "Host", ["run-of-show"]],
	["engagement", "execute", "Prepare waiting room, polls, quizzes, files and question spotlighting as needed", "Producer", ["run-of-show"]],
	["go-live", "execute", "Deliver the session and confirm the recording is running", "Host", ["rehearse", "engagement", "social-live-x-test", "social-live-linkedin-test", "social-live-meta-test", "social-live-youtube-test"]],
	["export-rec", "upload", "Export the recording and transcript", "Producer", ["go-live"]],
	["rec-edit", "upload", "Edit the recording", "Video editor", ["export-rec"]],
	["rec-captions", "upload", "Add captions and check them against the transcript", "Video editor", ["rec-edit"]],
	["rec-thumbnail", "upload", "Design the recording thumbnail", "Designer", ["export-rec"]],
	["host-rec", "upload", "Upload to your video host or YouTube and note the URL", "Content manager", ["rec-edit", "rec-captions", "rec-thumbnail"]],
	["attach-url", "attach", "Add the hosted recording URL in the Event brief", "Marketing ops", ["host-rec"]],
	["leak-check", "attach", "Check the recorded page shows no join or waiting-room links", "Marketing ops", ["attach-url"]],
	["seo", "attach", "Add title, description and schema for the recorded page (SEO and AEO)", "SEO specialist", ["attach-url"]],
	["fu-attendees", "repurpose", "Send the attendee follow-up with the recording", "Lifecycle marketer", ["host-rec"]],
	["fu-noshows", "repurpose", "Send the no-show follow-up with the recording", "Lifecycle marketer", ["host-rec"]],
	["clips-cut", "repurpose", "Cut short video clips for social, ads and YouTube", "Video editor", ["rec-edit"]],
	["quotes-stills", "repurpose", "Pull quotes and still images", "Designer", ["rec-edit"]],
	["post-social", "repurpose", "Post the recap and clips on company social", "Social media manager", ["clips-cut", "quotes-stills"]],
	["post-founder", "repurpose", "Write the founder-led recap post", "Founder", ["clips-cut"]],
	["post-partners", "repurpose", "Send partners the recording and clips to share", "Partnerships manager", ["host-rec", "clips-cut"]],
	["post-paid", "repurpose", "Promote the recording or clips with paid ads (optional; mark N/A if not used)", "Paid media manager", ["clips-cut"]],
	["post-lifecycle", "repurpose", "Link the recording from lifecycle emails", "Lifecycle marketer", ["attach-url"]],
	["post-cs", "repurpose", "Give customer success the recording for customer conversations", "Customer success manager", ["host-rec"]],
	["post-help", "repurpose", "Link the recording from the help center (where relevant)", "Support lead", ["attach-url"]],
	["post-inapp", "repurpose", "Add an in-app prompt linking the recording (where relevant)", "Product manager", ["attach-url"]],
	["readout", "repurpose", "Write the readout: attendance, no-shows, top questions, pipeline", "Marketing lead", ["fu-attendees", "fu-noshows"]],
].map(([id, stage, title, role, deps]) => ({ id, stage, title, role, deps }));
// Template v1 tasks that bundled several channels or roles and are split in v2.
export const SUPERSEDED_TASKS = {
	"promo-social": ["promo-social-posts", "promo-founder"], "promo-partners": ["promo-partner-copromo", "promo-customers"], "promo-ads": ["promo-paid"],
	"promo-email": ["promo-email-list", "promo-lifecycle"], "edit-rec": ["rec-edit", "rec-captions", "rec-thumbnail"],
	"follow-up": ["fu-attendees", "fu-noshows"], clips: ["clips-cut", "quotes-stills", "post-social", "post-founder", "post-partners", "post-paid"],
};
export const TASK_ROLES = [...new Set(DEFAULT_TASKS.map((t) => t.role))].sort();
export const LIMIT_DEPS = 30;
const blankTask = (t) => ({ id: t.id, stage: t.stage, title: t.title, hint: "", role: t.role, deps: [...t.deps], status: "todo", owner: "", due: "", evidence: "", custom: false });

export const DEFAULT_REMINDERS = [
	{ id: "confirm", kind: "confirmation", label: "RSVP confirmation + calendar invite (ICS)", audience: "registrants", offsetMinutes: null, enabled: true },
	{ id: "r-7d", kind: "reminder", label: "One-week reminder", audience: "registrants", offsetMinutes: -10080, enabled: false },
	{ id: "r-1d", kind: "reminder", label: "One-day reminder", audience: "registrants", offsetMinutes: -1440, enabled: true },
	{ id: "r-1h", kind: "reminder", label: "One-hour reminder (add SMS only for opted-in registrants)", audience: "registrants", offsetMinutes: -60, enabled: true },
	{ id: "f-attended", kind: "follow-up", label: "Thank-you + recording for attendees", audience: "attended", offsetMinutes: 1440, enabled: true },
	{ id: "f-noshow", kind: "follow-up", label: "Sorry we missed you + recording for no-shows", audience: "no-show", offsetMinutes: 1440, enabled: true },
];
export const MAX_OFFSET_MIN = 525_600;
export const REMINDER_AUDIENCES =[["registrants", "All registrants"], ["attended", "Attended"], ["no-show", "No-shows"]];

export const DEFAULT_REUSE = [
	["social-pre", "before", "Social posts and founder-led post announcing the session"],
	["ads-pre", "before", "Paid promotion of the RSVP page"],
	["seo-rsvp", "before", "RSVP page indexed for SEO/AEO"],
	["partners", "before", "Partner and thought-leader invitations"],
	["questions", "during", "Capture live questions for support content and FAQ"],
	["poll-data", "during", "Capture poll and quiz results for product insight"],
	["quotes", "during", "Flag quotable moments with timestamps"],
	["recording-page", "after", "Recording page for SEO/AEO"],
	["youtube", "after", "Post the full recording on YouTube"],
	["lead-magnet", "after", "Gate the recording as a lead magnet"],
	["clips", "after", "Clips, quotes and stills for social and ads"],
	["lifecycle", "after", "Lifecycle and customer-success emails that link the recording"],
	["in-app", "after", "In-app prompt or help-center link"],
].map(([id, phase, label]) => ({ id, phase, label, done: false, note: "" }));

// ---------- identifiers, strings, urls ----------
export const validId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id);
export function newId(prefix = "ws") {
	const c = globalThis.crypto;
	const part = c?.randomUUID ? c.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14).padEnd(12, "0");
	return `${prefix}_${part}`;
}
export const slugify = (s) =>
	String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
export const validSlug = (s) => typeof s === "string" && s.length >= 3 && s.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);

// Only https (or http for loopback hosts) URLs without credentials or whitespace. Returns the normalized href or null.
export function safeUrl(v, max = LIMITS.url) {
	if (typeof v !== "string") return null;
	const s = v.trim();
	if (!s || s.length > max || /[\u0000- \u007f]/.test(s)) return null;
	let u;
	try {
		u = new URL(s);
	} catch {
		return null;
	}
	if (u.username || u.password || !u.hostname) return null;
	const loop = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
	if (u.protocol === "https:" || (u.protocol === "http:" && loop)) return u.href;
	return null;
}

// ---------- dates and time zones (never uses the machine's zone) ----------
export function validDate(s) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
	if (!m) return false;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
export const validTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s ?? "");
export function validTimeZone(tz) {
	if (typeof tz !== "string" || !tz || tz.length > 64) return false;
	if (tz === "UTC") return true;
	if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(tz)) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}
// Canonical spelling of a valid zone (Intl accepts "america/new_york"; stored and exported as "America/New_York").
export function canonicalTimeZone(tz) {
	if (!validTimeZone(tz)) return tz;
	try {
		return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone || tz;
	} catch {
		return tz;
	}
}
function offsetMs(ms, tz) {
	const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
	const p = {};
	for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
	return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// Wall-clock date/time in an IANA zone -> UTC epoch ms, or null when invalid or the wall time doesn't exist (DST gap).
export function zonedToUtcMs(date, time, tz) {
	if (!validDate(date) || !validTime(time) || !validTimeZone(tz)) return null;
	const [y, mo, d] = date.split("-").map(Number);
	const [h, mi] = time.split(":").map(Number);
	const guess = Date.UTC(y, mo - 1, d, h, mi);
	let t = guess - offsetMs(guess, tz);
	t = guess - offsetMs(t, tz);
	return t + offsetMs(t, tz) === guess ? t : null;
}
export function resolveSchedule(event) {
	const { date, time, timeZone } = event ?? {};
	if (!date && !time) return { state: "unscheduled", startUtc: null, ms: null };
	if (!date || !time) return { state: "invalid", error: "Enter both a date and a time", startUtc: null, ms: null };
	if (!validDate(date)) return { state: "invalid", error: "Date must be a real calendar date (YYYY-MM-DD)", startUtc: null, ms: null };
	if (!validTime(time)) return { state: "invalid", error: "Time must be HH:MM, 24-hour", startUtc: null, ms: null };
	if (!timeZone) return { state: "invalid", error: "Choose an IANA time zone, for example America/New_York", startUtc: null, ms: null };
	if (!validTimeZone(timeZone)) return { state: "invalid", error: `"${timeZone}" is not a recognised IANA time zone`, startUtc: null, ms: null };
	const ms = zonedToUtcMs(date, time, timeZone);
	if (ms == null) return { state: "invalid", error: "That wall-clock time does not exist in this zone (daylight-saving gap)", startUtc: null, ms: null };
	return { state: "ok", startUtc: new Date(ms).toISOString(), ms };
}
export function formatInZone(ms, tz) {
	if (ms == null || !validTimeZone(tz)) return "";
	return new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ms));
}
export function relativeTo(ms, nowMs) {
	const diff = ms - nowMs;
	const abs = Math.abs(diff);
	const units = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
	let text = "moments";
	for (const [name, size] of units) {
		if (abs >= size) {
			const n = Math.floor(abs / size);
			text = `${n} ${name}${n === 1 ? "" : "s"}`;
			break;
		}
	}
	return diff >= 0 ? `in ${text}` : `${text} ago`;
}
export const todayUtc = (nowMs) => new Date(nowMs).toISOString().slice(0, 10);

// ---------- sessions ----------
const str = (v, max = LIMITS.short) => (typeof v === "string" ? v.slice(0, max) : "");
const strList = (v, max = 80) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, LIMITS.list).map((x) => x.slice(0, max)) : []);
const isoOrNow = (v, nowIso) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : nowIso);

export function newSession(internalName = "", nowMs = Date.now()) {
	const now = new Date(nowMs).toISOString();
	const name = str(internalName).trim();
	return {
		id: newId("ws"), schemaVersion: SCHEMA_VERSION, createdAt: now, updatedAt: now, planningState: "idea",
		event: {
			slug: slugify(name), internalName: name, publicTitle: "", format: "", topics: [], heroUrl: "", heroAlt: "",
			aida: { attention: "", interest: "", decision: "", action: "" }, shortDescription: "", outcomes: [],
			date: "", time: "", timeZone: "", durationMin: 45, hosts: [], platform: "", venue: "", joinUrl: "", waitingUrl: "",
			recurring: false, recurrence: "", recurrenceLegacy: "", redirectUrl: "", thankYou: "", visibility: "draft", recordingUrl: "",
		},
		rsvp: { formVersion: "v1", fields: { ...DEFAULT_FIELD_MODES }, smsConsentText: "" },
		tier: "", capabilities: {}, taskTemplate: TASK_TEMPLATE_VERSION,
		tasks: DEFAULT_TASKS.map(blankTask),
		reminders: DEFAULT_REMINDERS.map((r) => ({ ...r })),
		reuse: DEFAULT_REUSE.map((r) => ({ ...r })),
		notes: "",
	};
}

const enumOr = (v, list, d, warn, label) => {
	if (list.some(([k]) => k === v)) return v;
	if (v !== undefined && v !== "" && warn) warn.push(`${label}: "${String(v).slice(0, 40)}" is not recognised; using "${d}"`);
	return d;
};

// Coerces unknown input into a well-formed session. Never throws. Returns { session, errors, warnings }.
// `errors` are fatal (session unusable); `warnings` describe values that were coerced.
export function normalizeSession(raw, nowMs = Date.now()) {
	const errors = [];
	const warnings = [];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { session: null, errors: ["Session is not an object"], warnings };
	if (!validId(raw.id)) return { session: null, errors: [`Session id "${String(raw.id).slice(0, 20)}" is invalid (3-64 letters, digits, _ or -)`], warnings };
	if (raw.schemaVersion != null && raw.schemaVersion !== SCHEMA_VERSION) return { session: null, errors: [`Session ${raw.id} has schemaVersion ${raw.schemaVersion}; this app reads ${SCHEMA_VERSION}`], warnings };
	const base = newSession("", nowMs);
	const nowIso = new Date(nowMs).toISOString();
	// Like str()/strList(), but report anything shortened or dropped instead of doing it silently.
	const cut = (v, max, label) => {
		if (typeof v === "string" && v.length > max) warnings.push(`${label} was longer than ${max} characters and was shortened`);
		return str(v, max);
	};
	const cutList = (v, max, label) => {
		if (Array.isArray(v)) {
			const items = v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
			if (items.length > LIMITS.list) warnings.push(`${label}: only the first ${LIMITS.list} entries were kept`);
			if (items.slice(0, LIMITS.list).some((x) => x.length > max)) warnings.push(`${label}: entries longer than ${max} characters were shortened`);
		}
		return strList(v, max);
	};
	const e = raw.event && typeof raw.event === "object" ? raw.event : {};
	const a = e.aida && typeof e.aida === "object" ? e.aida : {};
	if (e.durationMin !== undefined && !Number.isInteger(e.durationMin)) warnings.push(`event.durationMin: "${String(e.durationMin).slice(0, 20)}" is not a whole number; using ${base.event.durationMin}`);
	const tz = cut(e.timeZone, 64, "event.timeZone");
	// Supported cadence ids pass through; any other recurrence text moves to recurrenceLegacy (kept verbatim, with a warning).
	const rawRec = typeof e.recurrence === "string" ? e.recurrence : "";
	const recIsCadence = RECURRENCE_CADENCES.some(([k]) => k === rawRec);
	let legacy = cut(e.recurrenceLegacy, 300, "event.recurrenceLegacy");
	if (!recIsCadence) {
		legacy = cut(rawRec, 300, "event.recurrence");
		warnings.push(`event.recurrence: "${rawRec.slice(0, 40)}" is not a supported cadence; kept as legacy text. Choose Weekly, Biweekly, Monthly or Quarterly`);
	}
	const event = {
		slug: cut(e.slug, 80, "event.slug"), internalName: cut(e.internalName, LIMITS.short, "event.internalName"), publicTitle: cut(e.publicTitle, LIMITS.short, "event.publicTitle"), format: enumOr(e.format ?? "", FORMATS, "", warnings, "format"),
		topics: cutList(e.topics, 60, "event.topics"), heroUrl: cut(e.heroUrl, LIMITS.url, "event.heroUrl"), heroAlt: cut(e.heroAlt, 300, "event.heroAlt"),
		aida: { attention: cut(a.attention, LIMITS.text, "aida.attention"), interest: cut(a.interest, LIMITS.text, "aida.interest"), decision: cut(a.decision, LIMITS.text, "aida.decision"), action: cut(a.action, LIMITS.text, "aida.action") },
		shortDescription: cut(e.shortDescription, LIMITS.text, "event.shortDescription"), outcomes: cutList(e.outcomes, 300, "event.outcomes"),
		date: cut(e.date, 10, "event.date"), time: cut(e.time, 5, "event.time"), timeZone: canonicalTimeZone(tz),
		durationMin: Number.isInteger(e.durationMin) ? e.durationMin : base.event.durationMin,
		hosts: cutList(e.hosts, 80, "event.hosts"), platform: cut(e.platform, 300, "event.platform"), venue: cut(e.venue, 300, "event.venue"), joinUrl: cut(e.joinUrl, LIMITS.url, "event.joinUrl"), waitingUrl: cut(e.waitingUrl, LIMITS.url, "event.waitingUrl"),
		recurring: e.recurring === true, recurrence: recIsCadence ? rawRec : "", recurrenceLegacy: legacy, redirectUrl: cut(e.redirectUrl, LIMITS.url, "event.redirectUrl"), thankYou: cut(e.thankYou, LIMITS.text, "event.thankYou"),
		visibility: enumOr(e.visibility ?? "draft", VISIBILITY, "draft", warnings, "visibility"), recordingUrl: cut(e.recordingUrl, LIMITS.url, "event.recordingUrl"),
	};
	const r = raw.rsvp && typeof raw.rsvp === "object" ? raw.rsvp : {};
	const fields = {};
	for (const f of RSVP_FIELDS) {
		const v = r.fields?.[f.id];
		fields[f.id] = f.locked ? "required" : f.modes.includes(v) ? v : DEFAULT_FIELD_MODES[f.id];
		if (!f.locked && v !== undefined && !f.modes.includes(v)) warnings.push(`rsvp.${f.id}: mode "${String(v).slice(0, 20)}" not allowed; using "${fields[f.id]}"`);
	}
	const rsvp = { formVersion: cut(r.formVersion, 40, "rsvp.formVersion") || "v1", fields, smsConsentText: cut(r.smsConsentText, LIMITS.text, "rsvp.smsConsentText") };

	const seen = new Set();
	const tasks = [];
	const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : base.tasks;
	if (rawTasks.length > LIMITS.tasks) warnings.push(`Only the first ${LIMITS.tasks} tasks were kept; ${rawTasks.length - LIMITS.tasks} were dropped`);
	for (const t of rawTasks.slice(0, LIMITS.tasks)) {
		if (!t || typeof t !== "object" || !validId(t.id) || seen.has(t.id)) {
			warnings.push("A task with a missing, invalid or duplicate id was dropped");
			continue;
		}
		seen.add(t.id);
		const due = str(t.due, 10);
		if (due && !validDate(due)) warnings.push(`Task ${t.id}: due date "${due}" is invalid and was cleared`);
		const deps = Array.isArray(t.deps) ? [...new Set(t.deps.filter((d) => validId(d)))] : [];
		if (Array.isArray(t.deps) && deps.length !== t.deps.length) warnings.push(`Task ${t.id}: invalid or repeated dependency ids were removed`);
		if (deps.length > LIMIT_DEPS) warnings.push(`Task ${t.id}: only the first ${LIMIT_DEPS} dependencies were kept`);
		tasks.push({
			id: t.id, stage: STAGES.some((s) => s.id === t.stage) ? t.stage : "create", title: str(t.title, 300) || t.id, hint: str(t.hint, 80), role: str(t.role, 80), deps: deps.slice(0, LIMIT_DEPS),
			status: enumOr(t.status ?? "todo", TASK_STATUS, "todo", warnings, `task ${t.id} status`), owner: str(t.owner, 120), due: validDate(due) ? due : "",
			evidence: str(t.evidence, LIMITS.text), custom: t.custom === true,
		});
	}
	// Self and unknown references cannot be honoured, so they are removed and reported. Cycles are kept and reported
	// (by dependencyIssues / readiness) so the user decides which link to drop.
	for (const t of tasks) {
		const keep = t.deps.filter((d) => d !== t.id && seen.has(d));
		if (keep.length !== t.deps.length) warnings.push(`Task ${t.id}: dependencies on itself or on missing tasks were removed (${t.deps.filter((d) => !keep.includes(d)).join(", ")})`);
		t.deps = keep;
	}
	if (dependencyIssues(tasks).some((x) => x.kind === "cycle")) warnings.push("Task dependencies contain a cycle; review them on the Workflow tab");
	const rseen = new Set();
	const reminders = [];
	for (const m of (Array.isArray(raw.reminders) ? raw.reminders : base.reminders).slice(0, LIMITS.reminders)) {
		if (!m || typeof m !== "object" || !validId(m.id) || rseen.has(m.id)) continue;
		rseen.add(m.id);
		const off = m.offsetMinutes === null ? null : Number.isInteger(m.offsetMinutes) && Math.abs(m.offsetMinutes) <= MAX_OFFSET_MIN ? m.offsetMinutes : 0;
		if (m.offsetMinutes !== null && off === 0 && m.offsetMinutes !== 0) warnings.push(`Reminder ${m.id}: offset "${String(m.offsetMinutes).slice(0, 20)}" is not a whole number within ±${MAX_OFFSET_MIN} minutes; using 0`);
		reminders.push({
			id: m.id, kind: ["confirmation", "reminder", "follow-up"].includes(m.kind) ? m.kind : "reminder", label: str(m.label, 200) || m.id,
			audience: enumOr(m.audience ?? "registrants", REMINDER_AUDIENCES, "registrants", warnings, "reminder audience"), offsetMinutes: off, enabled: m.enabled !== false,
		});
	}
	const reuse = (Array.isArray(raw.reuse) ? raw.reuse : base.reuse).filter((x) => x && validId(x.id)).slice(0, 60).map((x) => ({
		id: x.id, phase: ["before", "during", "after"].includes(x.phase) ? x.phase : "after", label: str(x.label, 300) || x.id, done: x.done === true, note: str(x.note, 500),
	}));
	const caps = {};
	if (raw.capabilities && typeof raw.capabilities === "object") for (const [k, v] of Object.entries(raw.capabilities).slice(0, 60)) if (validId(k)) caps[k] = v === true;
	const session = {
		id: raw.id, schemaVersion: SCHEMA_VERSION, createdAt: isoOrNow(raw.createdAt, nowIso), updatedAt: isoOrNow(raw.updatedAt, nowIso),
		planningState: enumOr(raw.planningState ?? "idea", PLANNING_STATES, "idea", warnings, "planningState"),
		event, rsvp, tier: TIER_IDS.includes(raw.tier) ? raw.tier : "", capabilities: caps, taskTemplate: raw.taskTemplate === TASK_TEMPLATE_VERSION || !Array.isArray(raw.tasks) ? TASK_TEMPLATE_VERSION : 1, tasks, reminders, reuse, notes: str(raw.notes, LIMITS.long),
	};
	return { session, errors, warnings };
}

// Field-level problems that should be shown beside the field. [{ path, message }]
export function validateSession(s) {
	const out = [];
	const e = s.event;
	const bad = (path, message) => out.push({ path, message });
	if (e.slug && !validSlug(e.slug)) bad("event.slug", "Use 3-80 lowercase letters, digits and single hyphens");
	for (const [k, label] of [["heroUrl", "Hero image URL"], ["joinUrl", "Join URL"], ["waitingUrl", "Waiting room URL"], ["redirectUrl", "Redirect URL"], ["recordingUrl", "Recording URL"]]) {
		if (e[k] && !safeUrl(e[k])) bad(`event.${k}`, `${label} must be a full https:// URL with no spaces or credentials`);
	}
	const sched = resolveSchedule(e);
	if (sched.state === "invalid") {
		const path = !e.date || (e.date && !validDate(e.date)) ? "event.date" : !validTime(e.time) ? "event.time" : "event.timeZone";
		bad(path, sched.error);
	} else if (e.timeZone && !validTimeZone(e.timeZone)) bad("event.timeZone", `"${e.timeZone}" is not a recognised IANA time zone`);
	if (!Number.isInteger(e.durationMin) || e.durationMin < 5 || e.durationMin > 720) bad("event.durationMin", "Duration must be 5-720 minutes");
	if (s.rsvp.fields.smsConsent !== "off" && s.rsvp.fields.phone === "off") bad("rsvp.fields.smsConsent", "The SMS opt-in needs the phone field turned on");
	return out;
}

// ---------- reminders ----------
export function reminderTimes(s, nowMs = Date.now()) {
	const sched = resolveSchedule(s.event);
	return s.reminders.map((r) => {
		if (r.offsetMinutes === null) return { ...r, atUtc: null, past: false, timing: "on RSVP" };
		if (sched.state !== "ok") return { ...r, atUtc: null, past: false, timing: "needs a valid schedule" };
		const ms = sched.ms + r.offsetMinutes * 60_000;
		return { ...r, atUtc: new Date(ms).toISOString(), past: ms < nowMs, timing: r.offsetMinutes < 0 ? `${Math.abs(r.offsetMinutes)} min before start` : `${r.offsetMinutes} min after start` };
	});
}

// ---------- progress and readiness ----------
export function progress(s) {
	const count = (tasks) => {
		const live = tasks.filter((t) => t.status !== "na");
		const done = live.filter((t) => t.status === "done").length;
		return { done, total: live.length, pct: live.length ? Math.round((done / live.length) * 100) : 0 };
	};
	return { ...count(s.tasks), byStage: STAGES.map((st) => ({ ...st, ...count(s.tasks.filter((t) => t.stage === st.id)) })) };
}
export function overdueTasks(s, nowMs) {
	const today = todayUtc(nowMs);
	return s.tasks.filter((t) => t.due && t.due < today && t.status !== "done" && t.status !== "na");
}
const hasUrlText = (v) => /https?:\/\//i.test(v);

// ---------- task dependencies ----------
export const isFinished = (t) => t.status === "done" || t.status === "na";
// [{ taskId, dep, kind: "self" | "unknown" | "cycle" }]. Never throws.
export function dependencyIssues(tasks) {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const out = [];
	for (const t of tasks) for (const d of t.deps ?? []) {
		if (d === t.id) out.push({ taskId: t.id, dep: d, kind: "self" });
		else if (!byId.has(d)) out.push({ taskId: t.id, dep: d, kind: "unknown" });
	}
	// Iterative DFS colouring; reports each edge that closes a cycle.
	const color = new Map();
	for (const start of tasks) {
		if (color.get(start.id)) continue;
		const stack = [[start.id, 0]];
		color.set(start.id, 1);
		while (stack.length) {
			const top = stack[stack.length - 1];
			const deps = (byId.get(top[0])?.deps ?? []).filter((d) => d !== top[0] && byId.has(d));
			if (top[1] >= deps.length) {
				color.set(top[0], 2);
				stack.pop();
				continue;
			}
			const d = deps[top[1]++];
			if (color.get(d) === 1) out.push({ taskId: top[0], dep: d, kind: "cycle" });
			else if (!color.get(d)) {
				color.set(d, 1);
				stack.push([d, 0]);
			}
		}
	}
	return out;
}
// Why `depId` cannot be added to `taskId`, or "" when it can.
export function dependencyRefusal(tasks, taskId, depId) {
	if (taskId === depId) return "A task cannot depend on itself";
	const byId = new Map(tasks.map((t) => [t.id, t]));
	if (!byId.has(depId) || !byId.has(taskId)) return "That task does not exist";
	if (byId.get(taskId).deps.includes(depId)) return "That dependency is already set";
	if (byId.get(taskId).deps.length >= LIMIT_DEPS) return `A task can have at most ${LIMIT_DEPS} dependencies`;
	// Adding taskId -> depId closes a cycle when depId already (transitively) depends on taskId.
	const seen = new Set();
	const todo = [depId];
	while (todo.length) {
		const id = todo.pop();
		if (id === taskId) return "That would create a dependency cycle";
		if (seen.has(id)) continue;
		seen.add(id);
		todo.push(...(byId.get(id)?.deps ?? []));
	}
	return "";
}
export const unmetDependencies = (s, t) => t.deps.map((d) => s.tasks.find((x) => x.id === d)).filter((d) => d && !isFinished(d));
export const dependentsOf = (s, id) => s.tasks.filter((t) => t.deps.includes(id));

// ---------- explicit task-list upgrade (template v1 -> v2) ----------
// Never runs on load. Untouched superseded v1 tasks (to do, no owner, due or evidence) are removed; any with progress are
// kept unchanged. Kept default tasks get the catalogue role and dependencies only where theirs are empty. Custom tasks,
// statuses, owners, due dates and evidence are preserved.
const untouched = (t) => t.status === "todo" && !t.owner.trim() && !t.due && !t.evidence.trim() && !t.custom;
export function planTaskUpgrade(s) {
	const have = new Map(s.tasks.map((t) => [t.id, t]));
	const remove = s.tasks.filter((t) => SUPERSEDED_TASKS[t.id] && untouched(t)).map((t) => t.id);
	const keepSuperseded = s.tasks.filter((t) => SUPERSEDED_TASKS[t.id] && !untouched(t)).map((t) => t.id);
	const add = DEFAULT_TASKS.filter((d) => !have.has(d.id)).map((d) => d.id);
	const fill = DEFAULT_TASKS.filter((d) => have.has(d.id) && (!have.get(d.id).role || !have.get(d.id).deps.length)).map((d) => d.id);
	const total = s.tasks.length - remove.length + add.length;
	return { needed: s.taskTemplate !== TASK_TEMPLATE_VERSION, add, remove, keepSuperseded, fill, total, error: total > LIMITS.tasks ? `The upgraded list would have ${total} tasks; the limit is ${LIMITS.tasks}. Remove some custom tasks first.` : "" };
}
export function applyTaskUpgrade(s, plan = planTaskUpgrade(s)) {
	if (plan.error) return { ok: false, error: plan.error, session: s };
	const copy = structuredClone(s);
	const cat = new Map(DEFAULT_TASKS.map((d) => [d.id, d]));
	let tasks = copy.tasks.filter((t) => !plan.remove.includes(t.id));
	const fill = tasks.filter((t) => cat.has(t.id));
	tasks.push(...plan.add.map((id) => ({ ...blankTask(cat.get(id)), deps: [] })));
	const ids = new Set(tasks.map((t) => t.id));
	for (const t of tasks) t.deps = t.deps.filter((d) => ids.has(d) && d !== t.id);
	// Catalogue dependencies are added one by one and skipped if they would close a cycle with the user's own links.
	for (const t of [...fill.filter((x) => !x.deps.length), ...tasks.slice(tasks.length - plan.add.length)]) {
		if (!t.role) t.role = cat.get(t.id).role;
		for (const d of cat.get(t.id).deps) if (ids.has(d) && !dependencyRefusal(tasks, t.id, d)) t.deps.push(d);
	}
	for (const t of fill) if (!t.role) t.role = cat.get(t.id).role;
	const order = new Map(STAGES.map((st, i) => [st.id, i]));
	tasks = tasks.map((t, i) => [t, i]).sort((a, b) => order.get(a[0].stage) - order.get(b[0].stage) || a[1] - b[1]).map(([t]) => t);
	copy.tasks = tasks;
	copy.taskTemplate = TASK_TEMPLATE_VERSION;
	return { ok: true, session: copy };
}

// Readiness checks. severity "blocker" = should be fixed before handing off for publication elsewhere.
export function readiness(s, nowMs = Date.now()) {
	const e = s.event;
	const sched = resolveSchedule(e);
	const errs = new Map(validateSession(s).map((x) => [x.path, x.message]));
	const checks = [];
	const add = (id, tab, severity, ok, text) => checks.push({ id, tab, severity, ok: !!ok, text });
	add("slug", "brief", "blocker", validSlug(e.slug), "Page slug is set and well-formed");
	add("internal", "brief", "warn", e.internalName.trim(), "Internal page name is set");
	add("title", "brief", "blocker", e.publicTitle.trim(), "Public page title is set");
	add("hero", "brief", "warn", safeUrl(e.heroUrl) && e.heroAlt.trim(), "Hero image URL and alt text are set");
	const aidaOk = Object.values(e.aida).every((v) => v.trim());
	add("aida", "brief", "blocker", aidaOk, "All four AIDA fields are written (attention, interest, decision, action)");
	add("description", "brief", "blocker", e.shortDescription.trim() && e.outcomes.length > 0, "Short description and at least one outcome are set");
	add("schedule", "brief", "blocker", sched.state === "ok", sched.state === "ok" ? "Date, time and IANA zone resolve to a UTC instant" : `Schedule: ${sched.state === "unscheduled" ? "not scheduled yet" : sched.error}`);
	add("future", "brief", "warn", sched.state !== "ok" || sched.ms >= nowMs || !!safeUrl(e.recordingUrl), "Scheduled time has not already passed (compared in UTC)");
	add("hosts", "brief", "blocker", e.hosts.length > 0, "At least one host is named");
	add("platform", "brief", "warn", e.platform.trim(), "Platform or venue description is set");
	add("join", "brief", "warn", safeUrl(e.joinUrl) || e.venue.trim(), "Join link (or in-person venue) is set");
	add("urls", "brief", "blocker", !["event.heroUrl", "event.joinUrl", "event.waitingUrl", "event.redirectUrl", "event.recordingUrl"].some((p) => errs.has(p)), "All URLs are valid https links");
	add("after-rsvp", "brief", "warn", safeUrl(e.redirectUrl) || e.thankYou.trim(), "A thank-you message or redirect URL is set");
	add("recurrence", "brief", "warn", !e.recurring || cadenceLabel(e.recurrence), "A supported repeating cadence is chosen when Repeating is checked");
	add("legacy-recurrence", "brief", "warn", !e.recurrenceLegacy, "No legacy free-text repeating schedule is waiting to be replaced by a supported cadence");
	add("deps", "workflow", "warn", dependencyIssues(s.tasks).length === 0, "Task dependencies have no cycles or missing tasks");
	add("task-template", "workflow", "warn", s.taskTemplate === TASK_TEMPLATE_VERSION, "Task list uses the current checklist (upgrade available on the Workflow tab)");
	add("public-links", "brief", "warn", ![e.shortDescription, ...Object.values(e.aida), ...e.outcomes, e.platform, e.venue].some(hasUrlText), "Public copy contains no pasted links (check they are not attendance links)");
	add("rsvp-sms", "rsvp", "blocker", !errs.has("rsvp.fields.smsConsent") && (s.rsvp.fields.smsConsent === "off" || s.rsvp.smsConsentText.trim()), "SMS opt-in has phone enabled and its own consent wording");
	add("tier", "tier", "warn", s.tier, "A Crawl / Walk / Run tier is chosen");
	add("reminders", "reminders", "warn", s.reminders.some((r) => r.enabled && r.kind === "reminder"), "At least one reminder is planned (email reminders are the minimum)");
	add("overdue", "workflow", "warn", overdueTasks(s, nowMs).length === 0, "No tasks are past their due date (dates compared in UTC)");
	add("evidence", "workflow", "warn", s.tasks.every((t) => t.status !== "done" || t.evidence.trim()), "Every completed task has evidence");
	add("recording", "brief", "warn", s.planningState !== "delivered" || safeUrl(e.recordingUrl), "A delivered session has a recording URL attached");
	const failed = checks.filter((c) => !c.ok);
	return { checks, passed: checks.length - failed.length, total: checks.length, blockers: failed.filter((c) => c.severity === "blocker").length };
}

// ---------- library ----------
export function sessionStatus(s, nowMs = Date.now()) {
	if (safeUrl(s.event.recordingUrl)) return { key: "recorded", label: "Recorded" };
	const sched = resolveSchedule(s.event);
	if (sched.state === "unscheduled") return { key: "unscheduled", label: "Unscheduled" };
	if (sched.state === "invalid") return { key: "invalid", label: "Schedule invalid" };
	return sched.ms >= nowMs ? { key: "upcoming", label: "Upcoming" } : { key: "past", label: "Past, no recording" };
}
export const allTopics = (list) => [...new Set(list.flatMap((s) => s.event.topics))].sort((a, b) => a.localeCompare(b));
export const allHosts = (list) => [...new Set(list.flatMap((s) => s.event.hosts))].sort((a, b) => a.localeCompare(b));
export function filterSessions(list, { q = "", topic = "", host = "", view = "all" } = {}, nowMs = Date.now()) {
	const needle = q.trim().toLowerCase();
	const out = list.filter((s) => {
		const e = s.event;
		const st = sessionStatus(s, nowMs).key;
		if (view === "upcoming" && !(st === "upcoming" || st === "unscheduled")) return false;
		if (view === "recorded" && st !== "recorded") return false;
		if (topic && !e.topics.some((t) => t.toLowerCase() === topic.toLowerCase())) return false;
		if (host && !e.hosts.some((h) => h.toLowerCase() === host.toLowerCase())) return false;
		if (!needle) return true;
		return [e.publicTitle, e.internalName, e.slug, e.shortDescription, ...e.hosts, ...e.topics].some((v) => v.toLowerCase().includes(needle));
	});
	const rank = (s) => {
		const sc = resolveSchedule(s.event);
		return sc.state === "ok" ? sc.ms : null;
	};
	return out.sort((a, b) => {
		const ra = rank(a), rb = rank(b);
		if (ra == null && rb == null) return a.event.internalName.localeCompare(b.event.internalName);
		if (ra == null) return 1;
		if (rb == null) return -1;
		return view === "recorded" ? rb - ra : ra - rb;
	});
}

// ---------- import / merge ----------
export function parseImport(text, nowMs = Date.now()) {
	const fail = (m) => ({ ok: false, sessions: [], errors: [m], warnings: [] });
	if (typeof text !== "string") return fail("Nothing to import");
	if (text.length > LIMITS.importBytes) return fail(`File is larger than ${LIMITS.importBytes / 1_000_000} MB`);
	let data;
	try {
		data = JSON.parse(text);
	} catch (err) {
		return fail(`Not valid JSON: ${err.message}`);
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) return fail("Expected a JSON object");
	if (data.app !== "webinar-strategy") return fail("This file was not exported by Virtual Event Strategy");
	if (data.kind === "public-page") return fail("This is a public page export. It has no planning data and cannot be imported");
	if (data.version !== STORE_VERSION) return fail(`Unsupported export version ${data.version}; this app reads ${STORE_VERSION}`);
	const rawList = data.kind === "backup" ? data.sessions : data.kind === "session" ? [data.session] : null;
	if (!Array.isArray(rawList)) return fail('Expected kind "backup" with sessions[] or kind "session" with session');
	if (rawList.length === 0) return fail("The file contains no sessions");
	if (rawList.length > LIMITS.sessions) return fail(`More than ${LIMITS.sessions} sessions`);
	const sessions = [], errors = [], warnings = [];
	rawList.forEach((raw, i) => {
		const r = normalizeSession(raw, nowMs);
		errors.push(...r.errors.map((m) => `Session ${i + 1}: ${m}`));
		warnings.push(...r.warnings.map((m) => `Session ${i + 1}: ${m}`));
		if (r.session) sessions.push(r.session);
	});
	return errors.length ? { ok: false, sessions: [], errors, warnings } : { ok: true, sessions, errors, warnings };
}
// Adds imported sessions without overwriting: colliding ids get a fresh id and a " (imported)" suffix.
export function mergeImported(existing, imported, nowMs = Date.now()) {
	const ids = new Set(existing.map((s) => s.id));
	const renamed = [];
	const added = imported.map((s) => {
		if (!ids.has(s.id)) {
			ids.add(s.id);
			return s;
		}
		const id = newId("ws");
		ids.add(id);
		renamed.push(s.event.internalName || s.id);
		return { ...s, id, event: { ...s.event, internalName: `${s.event.internalName} (imported)`.slice(0, LIMITS.short) }, updatedAt: new Date(nowMs).toISOString() };
	});
	return { sessions: [...existing, ...added], added: added.length, renamed };
}
export function duplicateSession(s, nowMs = Date.now()) {
	const copy = structuredClone(s);
	const now = new Date(nowMs).toISOString();
	copy.id = newId("ws");
	copy.createdAt = copy.updatedAt = now;
	copy.planningState = "drafting";
	copy.event.internalName = `${s.event.internalName} (copy)`.slice(0, LIMITS.short);
	copy.event.slug = "";
	copy.event.recordingUrl = "";
	copy.event.visibility = "draft";
	copy.event.date = copy.event.time = "";
	copy.tasks.forEach((t) => Object.assign(t, { status: "todo", evidence: "", due: "" }));
	copy.reuse.forEach((r) => Object.assign(r, { done: false, note: "" }));
	return copy;
}
