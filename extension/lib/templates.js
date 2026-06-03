// Prompt template system.
//
// A template is { id, name, description, body, builtin }. The `body` is a
// plain-text prompt with {{placeholders}}:
//
//   {{lang}}     — target language label (e.g. "Ukrainian")
//   {{length}}   — length description ("4-6 concise bullets…")
//   {{title}}    — video / article title
//   {{channel}}  — author / channel
//   {{kindLabel}} — "YouTube video transcript", "web article", etc.
//   {{content}}  — the extracted source text
//
// Free users get the built-ins. Pro can add their own.

const KEY = 'ais_prompt_templates_user';

export const BUILTIN_TEMPLATES = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'The default summary — bullets, faithful, structured.',
    builtin: true,
    body: `You are an expert at summarising {{kindLabel}}s. Read the source and produce a high-signal summary.

Rules:
- Write in {{lang}}.
- Format: {{length}}
- Use Markdown. Bullets with "-". Bold key terms with **…**.
- Be faithful to the source — do not invent facts.
- Drop filler, ads, sponsor reads, navigation cruft.
- No "In this video…" preamble. Start with the actual content.

Title: {{title}}
Author: {{channel}}

Source:
"""
{{content}}
"""`,
  },
  {
    id: 'executive',
    name: 'Executive brief',
    description: 'TL;DR in 3 lines + 5 key takeaways + 3 action items.',
    builtin: true,
    body: `You are briefing a busy executive on this {{kindLabel}}. They have 60 seconds.

Output exactly this structure in {{lang}}, using Markdown:

**TL;DR** (3 sentences max)
…

**Key takeaways** (5 bullets, most important first)
- …

**Action items** (3 bullets, what should we DO with this)
- …

Be ruthlessly brief. No filler.

Title: {{title}}
Source:
"""
{{content}}
"""`,
  },
  {
    id: 'eli5',
    name: 'ELI5',
    description: 'Explain the content like the reader is five years old.',
    builtin: true,
    body: `Explain the content of this {{kindLabel}} like I'm a curious 5-year-old.

Rules:
- Write in {{lang}}.
- Use simple words. No jargon. If a technical term is unavoidable, define it in one short sentence.
- Use analogies and metaphors a child would get (toys, animals, food, school).
- Keep it under 300 words.
- Bullets are OK but plain prose is better here.

Title: {{title}}
Source:
"""
{{content}}
"""`,
  },
  {
    id: 'actions',
    name: 'Action items only',
    description: 'Just the to-do list — no narrative, no context.',
    builtin: true,
    body: `Extract ONLY the concrete action items from this {{kindLabel}} — things the listener/reader should DO.

Rules:
- Write in {{lang}}.
- One action per bullet. Start each with a verb.
- If the source has no actionable advice, say so in one line.
- No preamble. No conclusion. Just the bullets.
- Max 10 items.

Title: {{title}}
Source:
"""
{{content}}
"""`,
  },
  {
    id: 'study-notes',
    name: 'Study notes',
    description: 'Hierarchical notes with definitions, examples, formulas.',
    builtin: true,
    body: `You are taking study notes from this {{kindLabel}} for an exam.

Output structured notes in {{lang}}, in Markdown:
- Use # / ## / ### headings for topics and subtopics.
- Bold every important term: **term**.
- For each defined concept, write "**Term** — definition. *Example:* …"
- Include any formulas / numbers / dates verbatim.
- Add a final section "**Likely exam questions**" with 3 questions and 1-line answers.

Be thorough but not wordy.

Title: {{title}}
Source:
"""
{{content}}
"""`,
  },
  {
    id: 'quotes',
    name: 'Key quotes',
    description: 'Direct quotes verbatim, no paraphrasing.',
    builtin: true,
    body: `Extract 5-10 of the most quotable lines from this {{kindLabel}} VERBATIM. Don't paraphrase.

Rules:
- Output in {{lang}} (only if the source is also in {{lang}}; otherwise keep original language).
- Each quote on its own line, enclosed in "…".
- Add the speaker / context in italics after the quote: *— who said it / when*.
- Pick lines that are pithy, surprising, or strongly opinionated.
- No introduction. No commentary.

Title: {{title}}
Source:
"""
{{content}}
"""`,
  },
];

export async function getUserTemplates() {
  const { [KEY]: t } = await chrome.storage.local.get(KEY);
  return t || [];
}

export async function setUserTemplates(templates) {
  await chrome.storage.local.set({ [KEY]: templates });
}

export async function saveUserTemplate(tpl) {
  const list = await getUserTemplates();
  const idx = list.findIndex((t) => t.id === tpl.id);
  if (idx >= 0) list[idx] = { ...tpl, builtin: false };
  else list.push({ ...tpl, builtin: false });
  await setUserTemplates(list);
  return list;
}

export async function deleteUserTemplate(id) {
  const list = await getUserTemplates();
  await setUserTemplates(list.filter((t) => t.id !== id));
}

export async function getAllTemplates() {
  const user = await getUserTemplates();
  return [...BUILTIN_TEMPLATES, ...user];
}

export async function getTemplate(id) {
  if (!id) return BUILTIN_TEMPLATES[0];
  const all = await getAllTemplates();
  return all.find((t) => t.id === id) || BUILTIN_TEMPLATES[0];
}

export function applyTemplate(template, vars) {
  let body = template && template.body ? template.body : '';
  for (const [k, v] of Object.entries(vars || {})) {
    body = body.replace(new RegExp('\\{\\{\\s*' + escapeRe(k) + '\\s*\\}\\}', 'g'), String(v == null ? '' : v));
  }
  return body;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
