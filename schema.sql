-- PARANOID CCA: Database Schema

-- Flaws library
CREATE TABLE IF NOT EXISTS flaws (
  id TEXT PRIMARY KEY,
  flaw_type TEXT NOT NULL,
  cca_domain TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  description TEXT NOT NULL,
  detection_signal TEXT NOT NULL,
  debrief TEXT NOT NULL
);

-- Scenarios library  
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  briefing TEXT NOT NULL,
  good_signals TEXT NOT NULL,
  compatible_flaws TEXT[] NOT NULL
);

-- Games
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  scenario_id TEXT REFERENCES scenarios(id),
  phase TEXT NOT NULL DEFAULT 'WAITING',
  briefing TEXT,
  start_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  saboteur_codename TEXT,
  saboteur_flaw_id TEXT REFERENCES flaws(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  codename TEXT,
  is_saboteur BOOLEAN DEFAULT FALSE,
  submission_raw TEXT,
  submission_clean TEXT,
  vote_codename TEXT,
  voted_correctly BOOLEAN,
  flagged_ai BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, phone)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_phase ON games(phase);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_phone ON players(phone);

-- Seed flaws
INSERT INTO flaws (id, flaw_type, cca_domain, difficulty, description, detection_signal, debrief) VALUES

('FLAW-001', 'Prompt as policy', 'D2', 2,
'Critical constraints placed in system prompt or CLAUDE.md instead of programmatic enforcement. Relies on LLM instruction-following for must-never behaviors.',
'Phrases like "instruct the model to never...", "the system prompt prohibits...", "Claude is told not to..." for hard constraints that require guaranteed enforcement.',
'This flaw places trust in instruction-following for constraints that must be guaranteed. LLMs are probabilistic — they can be jailbroken, confused by long context, or simply fail to follow instructions under edge cases. Hard constraints (spending limits, PII access, delete operations) must be enforced programmatically at a gate before the LLM can even attempt the action. The system prompt is for behavioral guidance, not security policy. CCA Domain D2 emphasizes that safety boundaries must be architecturally enforced, not prompt-requested.'),

('FLAW-002', 'Agent owns recovery', 'D3', 3,
'Error handling and recovery logic delegated to the LLM reasoning instead of the orchestrator or programmatic layer. Agent decides when to retry, escalate, or fail.',
'"The agent determines whether to retry...", "Claude decides if the error is recoverable...", "the model handles exceptions by..."',
'Error recovery is a deterministic concern. When a tool call fails, the decision tree (retry? escalate? abort? notify?) should be owned by the orchestrator with explicit logic, not delegated to LLM reasoning. Agents make poor reliability engineers — they may hallucinate recovery paths, retry infinitely, or fail silently. The orchestrator must own the failure boundary. CCA Domain D3 requires that agent scope be bounded to reasoning tasks, not infrastructure concerns.'),

('FLAW-003', 'Tool scope overreach', 'D3', 2,
'Tool granted broader permissions than the specific task requires. A tool that could be scoped to read-only is given write access; a tool scoped to one table has access to many.',
'Tools with generic names ("database_access", "file_manager"), tools that can "read or write" when task only requires read, broad resource access patterns.',
'Principle of least privilege applies to LLM tool design even more strictly than traditional systems. An LLM might be manipulated, confused, or simply make mistakes — the blast radius of any error is bounded by tool permissions. A refund tool should only access refund-eligible orders, not all orders. A lookup tool should be read-only. CCA Domain D3 emphasizes that tool boundaries are the primary security perimeter in agentic systems.'),

