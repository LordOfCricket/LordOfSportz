import 'dotenv/config'
import { fileURLToPath } from 'url'
import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'
import { slugify } from '../utils/slug.js'
import { createGround, findGroundBySlug } from '../models/ground.model.js'
import { createCanteen, findCanteensByGroundId } from '../models/canteen.model.js'

// Phase 8 — one-time, idempotent seed for the SINGLE existing real ground
// this LOC deployment already represents. Not a per-row migration like
// Phases 1-5 (there's no MongoDB source here) — this creates the two
// anchor rows every later multi-ground phase's backfill (Phase 7 §31)
// will point every other table at.
//
// Ground identity is NOT invented — it's the one authoritative constant
// already used across the live homepage
// (client/src/models/homepage.model.js#GROUND_ADDRESS):
//   "SS Cricket Ground, C47H+GVV, Baliawas, Haryana 122101, India"
// a real address with a Google Maps Plus Code, not a placeholder like
// "LOC Ground" (which only appears as informal free-text in matches.venue
// test data — see the Phase 8 report's audit section for why that was
// rejected as the source of truth). Contact fields (phone/email/website)
// are deliberately left NULL — the homepage's own phone/email are visibly
// placeholder values (a phone number of all zeros), not real data worth
// propagating into a permanent database row.
const REAL_GROUND = {
  name: 'SS Cricket Ground',
  description: null,
  addressLine: 'C47H+GVV, Baliawas',
  city: 'Baliawas',
  state: 'Haryana',
  country: 'India',
  postalCode: '122101',
  latitude: null, // Plus Code not geocoded — see the Phase 8 report; never approximated
  longitude: null,
  phone: null,
  email: null,
  website: null,
  status: 'ACTIVE', // a real, currently-operating ground — not a draft awaiting review
}

export async function seedGroundAndCanteen() {
  const slug = slugify(REAL_GROUND.name)

  let ground = await findGroundBySlug(slug)
  let groundInserted = false
  if (!ground) {
    ground = await createGround({
      publicGroundId: generatePublicId('GRD', 8),
      slug,
      ...REAL_GROUND,
    })
    groundInserted = true
  }

  let canteens = await findCanteensByGroundId(ground.id)
  let canteenInserted = false
  let canteen = canteens[0] || null
  if (!canteen) {
    canteen = await createCanteen({
      groundId: ground.id,
      publicCanteenId: generatePublicId('CAN', 8),
      name: 'Main Canteen',
    })
    canteenInserted = true
  }

  return { ground, groundInserted, canteen, canteenInserted }
}

async function main() {
  const { ground, groundInserted, canteen, canteenInserted } = await seedGroundAndCanteen()
  console.log(JSON.stringify({ ground, groundInserted, canteen, canteenInserted }, null, 2))
  console.log(
    `\n${groundInserted ? '✅ Ground created' : 'ℹ Ground already existed'} (id=${ground.id}, slug=${ground.slug})`,
  )
  console.log(
    `${canteenInserted ? '✅ Canteen created' : 'ℹ Canteen already existed'} (id=${canteen.id}, ground_id=${canteen.ground_id})`,
  )
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  main()
    .catch((err) => {
      console.error('Seed script crashed:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}
