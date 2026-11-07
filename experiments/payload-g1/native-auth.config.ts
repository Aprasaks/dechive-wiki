import { APIError, buildConfig, type CollectionConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { g1WorkflowEndpoints } from './http/workflow-endpoints'
import { candidateEndpoint } from './http/candidate-endpoint'
import { reviewerDecisionEndpoints } from './http/reviewer-decision-endpoints'
import { assessMultiSourceReview, packageHash } from './lib/multi-source-review'
import type { EditorialPackage } from './lib/editorial-package'
import { multiReviewStatus } from './http/multi-review-status'
import { sealMultiReview } from './http/seal-multi-review'

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
    // Private, unreviewed working data. The single-source submission endpoint
    // refuses these drafts until a revision-bound multi-source gate exists.
    { name: 'supplementalEvidence', type: 'json' },
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

// Synthetic private experiment only. Records never authorize KG publication.
// Capture the reviewed snapshot so a later editor change cannot rewrite history.
const MultiSourceReviews: CollectionConfig = {
  slug:'multi-source-reviews',
  access:{create:({req})=>isReviewer(req.user),read:({req})=>isReviewer(req.user),
    update:()=>false,delete:()=>false},
  hooks:{beforeChange:[async({data,req,operation})=>{
    if(operation!=='create'||!isReviewer(req.user))throw new APIError('REVIEWER_REQUIRED',403)
    const draftId=Number(data?.draftId)
    if(!Number.isSafeInteger(draftId)||draftId<1||typeof data?.snapshotHash!=='string'||
      !Array.isArray(data?.evidence)||!Array.isArray(data?.media))throw new APIError('INVALID_REVIEW',400)
    const draft=await req.payload.findByID({collection:'editorial-drafts',id:draftId,req,overrideAccess:false,draft:true})
    const extra=draft?.supplementalEvidence as Record<string,unknown>|null
    if(!extra||!Array.isArray(extra.sources)||!Array.isArray(extra.claims)||!Array.isArray(extra.media))throw new APIError('INVALID_DRAFT_PACKAGE',400)
    const p={title:draft.title,body:draft.body,sources:extra.sources,claims:extra.claims,media:extra.media} as EditorialPackage
    const editor=typeof draft.createdBy==='object' ? draft.createdBy?.id : draft.createdBy
    const reviewer=actor(req.user)?.id
    if(!editor||!reviewer||String(editor)===String(reviewer))throw new APIError('INDEPENDENT_REVIEWER_REQUIRED',403)
    try {
      if(data.snapshotHash!==packageHash(p))throw new Error('stale')
      const assessment=assessMultiSourceReview(p,{snapshotHash:data.snapshotHash,editorId:String(editor),reviewerId:String(reviewer),evidence:data.evidence,media:data.media})
      if(!assessment.readyForHumanGate)throw new Error('incomplete')
    } catch { throw new APIError('REVIEW_INVALID_STALE_OR_INCOMPLETE',400) }
    // Discard client-provided identity or snapshot; set both from trusted server state.
    if(typeof draft.stableEntityId!=='string')throw new APIError('DRAFT_IDENTITY_INVALID',400)
    return {draftId,snapshotHash:data.snapshotHash,snapshot:p,evidence:data.evidence,media:data.media,
      snapshotEntityId:draft.stableEntityId,reviewerId:String(reviewer),editorId:String(editor)}
  }]},
  fields:[
    {name:'draftId',type:'number',required:true},
    {name:'snapshotHash',type:'text',required:true},
    {name:'snapshotEntityId',type:'text',required:true},
    {name:'snapshot',type:'json',required:true},
    {name:'evidence',type:'json',required:true},
    {name:'media',type:'json',required:true},
    {name:'reviewerId',type:'text',required:true},
    {name:'editorId',type:'text',required:true},
  ],
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? '',
  serverURL: process.env.G1_TRUSTED_ORIGIN || 'http://127.0.0.1:3100',
  csrf: [process.env.G1_TRUSTED_ORIGIN || 'http://127.0.0.1:3100'],
  admin: { user: 'staff' },
  editor: lexicalEditor(),
  collections: [Staff, EditorialDrafts, MultiSourceReviews],
  endpoints: [...g1WorkflowEndpoints,candidateEndpoint,...reviewerDecisionEndpoints,multiReviewStatus,sealMultiReview],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL ?? '' },
    push: true, // ONLY this disposable GitHub-hosted G1 fixture database
  }),
  typescript: { autoGenerate: false },
})
