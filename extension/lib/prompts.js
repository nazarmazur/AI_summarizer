// Centralised prompt templates so we can tweak them in one place.
//
// Two flavours of prompts:
//   • single-shot — used when the transcript fits comfortably in one request
//   • map / reduce — used for long videos (chunkSummary + finalSummary)

const LANG_NAME = {
  en: 'English',     zh: 'Simplified Chinese', es: 'Spanish',     ar: 'Arabic',
  pt: 'Portuguese',  id: 'Indonesian',         fr: 'French',      ja: 'Japanese',
  ru: 'Russian',     de: 'German',             ko: 'Korean',      tr: 'Turkish',
  it: 'Italian',     pl: 'Polish',             uk: 'Ukrainian',   nl: 'Dutch',
  ro: 'Romanian',    sv: 'Swedish',            cs: 'Czech',       el: 'Greek',
  hu: 'Hungarian',   da: 'Danish',             fi: 'Finnish',     no: 'Norwegian',
  bg: 'Bulgarian',   sk: 'Slovak',             sr: 'Serbian',     hr: 'Croatian',
  vi: 'Vietnamese',  fa: 'Persian',            he: 'Hebrew',      hi: 'Hindi',
  th: 'Thai',        bn: 'Bengali',            ms: 'Malay',
};

const LENGTH_DESCR = {
  short:  'Organise the summary into 3-5 short sections. Begin EACH section with a "## " subheading of 3-6 words, then ONE sentence under it. No preamble. ~120 words.',
  medium: 'Organise the summary into 4-7 sections. Optional 1-line intro first. Begin EACH section with a "## " subheading of 3-6 words, then 1-2 sentences or 2-3 short "-" bullets under it. ~300 words.',
  long:   'Short intro paragraph, then 5-8 sections, EACH beginning with a "## " subheading. Under each, 2-4 "-" bullets with 1-3 sentences of detail. End with a "## Key takeaways" section. ~600 words.',
};

function langName(code) {
  if (!code || code === 'auto') return 'the original language of the transcript';
  return LANG_NAME[code] || code;
}

// ---------------------------------------------------------------------------
// Single-shot
// ---------------------------------------------------------------------------

export function buildSummaryPrompt({ transcript, language, length, title, channel }) {
  const lang = langName(language);
  const len  = LENGTH_DESCR[length] || LENGTH_DESCR.medium;
  return [
    `You are an expert at summarising YouTube videos. Read the transcript and produce a high-signal summary.`,
    ``,
    `Rules:`,
    `- Write in ${lang}.`,
    `- Format: ${len}`,
    `- Use Markdown: start every section with a "## " subheading, "-" for bullets, **…** for key terms.`,
    `- Be faithful to the video — do not invent facts not present in the transcript.`,
    `- Drop filler, ads, sponsor reads, and self-promotion.`,
    `- No "In this video…" preamble. Start with the actual content.`,
    ``,
    `Video title: ${title || '(unknown)'}`,
    `Channel: ${channel || '(unknown)'}`,
    ``,
    `Transcript:`,
    `"""`,
    transcript,
    `"""`,
  ].join('\n');
}

