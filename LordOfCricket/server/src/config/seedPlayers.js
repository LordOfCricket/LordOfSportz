import 'dotenv/config'
import { pool } from './db.js'
import { createPlayer } from '../models/player.model.js'

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Refusing to seed practice roster data in production')
  process.exit(1)
}

// Realistic-enough Playing-XI-sized rosters for the two real teams already on
// the homepage (LOC Strikers / Riverside Warriors), so Phase 5 match setup
// has real squads to pick from instead of the single unassigned test player.
const ROSTERS = {
  'LOC Strikers': [
    { name: 'Rahul Verma', role: 'BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Aman Gupta', role: 'BATSMAN', battingStyle: 'LEFT_HAND' },
    { name: 'Vikram Singh', role: 'BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Karan Mehta', role: 'BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Suresh Nair', role: 'ALL_ROUNDER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'RIGHT_ARM_MEDIUM' },
    { name: 'Deepak Rao', role: 'ALL_ROUNDER', battingStyle: 'LEFT_HAND', bowlingStyle: 'LEFT_ARM_ORTHODOX' },
    { name: 'Manish Iyer', role: 'WICKET_KEEPER_BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Ajay Kumar', role: 'BOWLER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'RIGHT_ARM_FAST' },
    { name: 'Rohit Pillai', role: 'BOWLER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'LEFT_ARM_FAST' },
    { name: 'Sanjay Bhat', role: 'BOWLER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'RIGHT_ARM_OFF_BREAK' },
    { name: 'Naveen Das', role: 'BOWLER', battingStyle: 'LEFT_HAND', bowlingStyle: 'RIGHT_ARM_LEG_BREAK' },
  ],
  'Riverside Warriors': [
    { name: 'Arjun Shetty', role: 'BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Kabir Khan', role: 'BATSMAN', battingStyle: 'LEFT_HAND' },
    { name: 'Farhan Ali', role: 'BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Yusuf Sheikh', role: 'BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Gaurav Joshi', role: 'ALL_ROUNDER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'RIGHT_ARM_MEDIUM' },
    { name: 'Imran Sayed', role: 'ALL_ROUNDER', battingStyle: 'LEFT_HAND', bowlingStyle: 'LEFT_ARM_WRIST_SPIN' },
    { name: 'Rohan Kapoor', role: 'WICKET_KEEPER_BATSMAN', battingStyle: 'RIGHT_HAND' },
    { name: 'Zaid Ansari', role: 'BOWLER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'RIGHT_ARM_FAST' },
    { name: 'Prakash Yadav', role: 'BOWLER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'LEFT_ARM_MEDIUM' },
    { name: 'Harish Chandra', role: 'BOWLER', battingStyle: 'RIGHT_HAND', bowlingStyle: 'RIGHT_ARM_OFF_BREAK' },
    { name: 'Aditya Menon', role: 'BOWLER', battingStyle: 'LEFT_HAND', bowlingStyle: 'RIGHT_ARM_LEG_BREAK' },
  ],
}

async function seed() {
  const { rows: teams } = await pool.query('SELECT id, name FROM teams WHERE name = ANY($1)', [Object.keys(ROSTERS)])

  for (const team of teams) {
    const roster = ROSTERS[team.name]
    const { rows: existing } = await pool.query('SELECT COUNT(*)::int AS c FROM players WHERE team_id = $1', [team.id])
    if (existing[0].c > 0) {
      console.log(`↷ ${team.name} already has ${existing[0].c} players, skipping (delete them first to reseed)`)
      continue
    }
    // All-or-nothing so a crash partway through (e.g. an unmapped role hitting
    // a column-length CHECK) can never leave a half-seeded, duplicate-prone roster.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const p of roster) {
        await createPlayer({ name: p.name, teamId: team.id, role: p.role, battingStyle: p.battingStyle, bowlingStyle: p.bowlingStyle || null }, client)
      }
      await client.query('COMMIT')
      console.log(`✅ Seeded ${roster.length} players for ${team.name}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  await pool.end()
}

seed().catch((err) => {
  console.error('❌ Seeding players failed:', err.message)
  process.exit(1)
})