('FLAW-004', 'Cascade without circuit breaker', 'D5', 3,
'Multi-agent pipeline where failure in one agent propagates unchecked to downstream agents. No rejection boundary, no failure isolation, no graceful degradation.',
'Linear pipelines where "Agent A passes to Agent B passes to Agent C" with no mention of failure handling between stages, no validation of intermediate outputs.',
'Multi-agent systems need failure boundaries between stages. If Agent A produces malformed output, Agent B should not blindly process it and pass garbage to Agent C. Each boundary needs validation, and the system needs a circuit breaker — a point where repeated failures trigger graceful degradation rather than infinite retry or silent corruption. CCA Domain D5 requires production systems to have observable failure modes and bounded blast radius.'),

('FLAW-005', 'Enforcement in wrong layer', 'D1', 4,
'Compliance or business logic constraint placed inside the LLM reasoning layer when it should be at a programmatic gate, or vice versa — programmatic rigidity where LLM judgment is appropriate.',
'"Claude checks if the user is authorized...", "the model validates the transaction amount...", or conversely, hard-coded rules for nuanced judgment calls.',
'Layer assignment is the core architectural skill. Authorization, rate limits, amount thresholds — these are programmatic. Tone judgment, ambiguity resolution, intent classification — these are LLM. Mixing them creates either security holes (LLM doing auth) or brittleness (code doing nuance). CCA Domain D1 tests whether you can identify the correct enforcement layer for each constraint type.'),

('FLAW-006', 'Schema at wrong boundary', 'D1', 3,
'Input validation or schema enforcement happens after the trust boundary instead of at input. Malformed data enters the system and is caught (or not) downstream.',
'"The agent parses the input and checks if...", "downstream processing validates...", validation logic described after data has already been passed to the LLM.',
'Validate at the boundary, not inside the house. If user input can be malformed, validate before it reaches the LLM. If a tool returns structured data, validate the schema before passing to the next stage. Downstream validation means malformed data has already traveled through your system, potentially triggering errors, hallucinations, or exploits along the way. CCA Domain D1 emphasizes that trust boundaries must have explicit schema contracts.'),

('FLAW-007', 'Context pressure blindness', 'D4', 4,
'Architecture assumes instructions or constraints persist reliably across long context windows. No consideration for instruction degradation as context grows.',
'Long conversation designs where "the system prompt ensures..." is expected to hold after thousands of tokens, no mention of instruction refresh or context management.',
'Instructions degrade under context pressure. A constraint clearly stated in the system prompt may be effectively forgotten after 50K tokens of conversation. Production architectures must account for this: summarization checkpoints, instruction refresh, context windowing, or architectural boundaries that reset context. CCA Domain D4 requires that systems be evaluated under realistic context loads, not just short test cases.'),

('FLAW-008', 'Natural language task scope', 'D3', 3,
'Subagent or tool receives open-ended natural language instructions instead of a bounded, structured task object. Scope creep and misinterpretation become likely.',
'"The orchestrator asks the subagent to...", "Claude is instructed to handle the refund", passing prose instructions rather than structured payloads with explicit fields.',
'Agents should receive structured task objects, not prose instructions. "Handle this refund" is ambiguous — what is the order ID? What is the max amount? What is the customer context? Structured inputs bound the task explicitly: { order_id: "123", max_refund_cents: 5000, reason_codes: ["damaged", "late"] }. Natural language task delegation is how scope creep and misalignment enter multi-agent systems. CCA Domain D3 requires explicit task boundaries for subagents.'),

('FLAW-009', 'Skill without completion contract', 'D3', 3,
'A skill or capability is defined without explicit success/failure criteria. The orchestrator cannot determine if the skill completed correctly, partially, or failed.',
'Skills that "try to" or "attempt to" without defined outcomes, no mention of return schema, success criteria described in prose rather than contract.',
'Every skill needs a completion contract: what does success look like? What does failure look like? What is the return schema? Without this, the orchestrator is flying blind — it cannot distinguish a successful action from a silent failure or partial completion. Skills must return structured outcomes that the orchestrator can programmatically evaluate. CCA Domain D3 requires that agent capabilities have explicit, verifiable completion criteria.'),

