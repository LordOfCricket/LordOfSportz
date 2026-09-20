import { createPlayer, findPlayerByUserId, updatePlayer } from '../models/player.model.js'
import { PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES } from '../domain/player/playerEnums.js'
import { uploadImageFileDetailed } from '../utils/cloudinaryUpload.js'

const PLAYER_PHOTO_CLOUDINARY_FOLDER = 'LOC/player-photos'

// First-Login Player Profile Onboarding — this same allowlist/validator
// backs both the onboarding form's Save/Skip and the existing Edit Profile
// page's Save (one API, no duplicate profile-write path). nickname/
// date_of_birth/is_wicket_keeper/address_line/state/postal_code are the
// only genuinely new fields; jersey_number/city/bio keep their existing
// validation exactly (0-999, 100 chars, 280 chars) rather than narrowing to
// this feature's own suggested defaults, since this codebase already has an
// established rule for each. profile_onboarding_completed is the explicit
// "onboarding has been handled" signal — settable here (by Save AND Skip)
// like any other field, never inferred from what else is filled in.
const EDITABLE_FIELDS = [
  'name',
  'jersey_number',
  'role',
  'batting_style',
  'bowling_style',
  'city',
  'bio',
  'photo_url',
  'nickname',
  'date_of_birth',
  'is_wicket_keeper',
  'address_line',
  'state',
  'postal_code',
  'profile_onboarding_completed',
]

const MIN_BIRTH_YEAR = 1900

function isValidDateOnlyString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())
}

function validateFields(body) {
  const fields = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return { error: 'name cannot be empty.' }
    fields.name = name
  }
  if (body.role !== undefined) {
    if (body.role !== null && !PLAYING_ROLES.includes(body.role)) return { error: `role must be one of ${PLAYING_ROLES.join(', ')}` }
    fields.role = body.role
  }
  if (body.batting_style !== undefined) {
    if (body.batting_style !== null && !BATTING_STYLES.includes(body.batting_style)) return { error: `batting_style must be one of ${BATTING_STYLES.join(', ')}` }
    fields.batting_style = body.batting_style
  }
  if (body.bowling_style !== undefined) {
    if (body.bowling_style !== null && !BOWLING_STYLES.includes(body.bowling_style)) return { error: `bowling_style must be one of ${BOWLING_STYLES.join(', ')}` }
    fields.bowling_style = body.bowling_style
  }
  if (body.jersey_number !== undefined) {
    if (body.jersey_number !== null && (!Number.isInteger(body.jersey_number) || body.jersey_number < 0 || body.jersey_number > 999)) {
      return { error: 'jersey_number must be an integer between 0 and 999.' }
    }
    fields.jersey_number = body.jersey_number
  }
  if (body.city !== undefined) {
    fields.city = body.city === null ? null : String(body.city).trim().slice(0, 100)
  }
  if (body.bio !== undefined) {
    fields.bio = body.bio === null ? null : String(body.bio).trim().slice(0, 280)
  }
  if (body.photo_url !== undefined) {
    fields.photo_url = body.photo_url === null ? null : String(body.photo_url).trim()
  }
  if (body.nickname !== undefined) {
    fields.nickname = body.nickname === null ? null : String(body.nickname).trim().slice(0, 50)
  }
  if (body.date_of_birth !== undefined) {
    if (body.date_of_birth !== null) {
      if (!isValidDateOnlyString(body.date_of_birth)) return { error: 'date_of_birth must be a valid date (YYYY-MM-DD).' }
      const dob = new Date(body.date_of_birth)
      if (dob.getTime() > Date.now()) return { error: 'date_of_birth cannot be in the future.' }
      if (dob.getUTCFullYear() < MIN_BIRTH_YEAR) return { error: `date_of_birth must be after ${MIN_BIRTH_YEAR}.` }
    }
    fields.date_of_birth = body.date_of_birth
  }
  if (body.is_wicket_keeper !== undefined) {
    if (typeof body.is_wicket_keeper !== 'boolean') return { error: 'is_wicket_keeper must be true or false.' }
    fields.is_wicket_keeper = body.is_wicket_keeper
  }
  if (body.address_line !== undefined) {
    fields.address_line = body.address_line === null ? null : String(body.address_line).trim().slice(0, 255)
  }
  if (body.state !== undefined) {
    fields.state = body.state === null ? null : String(body.state).trim().slice(0, 100)
  }
  if (body.postal_code !== undefined) {
    fields.postal_code = body.postal_code === null ? null : String(body.postal_code).trim().slice(0, 20)
  }
  if (body.profile_onboarding_completed !== undefined) {
    if (typeof body.profile_onboarding_completed !== 'boolean') return { error: 'profile_onboarding_completed must be true or false.' }
    fields.profile_onboarding_completed = body.profile_onboarding_completed
  }

  return { fields }
}

export async function getMyPlayer(req, res, next) {
  try {
    const player = await findPlayerByUserId(req.user.id)
    res.json({ player })
  } catch (err) {
    next(err)
  }
}

export async function updateMyPlayer(req, res, next) {
  try {
    const body = {}
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) body[key] = req.body[key]
    }

    const { fields, error } = validateFields(body)
    if (error) return res.status(400).json({ message: error })

    let player = await findPlayerByUserId(req.user.id)

    if (!player) {
      player = await createPlayer({
        name: fields.name || req.user.name,
        teamId: null,
        role: fields.role ?? null,
        battingStyle: fields.batting_style ?? null,
        bowlingStyle: fields.bowling_style ?? null,
        userId: req.user.id,
      })
      const remainingFields = { ...fields }
      delete remainingFields.name
      delete remainingFields.role
      delete remainingFields.batting_style
      delete remainingFields.bowling_style
      if (Object.keys(remainingFields).length > 0) {
        player = await updatePlayer(player.id, remainingFields)
      }
    } else if (Object.keys(fields).length > 0) {
      player = await updatePlayer(player.id, fields)
    }

    res.json({ player })
  } catch (err) {
    next(err)
  }
}

// Choose-from-device upload for the profile photo, mirroring the
// groundPhoto/amenity upload pattern (multer memory storage -> Cloudinary
// stream -> store the resulting URL). Replaces the old plain-text
// "Profile Photo URL" field — players never had to know/paste a URL by
// hand. The old photo_url isn't deleted from Cloudinary on replace: it may
// be an arbitrary external URL never uploaded through this app, and
// players has no column tracking a Cloudinary public_id to safely
// distinguish the two cases (same reasoning as addGroundPhoto's
// external-URL path).
export async function uploadMyPlayerPhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'photo file is required' })
    }

    const uploaded = await uploadImageFileDetailed(req.file, PLAYER_PHOTO_CLOUDINARY_FOLDER)

    let player = await findPlayerByUserId(req.user.id)
    if (!player) {
      player = await createPlayer({ name: req.user.name, teamId: null, role: null, userId: req.user.id })
    }
    player = await updatePlayer(player.id, { photo_url: uploaded.url })

    res.json({ player })
  } catch (err) {
    next(err)
  }
}
