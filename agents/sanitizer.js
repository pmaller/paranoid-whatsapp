/**
 * PARANOID CCA: Sanitizer Agent
 * Fixes spelling/grammar without changing content
 */

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();

/**
 * Sanitizes a submission - fixes spelling/grammar only
 */
async function sanitizeSubmission(text) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-3-5-20241022",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Fix only spelling and grammar errors in the following text. 

RULES:
- Do NOT change word choice
- Do NOT change sentence structure
- Do NOT change tone
- Do NOT add or remove content
- Do NOT improve clarity or flow
- ONLY fix typos, spelling errors, and grammar mistakes

Return ONLY the corrected text, nothing else.

TEXT:
${text}`
      },
    ],
  });

  return response.content[0].text.trim();
}

/**
 * Checks if a submission appears AI-generated
 * Returns signals but does not make final determination
 */
async function detectAiSignals(text) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Analyze this submission for signs it may be AI-generated. This is for a timed architectural design exercise.

SUBMISSION:
${text}

Check for these signals:
1. Over-structured formatting (excessive headers, bullet hierarchies)
2. Hedging language ("It's important to consider...", "One approach might be...")
3. Kitchen-sink coverage (answering questions that weren't asked)
4. Balanced false tradeoffs ("On one hand... on the other hand...")
5. Suspiciously polished grammar for a timed response
6. Generic best-practice recitation without specific application

Respond with ONLY a JSON object:
{
  "signals_detected": ["signal1", "signal2"],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`
      },
    ],
  });

  try {
    return JSON.parse(response.content[0].text.trim());
  } catch (err) {
    return { signals_detected: [], confidence: 0, reasoning: "parse error" };
  }
}

module.exports = {
  sanitizeSubmission,
  detectAiSignals,
};