('FLAW-010', 'Sub-agent identity leak', 'D2', 3,
'Sub-agent inherits the full context, permissions, or identity of the parent agent when it should operate in a sandboxed scope with limited context.',
'"The sub-agent has access to the full conversation...", "inherits the user permissions...", no mention of context filtering or permission scoping for delegated tasks.',
'Sub-agents should receive minimum necessary context, not the full parent state. If the main agent delegates a task to a specialist sub-agent, that sub-agent should not see the entire conversation history, user PII, or have the parent full permissions. Context should be filtered to the task; permissions should be scoped to required actions. Identity leak is how prompt injection and data exfiltration propagate through multi-agent systems. CCA Domain D2 emphasizes isolation boundaries between agents.'),

('FLAW-011', 'MCP server as trust anchor', 'D3', 4,
'External MCP server output is treated as trusted without validation. Data returned from MCP tools is passed directly to downstream processing or user output without schema validation or content checks.',
'"The MCP server returns the data which is then...", no mention of validating MCP responses, treating external tool output as authoritative.',
'MCP servers are external dependencies — their output crosses a trust boundary. Data returned from an MCP tool should be validated (schema check), sanitized (if rendered to users), and bounded (size limits, content filtering). Treating MCP output as trusted is like trusting arbitrary API responses — it opens injection vectors and data corruption paths. CCA Domain D3 requires that external tool boundaries include validation gates.'),

('FLAW-012', 'RAG without provenance', 'D4', 3,
'Retrieved context is injected into the prompt without tracking which chunks were used for which claims. No ability to audit, verify, or debug the retrieval-to-response pipeline.',
'"Relevant documents are added to the context...", no mention of chunk IDs, citation tracking, or provenance metadata. Response generation without retrieval attribution.',
'RAG systems must maintain provenance — which retrieved chunks influenced which parts of the response. Without this, you cannot audit accuracy, debug hallucinations, or verify that the model actually used the retrieved content. Production RAG needs chunk IDs attached to context, citation tracking in outputs, and logging that connects claims to sources. CCA Domain D4 requires that retrieval-augmented systems be evaluable and auditable.'),

('FLAW-013', 'Retrieval as context dump', 'D1', 3,
'RAG retrieval dumps all potentially relevant chunks into context without relevance filtering, deduplication, or prioritization. Context window filled with marginally relevant or redundant content.',
'"Top 20 chunks are retrieved and added...", no mention of relevance threshold, reranking, deduplication, or context budget management.',
'Retrieval is not a firehose. Dumping everything above a low similarity threshold into context degrades response quality — the model struggles to identify what is actually relevant, context pressure increases, and instruction-following degrades. Production RAG needs relevance thresholds, reranking, deduplication, and context budget management. More context is not better context. CCA Domain D1 emphasizes that retrieval architecture must be selective, not exhaustive.')

ON CONFLICT (id) DO NOTHING;

-- Seed scenarios
INSERT INTO scenarios (id, title, briefing, good_signals, compatible_flaws) VALUES

('SCENARIO-001', 'Refund Agent Boundary',
'Your team is building a customer support system with an AI agent that can process refunds. The agent has access to order history and can initiate refunds up to $500 without human approval.

Design the architecture for the refund capability. Specifically: How does the agent access order data? How is the $500 limit enforced? What happens when a refund fails?',
'$500 limit enforced programmatically before tool execution; Refund tool scoped to specific order (not broad database access); Orchestrator owns retry/escalation logic; Clear boundary between what agent decides (eligibility reasoning) vs. what system enforces (amount cap)',
ARRAY['FLAW-001', 'FLAW-002', 'FLAW-003', 'FLAW-005', 'FLAW-009']),

