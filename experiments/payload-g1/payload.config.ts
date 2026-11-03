import { buildConfig } from 'payload'
import type { CollectionConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

// These are deliberately PRIVATE editorial records, never the public knowledge API.
// Even privileged Payload Local API writes must not set Payload's native published flag.
const EditorialDrafts: CollectionConfig = {
  slug: 'editorial-drafts',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?._status === 'published') {
          throw new Error('KG_PUBLICATION_GATE_REQUIRED')
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'stableEntityId', type: 'text', required: true },
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
  ],
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? '',
  editor: lexicalEditor(),
  collections: [EditorialDrafts],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL ?? '' },
    push: true, // DISPOSABLE G1 database only; forbidden in production
  }),
  typescript: { autoGenerate: false },
})
