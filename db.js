/**
 * PARANOID CCA: Database Helpers
 */

const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  return pool.query(text, params);
}

// ============ FLAWS ============

async function getFlaw(flawId) {
  const result = await query(`SELECT * FROM flaws WHERE id = $1`, [flawId]);
  return result.rows[0];
}

async function getRandomCompatibleFlaw(compatibleFlaws) {
  const placeholders = compatibleFlaws.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query(
    `SELECT * FROM flaws WHERE id IN (${placeholders}) ORDER BY RANDOM() LIMIT 1`,
    compatibleFlaws
  );
  return result.rows[0];
}

// ============ SCENARIOS ============

async function getRandomScenario() {
  const result = await query(`SELECT * FROM scenarios ORDER BY RANDOM() LIMIT 1`);
  return result.rows[0];
}

async function getScenario(scenarioId) {
  const result = await query(`SELECT * FROM scenarios WHERE id = $1`, [scenarioId]);
  return result.rows[0];
}

// ============ GAMES ============

async function createGame(scenarioId, briefing) {
  const id = `game-${uuidv4().slice(0, 8)}`;
  await query(
    `INSERT INTO games (id, scenario_id, briefing, phase) VALUES ($1, $2, $3, 'WAITING')`,
    [id, scenarioId, briefing]
  );
  return id;
}

async function getGame(gameId) {
  const result = await query(`SELECT * FROM games WHERE id = $1`, [gameId]);
  return result.rows[0];
}

