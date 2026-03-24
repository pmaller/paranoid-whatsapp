/**
 * PARANOID CCA: Saboteur Agent
 * Generates flawed architectural submissions
 */

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();

/**
 * Generates a flawed submission for the saboteur
 */
async function generateSaboteurSubmission(scenario, flaw, humanSubmissions) {
  // Sample human submissions for style matching (anonymized)
  const styleExamples = humanSubmissions
    .slice(0, 2)
    .map((s, i) => `Example ${i + 1}: "${s.submission_clean?.slice(0, 200)}..."`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are generating a FLAWED architectural solution for a game. Your submission should look professional and convincing but contain a specific architectural anti-pattern that sharp readers can detect.

SCENARIO:
${scenario.briefing}

FLAW TO EMBED: ${flaw.flaw_type}
${flaw.description}

DETECTION SIGNALS (what reveals the flaw):
${flaw.detection_signal}

${styleExamples ? `MATCH THIS STYLE (human submissions):\n${styleExamples}\n` : ""}

Write a 80-120 word architectural solution that:
1. Sounds professional and confident
2. Uses appropriate technical language
3. Contains the specified flaw SUBTLY but detectably
4. Does NOT explicitly mention the flaw or hint at it being wrong
5. Matches the length and style of human submissions

The goal is to fool casual readers but reward careful architectural analysis.

Respond with ONLY the submission text, no preamble or explanation.`
      },
    ],
  });

  return response.content[0].text.trim();
}

module.exports = {
  generateSaboteurSubmission,
};
