import 'dotenv/config'
import { fileURLToPath } from 'url'
import { pool } from '../config/db.js'
import { createMerchandise } from '../models/merchandise.model.js'

// Local/demo seed for the homepage Merchandise showcase — lets the
// MerchandiseSection render without a Super Admin manually adding products
// first. Idempotent: keyed on the (stable, unique) product `name`, so
// re-running only inserts what's missing and never touches real products a
// Super Admin created through /admin/merchandise.
//
// IMAGE URLS: these point at Cloudinary's public `demo` cloud (the sample
// assets Cloudinary ships for everyone). They are safe, publicly reachable
// placeholders for local testing only — NOT LOC-branded product photos and
// NOT uploaded through the app's own Cloudinary account. `cloudinary_public_id`
// is left NULL (nothing to transform/delete); the public API already falls
// back to `image_url` in that case. Replace via /admin/merchandise with real
// uploads before any non-local use.
const SAMPLE_PRODUCTS = [
  {
    name: 'LOC Classic Cricket Jersey',
    description: 'Breathable match-day jersey in official LOC colours, built for long innings under the sun.',
    category: 'Jersey',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_auto,q_auto/sample.jpg',
    originalPrice: 1999,
    sellingPrice: 1499,
    status: 'ACTIVE',
    sortOrder: 1,
  },
  {
    name: 'LOC Performance Cap',
    description: 'Lightweight structured cap with a curved brim and moisture-wicking sweatband.',
    category: 'Headwear',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_auto,q_auto/hat.jpg',
    originalPrice: null,
    sellingPrice: 599,
    status: 'ACTIVE',
    sortOrder: 2,
  },
  {
    name: 'LOC Cricket Training T-Shirt',
    description: 'Everyday training tee with a relaxed fit and a subtle LOC crest on the chest.',
    category: 'Apparel',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_auto,q_auto/shirt.png',
    originalPrice: 1199,
    sellingPrice: 899,
    status: 'ACTIVE',
    sortOrder: 3,
  },
  {
    name: 'LOC Premium Sports Bottle',
    description: 'Insulated 750ml stainless-steel bottle that keeps water cold through a full session.',
    category: 'Accessories',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_auto,q_auto/bottle.jpg',
    originalPrice: null,
    sellingPrice: 499,
    status: 'ACTIVE',
    sortOrder: 4,
  },
  {
    name: 'LOC Supporter Wristband',
    description: 'Soft silicone wristband in LOC green - wear the colours to every game.',
    category: 'Accessories',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_auto,q_auto/sample.jpg',
    originalPrice: 249,
    sellingPrice: 199,
    status: 'ACTIVE',
    sortOrder: 5,
  },
  {
    name: 'LOC Cricket Hoodie',
    description: 'Heavyweight fleece hoodie for cold-morning warm-ups and the walk back to the pavilion.',
    category: 'Apparel',
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/w_800,f_auto,q_auto/shirt.png',
    originalPrice: 2499,
    sellingPrice: 1999,
    status: 'ACTIVE',
    sortOrder: 6,
  },
]

export async function seedMerchandise() {
  const inserted = []
  const skipped = []

  for (const product of SAMPLE_PRODUCTS) {
    const { rows } = await pool.query('SELECT id FROM merchandise WHERE name = $1 LIMIT 1', [product.name])
    if (rows.length > 0) {
      skipped.push(product.name)
      continue
    }
    const row = await createMerchandise(product)
    inserted.push({ id: row.id, name: row.name })
  }

  return { inserted, skipped }
}

async function main() {
  const { inserted, skipped } = await seedMerchandise()
  if (inserted.length) {
    console.log('✅ Inserted:')
    for (const p of inserted) console.log(`   #${p.id}  ${p.name}`)
  }
  if (skipped.length) {
    console.log(`ℹ Skipped (already exist): ${skipped.length}`)
    for (const name of skipped) console.log(`   -  ${name}`)
  }
  console.log(`\nDone — ${inserted.length} inserted, ${skipped.length} skipped.`)
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
