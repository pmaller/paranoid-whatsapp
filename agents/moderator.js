/**
 * PARANOID CCA: Moderator Agent
 * Interprets natural language player input
 */

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();

/**
 * Interprets player intent from natural language
 * Returns: { intent, data, confidence }
 */
async function interpretIntent(message, gamePhase, playerCodename, validCodenames) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are interpreting player input for a game. The game is currently in the ${gamePhase} phase.
${playerCodename ? `The player's codename is ${playerCodename}.` : ""}
${validCodenames?.length ? `Valid codenames in this game: ${validCodenames.join(", ")}` : ""}

Player message: "${message}"

Determine the player's intent. Respond with ONLY a JSON object (no markdown, no explanation):

{
  "intent": "join" | "submit" | "vote" | "change_vote" | "status" | "help" | "unclear",
  "data": {
    // For "vote" or "change_vote": "target_codename": "ALPHA" (extracted codename)
    // For "submit": "submission": "the full text they submitted"
  },
  "confidence": 0.0-1.0
}

Intent definitions:
- "join": Player wants to join/start a game (mentions ready, join, play, start)
- "submit": Player is submitting their solution/answer (in SUBMISSION phase, message is substantive)
- "vote": Player is casting a vote for who they think is the saboteur
- "change_vote": Player explicitly wants to change their previous vote
- "status": Player asking about game state, time remaining, who voted
- "help": Player confused, asking what to do
- "unclear": Cannot determine intent

For votes, extract the codename they're voting for. Accept variations like "I think it's Charlie", "My vote is BRAVO", "Definitely Alpha".`
      },
    ],
  });

  try {
    const text = response.content[0].text.trim();
    return JSON.parse(text);
  } catch (err) {
    return { intent: "unclear", data: {}, confidence: 0 };
  }
}

/**
 * Generates conversational responses
 */
async function generateResponse(context, tone = "friendly") {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate a brief, ${tone} response for a game moderator bot.

Context: ${context}

Keep it under 50 words. Be conversational, not robotic. No emojis except sparingly.`
      },
    ],
  });

  return response.content[0].text.trim();
}

module.exports = {
  interpretIntent,
  generateResponse,
};
