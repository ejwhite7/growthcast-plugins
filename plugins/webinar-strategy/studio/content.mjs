// Editorial content: the "Why virtual events" canvas graph and the Crawl / Walk / Run capability guidance.
// Source: the author's webinar context. Vendor statements are the author's preferences, not verified claims.

export const SIGNAL_COPY = {
	live: "Live attendance is the strongest evidence of interest: someone carved time out of their day and devoted attention to you.",
	onDemand: "Watching a recording on demand is a slightly weaker signal, but still strong: it is deliberate time spent with your content.",
};

const N = (id, kind, label, x, y, summary, details = [], w = 210) => ({ id, kind, label, x, y, w, h: 54, summary, details });

export const CANVAS = { width: 1460, height: 940 };

export const NODES = [
	N("hub", "core", "Virtual event session", 420, 380, "One session that serves marketing before, during and after, and feeds many channels.", [
		"Engagement signal: attendees give real attention, live or on demand.",
		"Every session needs an RSVP form, a way to deliver the room link, and a platform to run the session.",
		"The recording is the long-lived asset: it can be posted, gated, clipped and indexed.",
	]),
	N("sig-live", "signal", "Live attendance", 420, 150, "Strongest signal of interest.", [
		"Registrants who show up live have set aside time and given attention.",
		"Track attended versus no-show: both groups get different follow-ups.",
		"Live also unlocks in-session questions, polls and spotlighting customer questions.",
	]),
	N("sig-ondemand", "signal", "On-demand viewing", 420, 610, "Slightly weaker, still strong signal.", [
		"Viewing a recording takes deliberate time, so it still indicates interest.",
		"Gate or track recording views to keep learning who is interested after the live date.",
	]),
	N("f-feature", "format", "Feature release", 40, 40, "Announce and demo something new.", ["Pairs with a launch: show the feature, take questions, then reuse clips for announcements."]),
	N("f-support", "format", "Power user / support", 40, 170, "Teach customers to get more value.", ["Feature-support sessions help customers become power users and reduce repeat support questions."]),
	N("f-interview", "format", "Interview", 40, 300, "Experts, vendors and customers.", ["A conversation with an expert, vendor or customer. Good for non-salesy relationship building."]),
	N("f-panel", "format", "Panel discussion", 40, 430, "Several voices, a different feel.", ["Same guest types as an interview, but with a livelier, multi-voice feel."]),
	N("f-freeform", "format", "Freeform discussion", 40, 560, "Open conversation.", ["Looser structure; works when the audience wants to talk through a topic."]),
	N("f-workshop", "format", "Workshop / how-to", 40, 690, "Teach a skill step by step.", ["Hands-on sessions. Recordings make strong search and tutorial content."]),
	N("f-onboarding", "format", "Onboarding / Q&A", 40, 820, "Help new customers get started.", ["Onboarding sessions and Q&A feed support and in-app lifecycle activation."]),
	N("p-before", "phase", "Before: promote", 790, 190, "RSVP page, posts, invitations.", [
		"The RSVP page can rank for SEO/AEO.",
		"Fuels social posts, founder-led marketing and ads.",
		"Invite partners, clients and thought leaders to share expertise in a non-salesy way.",
	], 190),
	N("p-during", "phase", "During: deliver", 790, 380, "Live session and capture.", [
		"Run the session and record it.",
		"In-session tools: waiting room, polls and quizzes, file sharing, spotlighting customer questions.",
		"Collect attendee and no-show data during the session.",
	], 190),
	N("p-after", "phase", "After: reuse", 790, 570, "Recording, clips, follow-ups.", [
		"Post-event 'access the recording' page adds another SEO/AEO surface.",
		"Cut the conversation into clips, quotes and stills.",
		"Use founder-led content after the virtual event to share takeaways and promote the recording.",
		"Send attendee and no-show follow-ups.",
	], 190),
	N("ch-social", "channel", "Social posts", 1180, 20, "Organic social.", ["Before: announce. During: share live quotes, highlights and join-now reminders linking to the public RSVP page. After: clips, quotes and stills."], 220),
	N("ch-founder", "channel", "Founder-led marketing", 1180, 90, "Founder voice.", ["Before: founder posts and appearances promote the live session. After: founder-led content shares takeaways, clips and the recording to keep promoting the virtual event."], 220),
	N("ch-ads", "channel", "Paid ads", 1180, 160, "Promote and retarget.", ["Promote the RSVP page; use clips and stills as ad creative afterwards."], 220),
	N("ch-seo", "channel", "SEO / AEO", 1180, 230, "Two indexable pages.", ["The RSVP page and the recording page can both be indexed. Keep join links off both."], 220),
	N("ch-partners", "channel", "Partner relationships", 1180, 300, "Relationships and new audiences.", ["Invite partners, clients and thought leaders as guests; it builds relationships without selling.", "Partners expand reach to new audiences when they share and promote the session with their own audiences.", "This works especially well with agencies, thought leaders and other vendors.", "During: co-host, contribute expertise and engage with attendees together. After: share the recording, co-promote takeaways and continue the relationship."], 220),
	N("ch-youtube", "channel", "YouTube", 1180, 370, "Live streaming and recordings.", ["During: stream the session on YouTube when the channel is eligible and the destination is configured and tested. After: post the recording and cut-down clips."], 220),
	N("ch-leadmagnet", "channel", "Lead magnet", 1180, 440, "Gated recording.", ["Gate the recording to support future acquisition efforts."], 220),
	N("ch-lifecycle", "channel", "Lifecycle comms", 1180, 510, "Automated flows.", ["Reminders, confirmations, follow-ups and recording links in lifecycle flows."], 220),
	N("ch-email", "channel", "Email", 1180, 580, "Announcements and reminders.", ["At minimum, send email reminders. Add SMS only for registrants who opted in."], 220),
	N("ch-cs", "channel", "Customer success", 1180, 650, "CS outreach.", ["Before: refer customers with relevant support tickets to upcoming office-hours sessions and invite them to RSVP. After: share recordings and answers with accounts."], 220),
	N("ch-support", "channel", "Support", 1180, 720, "Answer once, reuse often.", ["Live questions and recordings feed help content and reduce repeat tickets."], 220),
	N("ch-inapp", "channel", "In-app activation", 1180, 790, "Lifecycle prompts in product.", ["Link onboarding and feature recordings from in-app lifecycle activation."], 220),
	N("ch-sms", "channel", "SMS", 1180, 860, "Opt-in text messages.", ["Before: send RSVP invitations and session reminders. After: share the recording and follow-up resources. Send only to recipients with appropriate SMS consent and honor opt-outs."], 220),
];

