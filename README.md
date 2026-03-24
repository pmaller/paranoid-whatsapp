# PARANOID CCA

AI Architectural Judgment Game — Training for Claude Certified Architect (CCA)

## Concept

Paranoid tests your ability to distinguish confident plausibility from actual correctness in AI system design. Each round:

1. Players receive an architectural challenge
2. Everyone submits a solution (80-120 words)
3. An AI-generated saboteur submission with a deliberate flaw is added
4. Players vote to identify the flawed proposal
5. The flaw is revealed with a detailed debrief

## CCA Alignment

The game covers all five CCA domains:

| Domain | Focus |
|--------|-------|
| D1 | System Design |
| D2 | Safety & Alignment |
| D3 | Tool Use & Agents |
| D4 | Evaluation |
| D5 | Deployment & Ops |

## Flaw Types

13 architectural anti-patterns:

- Prompt as policy
- Agent owns recovery
- Tool scope overreach
- Cascade without circuit breaker
- Enforcement in wrong layer
- Schema at wrong boundary
- Context pressure blindness
- Natural language task scope
- Skill without completion contract
- Sub-agent identity leak
- MCP server as trust anchor
- RAG without provenance
- Retrieval as context dump

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in credentials
npm run db:init
npm start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KAPSO_API_KEY` | Kapso API key |
| `KAPSO_PHONE_NUMBER_ID` | WhatsApp phone number ID |
| `DATABASE_URL` | Postgres connection string |
| `ANTHROPIC_API_KEY` | For AI agents |

## Game Flow

### Phase 1: Waiting
- Players join by messaging the bot
- Game starts 15 min after 3rd player (or immediately at 5)

### Phase 2: Submission (30 min)
- Players receive the architectural challenge
- Submit solutions via natural language
- All submissions sanitized for spelling/grammar

### Phase 3: Voting (15 min)
- All submissions displayed with codenames
- Players vote for suspected saboteur
- Votes can be changed until deadline

### Phase 4: Reveal
- Results displayed
- Saboteur identified
- Flaw debrief with CCA domain mapping
- Post-game AI detection check

## Natural Language Interaction

Players interact conversationally:

```
"I want to join"
"Here's my solution: The refund tool should..."
"I think it's Charlie"
"Actually, change my vote to Alpha"
"How much time is left?"
```

## Webhook Setup

Configure Kapso to send webhooks to:
```
https://your-domain.railway.app/webhook
```

Event: "Message received"

## Architecture

```
index.js          — Main bot, game logic, Kapso webhook
db.js             — Database helpers
agents/
  moderator.js    — Natural language intent parsing
  saboteur.js     — Flawed submission generation
  sanitizer.js    — Grammar/spelling fixes, AI detection
schema.sql        — Flaws, scenarios, game state
```

## Credits

Built for Claude Certified Architect preparation.
