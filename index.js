/**
 * PARANOID CCA: WhatsApp Bot
 * AI Architectural Judgment Game
 */

require("dotenv").config();
const express = require("express");
const { WhatsAppClient } = require("@kapso/whatsapp-cloud-api");
const db = require("./db");
const { interpretIntent, generateResponse } = require("./agents/moderator");
const { generateSaboteurSubmission } = require("./agents/saboteur");
const { sanitizeSubmission, detectAiSignals } = require("./agents/sanitizer");

const app = express();
app.use(express.json());

// Kapso WhatsApp client
const whatsapp = new WhatsAppClient({
  baseUrl: "https://api.kapso.ai/meta/whatsapp",
  kapsoApiKey: process.env.KAPSO_API_KEY,
});

const PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID;

const CODENAMES = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"];

// ============ TIMINGS ============
const WAIT_AFTER_3RD = 15 * 60 * 1000; // 15 minutes after 3rd player
const SUBMISSION_TIME = 30 * 60 * 1000; // 30 minutes
const VOTING_TIME = 15 * 60 * 1000; // 15 minutes

// ============ HELPERS ============

async function sendMessage(phone, text) {
  try {
    await whatsapp.messages.sendText({
      phoneNumberId: PHONE_NUMBER_ID,
      to: phone,
      body: text,
    });
    console.log(`Sent to ${phone}: ${text.slice(0, 50)}...`);
  } catch (err) {
    console.error(`Failed to send to ${phone}:`, err.message);
  }
}

async function broadcastToGame(gameId, text, excludePhone = null) {
  const players = await db.getHumanPlayers(gameId);
  for (const player of players) {
    if (player.phone !== excludePhone) {
      await sendMessage(player.phone, text);
    }
  }
}

