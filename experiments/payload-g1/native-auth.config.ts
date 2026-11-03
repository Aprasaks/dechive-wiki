import { APIError, buildConfig, type CollectionConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { g1WorkflowEndpoints } from './http/workflow-endpoints'

// Isolated G1 security test config: separate from the existing P0/G1 fixture.
// IMPORTANT: never deploy this disposable database-push config to production.
type Actor = { id: number | string; role?: string; collection?: string }
const actor = (user: unknown): Actor | null =>
  user && typeof user === 'object' && 'id' in user && 'role' in user
    ? user as Actor
    : null
const isEditor = (user: unknown) =>
  actor(user)?.collection === 'staff' && actor(user)?.role === 'editor'
const isReviewer = (user: unknown) =>
  actor(user)?.collection === 'staff' && actor(user)?.role === 'reviewer'

const Staff: CollectionConfig = {
  slug: 'staff',
  auth: {
    tokenExpiration: 600, maxLoginAttempts: 5,
    cookies: { sameSite: 'Strict', secure: process.env.G1_COOKIE_SECURE === 'true' },
  },
  admin: { useAsTitle: 'email' },
  access: {
    create: () => false, // No public account creation
    read: ({ req }) => {
      const u = actor(req.user)
      return u?.collection === 'staff' ? { id: { equals: u.id } } : false
    },
    update: () => false, // No self-promotion, even for logged-in staff
    delete: () => false,
  },
  fields: [{
    name: 'role',
    type: 'select',
    options: [
      { label: 'Editor', value: 'editor' },
      { label: 'Reviewer', value: 'reviewer' },
      { label: 'Publisher', value: 'publisher' },
    ],
    required: true,
    defaultValue: 'editor',
    saveToJWT: true,
    access: { create: () => false, update: () => false },
  }],
}

const EditorialDrafts: CollectionConfig = {
  slug: 'editorial-drafts',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  access: {
    create: ({ req }) => isEditor(req.user),
    read: ({ req }) => {
      if (isReviewer(req.user)) return true
      const u = actor(req.user)
      return isEditor(req.user) && u ? { createdBy: { equals: u.id } } : false
    },
    update: ({ req }) => {
      const u = actor(req.user)
      return isEditor(req.user) && u ? { createdBy: { equals: u.id } } : false
    },
    delete: () => false,
    readVersions: () => false, // Review history is kept in the canonical KG, not native CMS API
  },
  hooks: {
    beforeChange: [({ data, req, operation, originalDoc }) => {
      // No role can use a CMS "publish" operation. Publication goes via
      // verified PostgreSQL revision/claim/rights gate and a scoped publisher.
      if (data?._status === 'published') throw new APIError('KG_PUBLICATION_GATE_REQUIRED', 403)
      if (operation === 'create' && isEditor(req.user)) {
        data.createdBy = actor(req.user)?.id
      } else if (operation === 'update' && data) {
        // GraphQL does not automatically carry the immutable relationship
        // into PATCH data. Use the persisted value, never a client-supplied ID.
        data.createdBy = originalDoc?.createdBy?.id ?? originalDoc?.createdBy
      }
      return data
    }],
  },
  fields: [
    { name: 'stableEntityId', type: 'text', required: true },
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'staff',
      required: true,
      admin: { readOnly: true },
      access: { create: () => false, update: () => false },
    },
  ],
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? '',
  serverURL: process.env.G1_TRUSTED_ORIGIN || 'http://127.0.0.1:3100',
  csrf: [process.env.G1_TRUSTED_ORIGIN || 'http://127.0.0.1:3100'],
  admin: { user: 'staff' },
  editor: lexicalEditor(),
  collections: [Staff, EditorialDrafts],
  endpoints: g1WorkflowEndpoints,
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL ?? '' },
    push: true, // ONLY this disposable GitHub-hosted G1 fixture database
  }),
  typescript: { autoGenerate: false },
})
