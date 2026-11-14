import { APIError, type Endpoint } from 'payload'
import { Pool } from 'pg'
const pool = new Pool({connectionString: process.env.STUDIO_PUBLICATION_DATABASE_URL})
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const domains = new Set(['science','technology','humanities','philosophy','history','society','economics','health','life','space','earth','arts-culture'])
export const directPublicationEndpoint: Endpoint = {
  path: '/studio-publish',
  method: 'post',
  handler: async req => {
    if (!req.user || req.user.collection !== 'staff' || req.user.role !== 'editor') {
      throw new APIError('EDITOR_REQUIRED',403)
    }
    const data = await req.json?.().catch(() => null)
    const id = Number(data?.draftId)
    const domain = data?.domain
    const summary = typeof data?.summary === 'string' ? data.summary.trim() : ''
    if (!Number.isSafeInteger(id) || id < 1 || !domains.has(domain) || !summary || summary.length > 1000) {
      throw new APIError('INVALID_PUBLICATION_DETAILS',400)
    }
    const draft = await req.payload.findByID({
      collection: 'editorial-drafts', id, draft: true, req, overrideAccess: false,
    })
    if (!draft || typeof draft.stableEntityId !== 'string' || !uuid.test(draft.stableEntityId)
      || typeof draft.title !== 'string' || typeof draft.body !== 'string') {
      throw new APIError('DRAFT_NOT_AVAILABLE',404)
    }
    try {
      const result = await pool.query(
        'SELECT * FROM kg.publish_studio_draft($1::uuid,$2::text,$3::text,$4::text,$5::text)',
        [draft.stableEntityId, draft.title, draft.body, summary, domain],
      )
      return Response.json({published:true, ...result.rows[0]},{headers:{'Cache-Control':'private, no-store'}})
    } catch {
      throw new APIError('PUBLICATION_FAILED',500)
    }
  },
}

export const studioManageEndpoint: Endpoint = {
 path: '/studio-manage', method: 'post',
 handler: async req => {
  if (!req.user || req.user.collection !== 'staff' || req.user.role !== 'editor') throw new APIError('EDITOR_REQUIRED',403)
  const data=await req.json?.().catch(()=>null)
  const id=Number(data?.draftId)
  if (!Number.isSafeInteger(id) || id<1 || !['status','unpublish'].includes(data?.action)) throw new APIError('INVALID_REQUEST',400)
  const draft=await req.payload.findByID({collection:'editorial-drafts',id,draft:true,req,overrideAccess:false})
  if (!draft || typeof draft.stableEntityId!=='string' || !uuid.test(draft.stableEntityId)) throw new APIError('DRAFT_NOT_AVAILABLE',404)
  try {
   if(data.action==='unpublish'){
    const result=await pool.query('SELECT kg.unpublish_studio_draft($1::uuid) AS removed',[draft.stableEntityId])
    return Response.json({removed:result.rows[0].removed},{headers:{'Cache-Control':'private, no-store'}})
   }
   const result=await pool.query('SELECT * FROM kg.studio_public_state($1::uuid)',[draft.stableEntityId])
   return Response.json({published:result.rowCount===1, entity_id:draft.stableEntityId, ...result.rows[0]},{headers:{'Cache-Control':'private, no-store'}})
  } catch { throw new APIError('MANAGEMENT_FAILED',500) }
 },
}