function formatTimeRemaining(deadline) {
  const remaining = new Date(deadline) - new Date();
  const minutes = Math.ceil(remaining / 60000);
  if (minutes <= 0) return "time's up";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

// ============ GAME PHASES ============

async function startGame(game) {
  console.log(`Starting game ${game.id}`);
  
  const players = await db.getHumanPlayers(game.id);
  
  // Assign codenames
  for (let i = 0; i < players.length; i++) {
    await db.assignCodename(game.id, players[i].phone, CODENAMES[i]);
  }
  
  // Set deadline
  const deadline = new Date(Date.now() + SUBMISSION_TIME);
  await db.updateGamePhase(game.id, "SUBMISSION", deadline);
  
  // Get scenario
  const scenario = await db.getScenario(game.scenario_id);
  
  // Notify players
  const updatedPlayers = await db.getHumanPlayers(game.id);
  for (const player of updatedPlayers) {
    await sendMessage(player.phone, 
`━━━━━━━━━━━━━━━━━━━━
🎮 *PARANOID* — Round Starting

You are *${player.codename}*
Players: ${updatedPlayers.length}

━━━━━━━━━━━━━━━━━━━━
*THE BRIEF*

${game.briefing}

━━━━━━━━━━━━━━━━━━━━
*YOUR TASK*

Submit your architectural solution. Keep it concise — 80-120 words. Focus on the key design decisions.

One submission will be an AI-generated saboteur with a deliberate architectural flaw. After all submissions, you'll vote to identify it.

⏰ ${formatTimeRemaining(deadline)} remaining
━━━━━━━━━━━━━━━━━━━━`);
  }
}

async function transitionToVoting(game) {
  console.log(`Transitioning ${game.id} to voting`);
  
  const humanPlayers = await db.getHumanPlayers(game.id);
  const humanSubmissions = humanPlayers.filter(p => p.submission_clean);
  
  if (humanSubmissions.length < 2) {
    await broadcastToGame(game.id, 
      "Not enough submissions received. Round cancelled. Type 'join' to start a new game.");
    await db.updateGamePhase(game.id, "COMPLETE", null);
    return;
  }
  
  // Sanitize any remaining raw submissions
  for (const player of humanPlayers) {
    if (player.submission_raw && !player.submission_clean) {
      const clean = await sanitizeSubmission(player.submission_raw);
      await db.saveSubmissionClean(game.id, player.phone, clean);
    }
  }
  
  // Get scenario and select flaw
  const scenario = await db.getScenario(game.scenario_id);
  const flaw = await db.getRandomCompatibleFlaw(scenario.compatible_flaws);
  
  // Generate saboteur submission
  const updatedPlayers = await db.getHumanPlayers(game.id);
  const saboteurSubmission = await generateSaboteurSubmission(
    scenario, 
    flaw, 
    updatedPlayers.filter(p => p.submission_clean)
  );
  
  // Find unused codename for saboteur
  const usedCodenames = updatedPlayers.map(p => p.codename);
  const saboteurCodename = CODENAMES.find(c => !usedCodenames.includes(c));
  
  // Add saboteur to game
  await db.addSaboteurPlayer(game.id, saboteurCodename, saboteurSubmission, flaw.id);
  
  // Set voting deadline
  const deadline = new Date(Date.now() + VOTING_TIME);
  await db.updateGamePhase(game.id, "VOTING", deadline);
  
  // Get all submissions (including saboteur)
  const allSubmissions = await db.getSubmissions(game.id);
  
  // Build dossier
  let dossier = `━━━━━━━━━━━━━━━━━━━━
📋 *THE DOSSIER*

${allSubmissions.length} proposals received. One contains a deliberate architectural flaw.

`;

  for (const s of allSubmissions) {
    dossier += `━━━━━━━━━━━━━━━━━━━━
*${s.codename}*

${s.submission_clean}

`;
  }

  dossier += `━━━━━━━━━━━━━━━━━━━━
*VOTE NOW*

Which proposal contains the architectural flaw? Reply with the codename you suspect.

Example: "I think it's Charlie" or "My vote is ALPHA"

⏰ ${formatTimeRemaining(deadline)} remaining
━━━━━━━━━━━━━━━━━━━━`;

  await broadcastToGame(game.id, dossier);
}

async function transitionToReveal(game) {
  console.log(`Revealing ${game.id}`);
  
  const humanPlayers = await db.getHumanPlayers(game.id);
  const voteResults = await db.getVoteResults(game.id);
  const flaw = await db.getFlaw(game.saboteur_flaw_id);
  
  // Record who voted correctly
  await db.recordVoteCorrectness(game.id, game.saboteur_codename);
  
  // Get updated players with vote correctness
  const playersWithResults = await db.getHumanPlayers(game.id);
  
  // Count correct votes
  const correctVotes = playersWithResults.filter(p => p.voted_correctly).length;
  const totalVotes = playersWithResults.filter(p => p.vote_codename).length;
  
  // Build vote display
  const voteDisplay = voteResults.length > 0 
    ? voteResults.map(r => `${r.vote_codename}: ${"█".repeat(parseInt(r.votes))} ${r.votes}`).join("\n")
    : "No votes cast";
  
  // Build reveal message
  const revealMessage = `━━━━━━━━━━━━━━━━━━━━
⚖️ *THE REVEAL*

${voteDisplay}

The saboteur was: *${game.saboteur_codename}*

${correctVotes} of ${totalVotes} players identified the flaw correctly.

━━━━━━━━━━━━━━━━━━━━
*THE FLAW: ${flaw.flaw_type.toUpperCase()}*

${flaw.debrief}

━━━━━━━━━━━━━━━━━━━━
*CCA DOMAIN: ${flaw.cca_domain}*

This pattern is tested in the Claude Certified Architect exam.

Thanks for playing PARANOID. Type 'join' to play again.
━━━━━━━━━━━━━━━━━━━━`;

  // Send personalized results to each player
  for (const player of playersWithResults) {
    const personalResult = player.voted_correctly 
      ? "✓ You correctly identified the saboteur!"
      : player.vote_codename 
        ? `✗ You voted for ${player.vote_codename}, but it was ${game.saboteur_codename}.`
        : "You didn't cast a vote.";
    
    await sendMessage(player.phone, `${personalResult}\n\n${revealMessage}`);
  }
  
  // Check for AI-generated submissions (post-game)
  for (const player of humanPlayers) {
    if (player.submission_raw) {
      const aiCheck = await detectAiSignals(player.submission_raw);
      if (aiCheck.confidence > 0.7 && aiCheck.signals_detected.length >= 2) {
        await db.flagAiSubmission(game.id, player.phone);
        console.log(`Flagged potential AI submission from ${player.codename}: ${aiCheck.reasoning}`);
      }
    }
  }
  
  await db.updateGamePhase(game.id, "COMPLETE", null);
}

// ============ MESSAGE HANDLERS ============

async function handleMessage(phone, text, name) {
  console.log(`Message from ${phone} (${name}): ${text}`);
  
  // Get player's active game
  let game = await db.getActiveGameForPlayer(phone);
  let player = game ? await db.getPlayer(game.id, phone) : null;
  
  // Get valid codenames for intent parsing
  let validCodenames = [];
  if (game) {
    const allPlayers = await db.getPlayers(game.id);
    validCodenames = allPlayers.map(p => p.codename).filter(Boolean);
  }
  
  // Parse intent
  const intent = await interpretIntent(
    text, 
    game?.phase || "NONE", 
    player?.codename,
    validCodenames
  );
  
  console.log(`Intent: ${JSON.stringify(intent)}`);
  
  // Handle based on intent
  switch (intent.intent) {
    case "join":
      await handleJoin(phone, name);
      break;
      
    case "submit":
      if (game?.phase === "SUBMISSION") {
        await handleSubmission(phone, game, text);
      } else if (!game) {
        await sendMessage(phone, "You're not in a game. Reply 'join' to start playing.");
      } else {
        await sendMessage(phone, `Can't submit now — we're in the ${game.phase} phase.`);
      }
      break;
      
    case "vote":
    case "change_vote":
      if (game?.phase === "VOTING") {
        await handleVote(phone, game, intent.data.target_codename);
      } else if (!game) {
        await sendMessage(phone, "You're not in a game. Reply 'join' to start playing.");
      } else {
        await sendMessage(phone, "Voting hasn't started yet. Submit your solution first.");
      }
      break;
      
    case "status":
      await handleStatus(phone, game);
      break;
      
    case "help":
      await handleHelp(phone, game);
      break;
      
    default:
      // Check if it looks like a submission during submission phase
      if (game?.phase === "SUBMISSION" && text.length > 50) {
        await handleSubmission(phone, game, text);
      } else if (!game) {
        await sendMessage(phone, 
          "Welcome to PARANOID — the AI architect judgment game. Reply 'join' to enter the next round.");
      } else {
        const response = await generateResponse(
          `Player in ${game.phase} phase sent unclear message: "${text}". Help them understand what to do next.`
        );
        await sendMessage(phone, response);
      }
  }
}

async function handleJoin(phone, name) {
  // Check if already in a game
  const existingGame = await db.getActiveGameForPlayer(phone);
  if (existingGame) {
    const response = await generateResponse(
      `Player already in game in ${existingGame.phase} phase. Tell them to finish current game first.`
    );
    await sendMessage(phone, response);
    return;
  }
  
  // Find or create waiting game
  let game = await db.getWaitingGame();
  
  if (!game) {
    // Create new game with random scenario
    const scenario = await db.getRandomScenario();
    const gameId = await db.createGame(scenario.id, scenario.briefing);
    game = await db.getGame(gameId);
  }
  
  // Check if game is full
  const playerCount = await db.countPlayers(game.id);
  if (playerCount >= 5) {
    // Create new game
    const scenario = await db.getRandomScenario();
    const gameId = await db.createGame(scenario.id, scenario.briefing);
    game = await db.getGame(gameId);
  }
  
  // Register player
  const registered = await db.registerPlayer(game.id, phone, name);
  if (!registered) {
    await sendMessage(phone, "You're already in this game. Waiting for more players...");
    return;
  }
  
  const newCount = await db.countPlayers(game.id);
  
  if (newCount === 3) {
    // Set start timer
    const startAt = new Date(Date.now() + WAIT_AFTER_3RD);
    await db.setGameStartTime(game.id, startAt);
    
    await broadcastToGame(game.id,
`━━━━━━━━━━━━━━━━━━━━
⏳ *3 PLAYERS JOINED*

Game starts in 15 minutes.
Up to 2 more players can join.
━━━━━━━━━━━━━━━━━━━━`);
  } else if (newCount > 3 && newCount < 5) {
    await sendMessage(phone, `You're in. ${newCount} players now. Game starts soon.`);
  } else if (newCount >= 5) {
    // Start immediately at max
    await startGame(game);
  } else {
    await sendMessage(phone, `You're in. Waiting for ${3 - newCount} more player${3 - newCount > 1 ? 's' : ''} to start.`);
  }
}

async function handleSubmission(phone, game, text) {
  const player = await db.getPlayer(game.id, phone);
  
  if (player.submission_raw) {
    await sendMessage(phone, "You've already submitted. Your solution is locked in.");
    return;
  }
  
  if (text.length < 50) {
    await sendMessage(phone, "That's quite short. Give us 80-120 words on your architectural approach.");
    return;
  }
  
  // Save raw submission
  await db.saveSubmissionRaw(game.id, phone, text);
  
  // Sanitize immediately
  const clean = await sanitizeSubmission(text);
  await db.saveSubmissionClean(game.id, phone, clean);
  
  await sendMessage(phone, `Got it, ${player.codename}. Your solution is recorded. Waiting for others...`);
  
  // Check if all submitted
  const submitted = await db.countSubmissions(game.id);
  const total = await db.countPlayers(game.id);
  
  // Notify progress
  await broadcastToGame(game.id, 
    `${submitted} of ${total} solutions received.`,
    phone  // exclude the submitter
  );
  
  if (submitted >= total) {
    await transitionToVoting(game);
  }
}

async function handleVote(phone, game, targetCodename) {
  const player = await db.getPlayer(game.id, phone);
  
  if (!targetCodename) {
    await sendMessage(phone, "I didn't catch which codename you're voting for. Try again?");
    return;
  }
  
  const normalizedTarget = targetCodename.toUpperCase();
  
  // Validate target exists
  const target = await db.getPlayerByCodename(game.id, normalizedTarget);
  if (!target) {
    const allPlayers = await db.getPlayers(game.id);
    const validCodenames = allPlayers.map(p => p.codename).join(", ");
    await sendMessage(phone, `${normalizedTarget} isn't in this game. Valid options: ${validCodenames}`);
    return;
  }
  
  // Can't vote for self
  if (normalizedTarget === player.codename) {
    await sendMessage(phone, "You can't vote for yourself. Pick another codename.");
    return;
  }
  
  const previousVote = player.vote_codename;
  await db.saveVote(game.id, phone, normalizedTarget);
  
  if (previousVote) {
    await sendMessage(phone, `Changed your vote from ${previousVote} to ${normalizedTarget}. Locked in.`);
  } else {
    await sendMessage(phone, `Vote recorded: ${normalizedTarget}. You can change it until time runs out.`);
  }
  
  // Check if all voted
  const voted = await db.countVotes(game.id);
  const total = await db.countPlayers(game.id);
  
  if (voted >= total) {
    await transitionToReveal(game);
  }
}

async function handleStatus(phone, game) {
  if (!game) {
    await sendMessage(phone, "You're not in a game. Reply 'join' to start playing.");
    return;
  }
  
  const playerCount = await db.countPlayers(game.id);
  
  switch (game.phase) {
    case "WAITING":
      await sendMessage(phone, `Waiting for players: ${playerCount}/3 minimum. ${game.start_at ? `Starting at ${new Date(game.start_at).toLocaleTimeString()}.` : ''}`);
      break;
      
    case "SUBMISSION":
      const submitted = await db.countSubmissions(game.id);
      await sendMessage(phone, `Submission phase. ${submitted}/${playerCount} received. ${formatTimeRemaining(game.deadline)} left.`);
      break;
      
    case "VOTING":
      const voted = await db.countVotes(game.id);
      await sendMessage(phone, `Voting phase. ${voted}/${playerCount} votes in. ${formatTimeRemaining(game.deadline)} left.`);
      break;
      
    default:
      await sendMessage(phone, `Game is in ${game.phase} phase.`);
  }
}

async function handleHelp(phone, game) {
  if (!game) {
    await sendMessage(phone, 
`*PARANOID* — AI Architect Judgment Game

Test your ability to spot flawed AI architecture. Each round:

1. You receive an architectural challenge
2. Everyone submits a solution
3. One AI-generated saboteur submission is added
4. Vote to identify the flawed proposal
5. Learn what the flaw was

Reply 'join' to play.`);
    return;
  }
  
  switch (game.phase) {
    case "WAITING":
      await sendMessage(phone, "Waiting for more players. You'll receive the challenge once we start.");
      break;
      
    case "SUBMISSION":
      await sendMessage(phone, "Submit your architectural solution to the brief. 80-120 words. Focus on the key design decisions.");
      break;
      
    case "VOTING":
      await sendMessage(phone, "Read the proposals. One has a deliberate flaw. Reply with the codename you suspect (e.g., 'I think it's CHARLIE').");
      break;
      
    default:
      await sendMessage(phone, `Game is in ${game.phase} phase. Reply 'join' for a new game.`);
  }
}

// ============ WEBHOOK ENDPOINT ============

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    
    console.log("Webhook received:", JSON.stringify(body, null, 2));
    
    // Handle Kapso v2 format
    if (body.message && body.message.type === "text") {
      const phone = body.message.from;
      const text = body.message.text?.body || body.message.content;
      const name = body.conversation?.contact_name || "Player";
      
      await handleMessage(phone, text, name);
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("PARANOID CCA Bot running");
});

// ============ SCHEDULER ============

setInterval(async () => {
  try {
    // Check for games ready to start
    const startingGames = await db.getGamesStartingSoon();
    for (const game of startingGames) {
      const playerCount = await db.countPlayers(game.id);
      if (playerCount >= 3) {
        await startGame(game);
      } else {
        // Not enough players, cancel
        await broadcastToGame(game.id, "Not enough players joined. Game cancelled. Reply 'join' to try again.");
        await db.updateGamePhase(game.id, "COMPLETE", null);
      }
    }
    
    // Check for phase deadlines
    const expiredGames = await db.getGamesWithDeadline();
    for (const game of expiredGames) {
      switch (game.phase) {
        case "SUBMISSION":
          await transitionToVoting(game);
          break;
        case "VOTING":
          await transitionToReveal(game);
          break;
      }
    }
  } catch (err) {
    console.error("Scheduler error:", err);
  }
}, 30000); // Check every 30 seconds

// ============ STARTUP ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PARANOID CCA Bot running on port ${PORT}`);
});