const E = (a, b, label) => ({ a, b, label });
export const EDGES = [
	...["f-feature", "f-support", "f-interview", "f-panel", "f-freeform", "f-workshop", "f-onboarding"].map((f) => E(f, "hub", "is a format of")),
	E("hub", "sig-live", "live attendance"), E("hub", "sig-ondemand", "on-demand viewing"),
	E("hub", "p-before", "starts with"), E("hub", "p-during", "delivered in"), E("hub", "p-after", "continues in"),
	E("p-before", "p-during", "leads to"), E("p-during", "p-after", "leads to"),
	E("sig-live", "p-during", "is earned during"), E("sig-ondemand", "p-after", "is earned after"),
	...["ch-social", "ch-founder", "ch-ads", "ch-seo", "ch-partners", "ch-email", "ch-lifecycle", "ch-cs", "ch-sms"].map((c) => E("p-before", c, "promoted through")),
	E("p-during", "ch-social", "live updates shared through"),
	E("p-during", "ch-partners", "collaborate live with"),
	E("p-during", "ch-youtube", "streamed through"),
	E("p-after", "ch-partners", "co-promote and follow up with"),
	E("p-during", "ch-support", "questions feed"),
	...["ch-social", "ch-founder", "ch-ads", "ch-seo", "ch-youtube", "ch-leadmagnet", "ch-lifecycle", "ch-email", "ch-cs", "ch-support", "ch-inapp", "ch-sms"].map((c) => E("p-after", c, "recording reused in")),
];

