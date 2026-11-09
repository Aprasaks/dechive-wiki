/** Offline, explicitly authorized staff account provisioning.
 * Run only on an isolated editorial DB after reviewed migrations.
 * No web route is exposed. Credentials are never passed as CLI arguments.
 */
import { getPayload } from 'payload'
import config from '../operational-auth.config.ts'

const roles = ['editor', 'reviewer', 'publisher'] as const
type Role = typeof roles[number]

async function main() {
  const role = process.env.STUDIO_BOOTSTRAP_ROLE
  const email = process.env.STUDIO_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const password = process.env.STUDIO_BOOTSTRAP_PASSWORD ?? ''
  const confirmation = process.env.STUDIO_BOOTSTRAP_CONFIRM

  if (confirmation !== 'CREATE_PRIVATE_STAFF_ONLY') {
    throw new Error('Explicit private account provisioning confirmation is required')
  }
  if (!roles.includes(role as Role) || !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 20 || password.length > 512) {
    throw new Error('Valid role, email and a 20+ character secret are required')
  }

  // The operational config rejects non-dedicated DB names and owner logins.
  // Never create a first-user HTTP endpoint or enable public staff signup.
  const payload = await getPayload({ config })
  try {
    const existing = await payload.find({
      collection: 'staff',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.totalDocs !== 0) {
      throw new Error('Staff account exists: refusing to change its role or password')
    }

    const person = await payload.create({
      collection: 'staff',
      overrideAccess: true,
      data: { email, password, role: role as Role },
    })
    console.log('PRIVATE_STAFF_CREATED role=' + role + ' id=' + String(person.id))
  } finally {
    await payload.db.destroy?.()
  }
}

// Other private HTTP endpoint modules allocate lazy DB pools at import time.
// For this one-shot maintenance command, exit once the awaited write is done
// rather than leave unused pools holding the process open indefinitely.
main().then(() => process.exit(0)).catch((error) => {
  // Never print credentials or DB URLs into deployment logs.
  const msg = error instanceof Error ? error.message : 'Unknown provisioning error'
  console.error('PRIVATE_STAFF_PROVISION_FAILED: ' + msg)
  process.exit(1)
})
