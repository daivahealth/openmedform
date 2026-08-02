/**
 * A single narrow question asked of the vision model BEFORE the main
 * conversion: "what table structures are on these pages?"
 *
 * WHY SEPARATE — every deterministic structural hint the pipeline has comes
 * from HTML markup. A PDF or image gets none of them, so a scanned cannula-style
 * matrix converts on prompt rules alone and lands strictly less reliably than
 * the same form as HTML. There is no markup to parse here, so the page itself
 * has to be asked — but asked one small, checkable question rather than being
 * handed the whole job at once. A narrow question with a strict reply schema is
 * far more reliable than the same judgement made in passing while generating a
 * complete form, and its answer can be validated before anything depends on it.
 *
 * The reply feeds the SAME hint paragraphs the HTML detectors produce, so
 * nothing downstream changes.
 *
 * Prompts live here rather than inline in service code, per the AI Builder
 * rules.
 */
export function getStructureProbePrompt(): string {
  return `You are a document layout analyst. You are shown page images of a printed clinical form. Identify ONLY its repeating table structures. You are NOT converting the form and NOT listing its fields.

Reply with JSON and nothing else:

{
  "tables": [
    {
      "kind": "matrix" | "log",
      "page": <1-based page number>,
      "labelHeader": "<matrix only: heading over the left-hand label column, e.g. 'Parameter'>",
      "rowLabels": ["<matrix only: every row label down the left column, in printed order>"],
      "instanceHeaders": ["<matrix only: the heading of each record column, e.g. 'Cannula 1'>"],
      "columns": ["<log only: every column heading, in printed order>"],
      "addLabel": "<text of an add/new control if one is printed, else omit>",
      "confidence": <0..1>
    }
  ]
}

WHICH SHAPE IS WHICH — decide by what runs down the FIRST column:
- "matrix": the first column holds FIELD NAMES ("Date of Insertion", "Site", "Side") and each remaining column is one record instance ("Cannula 1", "Cannula 2"). Fields run DOWN, records run ACROSS.
- "log": the top row holds FIELD NAMES and each body row is one record ("Date | Time | Score | Signature", with blank rows to fill in). Fields run ACROSS, records run DOWN.

RULES
- Report a table ONLY if you can actually read its headings on the page. Never guess a label you cannot see; leave the table out instead.
- "rowLabels" must be the COMPLETE list, in printed order, with the exact printed wording (keep the source language). A partial list is worse than none.
- An instance heading ("Cannula 1", "Patient 2", "Visit A") is NOT a field name and must never appear in "rowLabels" or "columns".
- A static reference table — a dosing guide, a score legend, printed text with nothing to fill in — is NOT a matrix and NOT a log. Leave it out.
- If the form has no repeating table at all, reply exactly {"tables": []}. That is a normal and useful answer; do not invent one.
- "confidence" is your own reading confidence for that table: 1 means the headings are crisp and unambiguous, below 0.5 means you are unsure.
- Output raw JSON only. No prose, no markdown fences.`;
}