export function buildTimestampsPrompt({ transcript, language, title }) {
  const lang = langName(language);
  return [
    `You are extracting chapter-like timestamps from a YouTube video transcript.`,
    ``,
    `Rules:`,
    `- Output 5-15 lines. One key moment per line.`,
    `- Each line MUST start with the timestamp from the transcript in the format "MM:SS" (or "H:MM:SS" for long videos) followed by " — " and a short description in ${lang}.`,
    `- Spread the picks across the whole video — don't bunch them all in the first 5 minutes.`,
    `- Use the timestamps already present in [ ] brackets in the transcript. Don't fabricate new times.`,
    `- No intro line, no closing line. Just the timestamps.`,
    ``,
    `Video title: ${title || '(unknown)'}`,
    ``,
    `Transcript with timestamps:`,
    `"""`,
    transcript,
    `"""`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Generic source-aware summary. Picks copy that fits the content type.
// ---------------------------------------------------------------------------

const KIND_LABEL = {
  youtube:  'YouTube video transcript',
  vimeo:    'Vimeo video transcript',
  twitch:   'Twitch VOD page metadata',
  social:   'short-form social-media video',
  webpage:  'web article',
  pdf:      'PDF document',
};

export function buildSourceSummaryPrompt({ source, text, language, length, title, channel, site }) {
  const lang   = langName(language);
  const len    = LENGTH_DESCR[length] || LENGTH_DESCR.medium;
  const kind   = (source && source.kind) || 'webpage';
  const label  = KIND_LABEL[kind] || 'document';

  let kindNote = '';
  switch (kind) {
    case 'youtube':
    case 'vimeo':
      kindNote = 'This is a transcript automatically pulled from a video. Speaker filler ("um", "you know", "uh") is fine to drop.';
      break;
    case 'twitch':
      kindNote = 'Only the VOD title and description are available — there is no transcript. Summarise what the stream appears to be about and what topics it covers based on the metadata.';
      break;
    case 'social':
      kindNote = 'This is a short-form social-media post. The "text" is the caption / description, not a transcript. Treat it like a social post — summarise what the creator says they cover.';
      break;
    case 'webpage':
      kindNote = 'This is the body text of a web article extracted from HTML. Some sidebar/nav text may have slipped in — ignore it.';
      break;
    case 'pdf':
      kindNote = 'This is text extracted from a PDF document. Preserve structure (sections, lists) where useful.';
      break;
  }

  const headerLines = [
    title   && `Title: ${title}`,
    channel && `Author/Channel: ${channel}`,
    site    && `Site: ${site}`,
  ].filter(Boolean);

  return [
    `You are summarising a ${label}. Produce a high-signal summary for the reader.`,
    ``,
    `Rules:`,
    `- Write in ${lang}.`,
    `- Format: ${len}`,
    `- Use Markdown: start every section with a "## " subheading, "-" for bullets, **…** for key terms.`,
    `- Be faithful to the source — do not invent facts.`,
    `- Drop filler, ads, sponsor reads, navigation cruft.`,
    `- No "In this <thing>…" preamble. Start with the actual content.`,
    kindNote && `- Context: ${kindNote}`,
    ``,
    ...headerLines,
    headerLines.length ? '' : null,
    `Source:`,
    `"""`,
    text,
    `"""`,
  ].filter((l) => l !== null && l !== undefined).join('\n');
}

// Same idea but no `text` — for PDFs sent as native Gemini attachments.
export function buildAttachmentSummaryPrompt({ source, language, length, title }) {
  const lang  = langName(language);
  const len   = LENGTH_DESCR[length] || LENGTH_DESCR.medium;
  const kind  = (source && source.kind) || 'pdf';
  const label = KIND_LABEL[kind] || 'document';

  return [
    `You are summarising the attached ${label} for the reader.`,
    ``,
    `Rules:`,
    `- Write in ${lang}.`,
    `- Format: ${len}`,
    `- Markdown: start every section with a "## " subheading, "-" for bullets, **…** for key terms.`,
    `- Be faithful to the document.`,
    `- No preamble — start with the actual content.`,
    ``,
    title ? `Title: ${title}` : '',
    ``,
    `Read the attached document and summarise it now.`,
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Q&A follow-up chat. Reply to the user's question grounded in the source
// content (full transcript / article text when small, just the summary when
// the source was too big to keep around).
// ---------------------------------------------------------------------------

export function buildChatSystemPrompt({ source, title, content, contentMode, summary, language }) {
  const lang = langName(language);
  const kindLabel = (source && KIND_LABEL && KIND_LABEL[source.kind]) || 'piece of content';

  const ctxBody = contentMode === 'full' && content
    ? [`Full source content:`, `"""`, content, `"""`].join('\n')
    : [`The full content is too long to include — answer using the summary below`,
       `and your general knowledge of what a typical ${kindLabel} of this kind covers.`,
       ``,
       `Summary we already produced:`,
       `"""`,
       summary,
       `"""`].join('\n');

  return [
    `You are an assistant answering follow-up questions about a specific ${kindLabel}`,
    `the user just looked at. Be concise, factual, and ground every claim in the`,
    `source content. If the source doesn't say something, say so — don't guess.`,
    ``,
    `Reply rules:`,
    `- Write in ${lang} unless the user explicitly asks for another language.`,
    `- Markdown. Short paragraphs. Bullets when listing.`,
    `- When referring to moments in a video, include the timestamp from the transcript`,
    `  in [MM:SS] brackets so the UI can make them clickable.`,
    `- No preamble like "Great question!" — get to the answer.`,
    ``,
    `Title: ${title || '(unknown)'}`,
    ``,
    ctxBody,
  ].join('\n');
}

export function buildChatTurnPrompt({ systemPrompt, history, question }) {
  // Render as a single prompt (works the same way across all three providers).
  const parts = [systemPrompt, ''];
  for (const m of history) {
    parts.push(m.role === 'user' ? `User: ${m.text}` : `Assistant: ${m.text}`);
  }
  parts.push(`User: ${question}`);
  parts.push(`Assistant:`);
  return parts.join('\n\n');
}

// Suggest a few content-specific starter questions for the Q&A chat.
export function buildSuggestQuestionsPrompt({ title, content, summary, language }) {
  const lang = (!language || language === 'auto') ? 'the same language as the content' : langName(language);
  return [
    `Based on the content below${title ? ` ("${title}")` : ''}, suggest exactly 5 short, specific questions a curious viewer would want answered.`,
    `Rules:`,
    `- Each question must be answerable from this content.`,
    `- Under 12 words each. Make them genuinely interesting, not generic.`,
    `- Write them in ${lang}.`,
    `- Output ONLY the 5 questions, one per line, with NO numbering, bullets, quotes, or extra text.`,
    ``,
    `Summary:`,
    (summary || '').slice(0, 1500),
    ``,
    `Content excerpt:`,
    `"""`,
    (content || '').slice(0, 4000),
    `"""`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Map step: summarise one chunk of a long transcript.
// We deliberately ask for English notes here regardless of the user's target
// language — the final synthesis step does the language conversion. Reason:
// notes don't need to be reader-quality, and asking for English keeps them
// short and consistent across chunks even on smaller models.
// ---------------------------------------------------------------------------

export function buildChunkSummaryPrompt({ chunk, index, total, title }) {
  return [
    `You are reading section ${index} of ${total} of a long YouTube video transcript.`,
    `Produce dense notes covering this section only. These notes will be combined`,
    `with notes from the other sections to write the final summary.`,
    ``,
    `Rules:`,
    `- Output in English (the next step will translate the final summary).`,
    `- 6-12 bullet points capturing every distinct idea, fact, or argument.`,
    `- Be specific — include names, numbers, examples. Skip filler.`,
    `- No preamble like "In this section…". Start straight with the bullets.`,
    ``,
    `Video title: ${title || '(unknown)'}`,
    ``,
    `Section ${index}/${total} transcript:`,
    `"""`,
    chunk,
    `"""`,
  ].join('\n');
}

export function buildChunkTimestampsPrompt({ chunk, index, total, title }) {
  return [
    `You are scanning section ${index} of ${total} of a YouTube video transcript`,
    `with timestamps in [ ] brackets. Pick 2-4 key moments from THIS section only.`,
    ``,
    `Rules:`,
    `- Output 2-4 lines. Each line: "MM:SS — short description in English".`,
    `- Use ONLY timestamps that appear in the brackets below.`,
    `- No commentary, no intro line.`,
    ``,
    `Video title: ${title || '(unknown)'}`,
    ``,
    `Section ${index}/${total} transcript:`,
    `"""`,
    chunk,
    `"""`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reduce step: combine all section notes into the final user-facing output.
// ---------------------------------------------------------------------------

export function buildFinalSummaryPrompt({ sectionNotes, language, length, title, channel }) {
  const lang = langName(language);
  const len  = LENGTH_DESCR[length] || LENGTH_DESCR.medium;
  return [
    `You are writing the final summary of a long YouTube video. Below are notes`,
    `from each section of the transcript. Synthesise them into a coherent summary.`,
    ``,
    `Rules:`,
    `- Write in ${lang}.`,
    `- Format: ${len}`,
    `- Markdown: start every section with a "## " subheading, "-" for bullets, **…** for key terms.`,
    `- De-duplicate ideas that repeat across sections; merge them.`,
    `- Be faithful to the notes — do not invent facts.`,
    `- No "In this video…" preamble. Start with the actual content.`,
    ``,
    `Video title: ${title || '(unknown)'}`,
    `Channel: ${channel || '(unknown)'}`,
    ``,
    `Section notes:`,
    `"""`,
    sectionNotes,
    `"""`,
  ].join('\n');
}

export function buildFinalTimestampsPrompt({ candidates, language, title }) {
  const lang = langName(language);
  return [
    `You are picking the most important timestamps for a long YouTube video.`,
    `Below is a list of candidate timestamps gathered from every section of`,
    `the video. Select 10-15 that best represent the whole video.`,
    ``,
    `Rules:`,
    `- Output 10-15 lines. Format: "MM:SS — short description in ${lang}".`,
    `- Use timestamps from the candidates verbatim. Don't invent new times.`,
    `- Translate the descriptions into ${lang}.`,
    `- Order chronologically.`,
    `- No intro line, no closing line.`,
    ``,
    `Video title: ${title || '(unknown)'}`,
    ``,
    `Candidate timestamps:`,
    `"""`,
    candidates,
    `"""`,
  ].join('\n');
}