async function getWaitingGame() {
  const result = await query(
    `SELECT * FROM games WHERE phase = 'WAITING' ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0];
}

async function getActiveGameForPlayer(phone) {
  const result = await query(
    `SELECT g.* FROM games g
     JOIN players p ON p.game_id = g.id
     WHERE p.phone = $1 AND g.phase != 'COMPLETE'
     ORDER BY g.created_at DESC LIMIT 1`,
    [phone]
  );
  return result.rows[0];
}

async function updateGamePhase(gameId, phase, deadline = null) {
  await query(
    `UPDATE games SET phase = $1, deadline = $2, updated_at = NOW() WHERE id = $3`,
    [phase, deadline, gameId]
  );
}

async function setGameStartTime(gameId, startAt) {
  await query(
    `UPDATE games SET start_at = $1, updated_at = NOW() WHERE id = $2`,
    [startAt, gameId]
  );
}

async function setSaboteur(gameId, codename, flawId) {
  await query(
    `UPDATE games SET saboteur_codename = $1, saboteur_flaw_id = $2, updated_at = NOW() WHERE id = $3`,
    [codename, flawId, gameId]
  );
}

async function getGamesStartingSoon() {
  const result = await query(
    `SELECT * FROM games WHERE phase = 'WAITING' AND start_at IS NOT NULL AND start_at <= NOW()`
  );
  return result.rows;
}

async function getGamesWithDeadline() {
  const result = await query(
    `SELECT * FROM games WHERE phase NOT IN ('WAITING', 'COMPLETE') AND deadline IS NOT NULL AND deadline <= NOW()`
  );
  return result.rows;
}

// ============ PLAYERS ============

async function registerPlayer(gameId, phone, name) {
  const id = `player-${uuidv4().slice(0, 8)}`;
  const result = await query(
    `INSERT INTO players (id, game_id, phone, name) 
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (game_id, phone) DO NOTHING
     RETURNING id`,
    [id, gameId, phone, name]
  );
  return result.rows[0]?.id;
}

async function getPlayer(gameId, phone) {
  const result = await query(
    `SELECT * FROM players WHERE game_id = $1 AND phone = $2`,
    [gameId, phone]
  );
  return result.rows[0];
}

async function getPlayerByCodename(gameId, codename) {
  const result = await query(
    `SELECT * FROM players WHERE game_id = $1 AND UPPER(codename) = UPPER($2)`,
    [gameId, codename]
  );
  return result.rows[0];
}

async function getPlayers(gameId) {
  const result = await query(
    `SELECT * FROM players WHERE game_id = $1 ORDER BY created_at`,
    [gameId]
  );
  return result.rows;
}

async function getHumanPlayers(gameId) {
  const result = await query(
    `SELECT * FROM players WHERE game_id = $1 AND is_saboteur = FALSE ORDER BY created_at`,
    [gameId]
  );
  return result.rows;
}

async function countPlayers(gameId) {
  const result = await query(
    `SELECT COUNT(*) as count FROM players WHERE game_id = $1 AND is_saboteur = FALSE`,
    [gameId]
  );
  return parseInt(result.rows[0].count);
}

async function assignCodename(gameId, phone, codename) {
  await query(
    `UPDATE players SET codename = $1 WHERE game_id = $2 AND phone = $3`,
    [codename, gameId, phone]
  );
}

// ============ SUBMISSIONS ============

async function saveSubmissionRaw(gameId, phone, text) {
  await query(
    `UPDATE players SET submission_raw = $1 WHERE game_id = $2 AND phone = $3`,
    [text, gameId, phone]
  );
}

async function saveSubmissionClean(gameId, phone, text) {
  await query(
    `UPDATE players SET submission_clean = $1 WHERE game_id = $2 AND phone = $3`,
    [text, gameId, phone]
  );
}

async function addSaboteurPlayer(gameId, codename, submissionClean, flawId) {
  const id = `player-saboteur-${uuidv4().slice(0, 8)}`;
  await query(
    `INSERT INTO players (id, game_id, phone, codename, is_saboteur, submission_clean)
     VALUES ($1, $2, 'SABOTEUR', $3, TRUE, $4)`,
    [id, gameId, codename, submissionClean]
  );
  await setSaboteur(gameId, codename, flawId);
}

async function countSubmissions(gameId) {
  const result = await query(
    `SELECT COUNT(*) as count FROM players 
     WHERE game_id = $1 AND submission_raw IS NOT NULL AND is_saboteur = FALSE`,
    [gameId]
  );
  return parseInt(result.rows[0].count);
}

async function getSubmissions(gameId) {
  const result = await query(
    `SELECT codename, submission_clean FROM players 
     WHERE game_id = $1 AND submission_clean IS NOT NULL
     ORDER BY codename`,
    [gameId]
  );
  return result.rows;
}

// ============ VOTES ============

async function saveVote(gameId, phone, targetCodename) {
  await query(
    `UPDATE players SET vote_codename = $1 WHERE game_id = $2 AND phone = $3`,
    [targetCodename, gameId, phone]
  );
}

async function countVotes(gameId) {
  const result = await query(
    `SELECT COUNT(*) as count FROM players 
     WHERE game_id = $1 AND vote_codename IS NOT NULL AND is_saboteur = FALSE`,
    [gameId]
  );
  return parseInt(result.rows[0].count);
}

async function getVoteResults(gameId) {
  const result = await query(
    `SELECT vote_codename, COUNT(*) as votes 
     FROM players 
     WHERE game_id = $1 AND vote_codename IS NOT NULL AND is_saboteur = FALSE
     GROUP BY vote_codename
     ORDER BY votes DESC`,
    [gameId]
  );
  return result.rows;
}

async function recordVoteCorrectness(gameId, saboteurCodename) {
  await query(
    `UPDATE players SET voted_correctly = (vote_codename = $1)
     WHERE game_id = $2 AND is_saboteur = FALSE`,
    [saboteurCodename, gameId]
  );
}

async function flagAiSubmission(gameId, phone) {
  await query(
    `UPDATE players SET flagged_ai = TRUE WHERE game_id = $1 AND phone = $2`,
    [gameId, phone]
  );
}

module.exports = {
  query,
  // Flaws
  getFlaw,
  getRandomCompatibleFlaw,
  // Scenarios
  getRandomScenario,
  getScenario,
  // Games
  createGame,
  getGame,
  getWaitingGame,
  getActiveGameForPlayer,
  updateGamePhase,
  setGameStartTime,
  setSaboteur,
  getGamesStartingSoon,
  getGamesWithDeadline,
  // Players
  registerPlayer,
  getPlayer,
  getPlayerByCodename,
  getPlayers,
  getHumanPlayers,
  countPlayers,
  assignCodename,
  // Submissions
  saveSubmissionRaw,
  saveSubmissionClean,
  addSaboteurPlayer,
  countSubmissions,
  getSubmissions,
  // Votes
  saveVote,
  countVotes,
  getVoteResults,
  recordVoteCorrectness,
  flagAiSubmission,
};