('SCENARIO-002', 'Multi-Agent Document Pipeline',
'You are designing a document processing pipeline with three specialized agents: Extractor (pulls data from PDFs), Validator (checks data quality), and Writer (generates summary reports).

Design the handoff architecture between these agents. How does data flow? What happens if Extractor produces malformed output? How do you ensure Writer receives clean data?',
'Schema validation between each agent boundary; Circuit breaker / failure boundary between stages; Structured data contracts (not prose handoffs); Explicit handling of malformed intermediate outputs',
ARRAY['FLAW-004', 'FLAW-006', 'FLAW-008', 'FLAW-010']),

('SCENARIO-003', 'Long-Running Advisory Session',
'Your financial services client wants an AI advisor that maintains context across hour-long sessions. Users discuss portfolio changes, ask questions, and may return to earlier topics. The advisor must never provide specific buy/sell recommendations (regulatory constraint).

Design the architecture for context management and compliance. How do you maintain coherent long sessions? How do you ensure the regulatory constraint holds throughout?',
'Regulatory constraint enforced at output gate, not just system prompt; Context management strategy (summarization, windowing, checkpoints); Recognition that instruction persistence degrades over long context; Separation of compliance enforcement from conversational guidance',
ARRAY['FLAW-001', 'FLAW-005', 'FLAW-007']),

('SCENARIO-004', 'Tool-Using Research Agent',
'You are building a research agent that can search the web, read documents, and write analysis reports. It will be used by analysts who give it open-ended research questions.

Design the tool architecture. What tools does the agent have access to? How are they scoped? How do you prevent the agent from taking unintended actions (e.g., posting content, making purchases if it lands on e-commerce sites)?',
'Read-only tools for web/document access; No write capabilities unless explicitly required and scoped; Tool boundaries prevent action creep (cannot click buy buttons); Clear distinction between information retrieval and action execution',
ARRAY['FLAW-003', 'FLAW-005', 'FLAW-008', 'FLAW-011']),

('SCENARIO-005', 'Customer Intake Classifier',
'Your support system needs an intake classifier that routes incoming customer messages to the right team: Billing, Technical, Sales, or Escalation. Messages marked Escalation go to human supervisors immediately.

Design the classification and routing architecture. How does the classifier work? How do you ensure urgent/sensitive messages reliably reach Escalation? What validation exists on the routing decision?',
'LLM handles classification (appropriate for judgment task); Routing decision validated/logged before execution; Sensitive keyword detection as programmatic backstop (not just LLM judgment); Clear escalation criteria that do not rely solely on model interpretation',
ARRAY['FLAW-001', 'FLAW-005', 'FLAW-006', 'FLAW-012']),

('SCENARIO-006', 'MCP-Enabled Personal Assistant',
'You are designing a personal assistant that connects to external services via MCP servers: calendar (Google Calendar MCP), email (Gmail MCP), and task management (Linear MCP). The assistant can read and write to all three services.

Design the integration architecture. How do you handle MCP server responses? How do you scope permissions for each integration? What happens when an MCP server returns unexpected data?',
'MCP responses validated before use; Write operations require explicit user confirmation; Permission scoping per MCP server (calendar read vs write); Error handling for malformed/unexpected MCP responses; Context filtering — do not pass full email content to calendar operations',
ARRAY['FLAW-003', 'FLAW-006', 'FLAW-010', 'FLAW-011']),

('SCENARIO-007', 'RAG-Powered Support Agent',
'Your team is building a support agent that answers questions using a RAG system over 10,000 product documentation pages. The agent should cite sources and acknowledge when it does not know something.

Design the retrieval and response architecture. How do you retrieve relevant content? How do you ensure the agent uses retrieved content rather than hallucinating? How do you handle questions where retrieval returns nothing relevant?',
'Relevance threshold for retrieval (not just top-k); Provenance tracking — chunk IDs linked to response sections; Explicit "no relevant content found" handling; Reranking or deduplication of retrieved chunks; Citation format that maps claims to sources',
ARRAY['FLAW-007', 'FLAW-012', 'FLAW-013'])

ON CONFLICT (id) DO NOTHING;
