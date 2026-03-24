/**
 * Initialize PARANOID CCA database
 */

require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  
  try {
    await pool.query(schema);
    console.log("✓ Database initialized");
    
    // Check flaws
    const flaws = await pool.query("SELECT COUNT(*) as count FROM flaws");
    console.log(`✓ ${flaws.rows[0].count} flaws loaded`);
    
    // Check scenarios
    const scenarios = await pool.query("SELECT COUNT(*) as count FROM scenarios");
    console.log(`✓ ${scenarios.rows[0].count} scenarios loaded`);
    
    // List scenarios
    const scenarioList = await pool.query("SELECT id, title FROM scenarios ORDER BY id");
    console.log("\nScenarios:");
    scenarioList.rows.forEach(s => console.log(`  - ${s.id}: ${s.title}`));
    
  } catch (err) {
    console.error("Database init failed:", err);
  } finally {
    await pool.end();
  }
}

init();