export const TIER_INFO = {
	crawl: { label: "Crawl", blurb: "RSVP form, a way to deliver the room link, and a platform to stream. Gets the job done.", author: "Author's preference: Riverside. The author calls it the least sophisticated option that still gets the job done." },
	walk: { label: "Walk", blurb: "Add a stronger waiting room, richer RSVP data, branching communication and attendee / no-show data.", author: "Vendor-neutral. The author mentions another platform sitting between the other two but names none; choose by the capabilities you need." },
	run: { label: "Run", blurb: "Add analytics, CRM and CMS integration, and in-session engagement tools.", author: "Author's preference: Sequel. The author notes it costs a little money; this plugin makes no pricing claim. (The original said \"SQL\"; EJ confirmed this means Sequel.)" },
};

// tier = the lowest tier at which this studio suggests the capability. Grouping is editorial and adjustable per session.
export const CAPABILITIES = [
	{ id: "rsvp", tier: "crawl", label: "RSVP form", note: "At minimum name and email." },
	{ id: "link-delivery", tier: "crawl", label: "Deliver the room link to registrants", note: "Via confirmation and reminders, never on the public page." },
	{ id: "streaming", tier: "crawl", label: "Platform to run the streaming session", note: "Plus recording." },
	{ id: "email-reminders", tier: "crawl", label: "Email reminders", note: "The minimum reminder channel." },
	{ id: "waiting-room", tier: "walk", label: "Waiting room (advanced)", note: "Holding area before the session starts." },
	{ id: "rsvp-data", tier: "walk", label: "Robust RSVP data capture", note: "Company, size, title and other business fields." },
	{ id: "branching", tier: "walk", label: "Branching communication logic", note: "Different messages by behaviour, e.g. attended vs no-show." },
	{ id: "attendance-data", tier: "walk", label: "Attendee and no-show data", note: "Including data collected during the session." },
	{ id: "analytics", tier: "run", label: "Analytics integration", note: "Destination to be confirmed (for example a product analytics tool)." },
	{ id: "crm-cms", tier: "run", label: "CRM and CMS integration", note: "Destinations to be confirmed; HubSpot and PostHog were named as examples." },
	{ id: "polls", tier: "run", label: "Polls and quizzes", note: "In-session." },
	{ id: "files", tier: "run", label: "File sharing", note: "In-session." },
	{ id: "spotlight", tier: "run", label: "Spotlighting customer questions", note: "In-session." },
];

export const VENDORS = [
	{ name: "Riverside", tier: "crawl", status: "Author's Crawl preference", note: "Preference stated by the author. Not a verified capability ranking or a pricing claim." },
	{ name: "Sequel", tier: "run", status: "Author's Run preference", note: "Preference stated by the author. Not a verified capability ranking or a pricing claim." },
	{ name: "Zoom", tier: null, status: "Unverified", note: "Named in the author's context. Capabilities not verified here." },
	{ name: "Wispr", tier: null, status: "Unverified", note: "Spelled as supplied by the author. Capabilities not verified here." },
	{ name: "Livefront", tier: null, status: "Unverified", note: "Spelled as supplied by the author. Capabilities not verified here." },
];
export const DESTINATION_NOTE = "PostHog (analytics / CDP) and HubSpot (CRM) were named as examples of where registrations might be logged. They are different kinds of tool: confirm the actual destinations before relying on either.";

export function capabilitiesForTier(tier) {
	const order = ["crawl", "walk", "run"];
	const at = order.indexOf(tier);
	return Object.fromEntries(CAPABILITIES.map((c) => [c.id, at >= 0 && order.indexOf(c.tier) <= at]));
}
