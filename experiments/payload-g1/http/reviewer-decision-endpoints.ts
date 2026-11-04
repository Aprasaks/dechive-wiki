import { APIError, type Endpoint } from 'payload'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { Pool } from 'pg'

// Genuine Payload JWT cookie/Authorization is verified before any DB access.
// Dedicated PostgreSQL login only has narrowly granted reviewer privileges.
const reviewer = new Pool({ connectionString: process.env.G1_REVIEWER_DATABASE_URL })
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const verdicts = new Set(['verified','unverified','disputed'])
const rights = new Set(['cleared','not-cleared'])
function requireReviewer(req:{user?:unknown}):number {
  const u=req.user
  if(!u||typeof u!=='object'||!('collection' in u)||u.collection!=='staff'||
     !('role' in u)||u.role!=='reviewer'||!('id' in u)) {
    throw new APIError('REVIEWER_ROLE_REQUIRED',403)
  }
  const id=Number(u.id)
  if(!Number.isSafeInteger(id)||id<1)throw new APIError('REVIEWER_ID_INVALID',403)
  return id
}
const listSQL=[
 'SELECT c.revision_id,c.draft_id,c.submitted_by,c.license_declaration,',
 'c.source_review_status,c.rights_review_status,c.submitted_at,',
 'r.entity_id,r.body,r.checksum,s.locator,s.description,',
 'cl.statement,cl.anchor,ev.pinpoint,',
 'd.decision,d.source_verdict,d.rights_verdict,d.review_note,d.reviewer_staff_id',
 'FROM kg.g1_candidates c',
 'JOIN kg.revisions r ON r.id=c.revision_id',
 'JOIN kg.sources s ON s.id=c.source_id',
 "JOIN kg.claims cl ON cl.revision_id=c.revision_id AND cl.claim_key='claim-001'",
 "JOIN kg.claim_evidence ev ON ev.revision_id=c.revision_id AND ev.claim_key='claim-001'",
 'LEFT JOIN kg.g1_review_decisions d ON d.revision_id=c.revision_id',
 'ORDER BY c.submitted_at DESC,c.revision_id DESC LIMIT 50',
].join(' ')

const queue:Endpoint = {
  path:'/g1-review-queue',method:'get',
  handler:async(req)=>{
    requireReviewer(req)
    const entries=await reviewer.query(listSQL)
    return Response.json({
      records:entries.rows.map(r=>({
        revisionId:r.revision_id,draftId:Number(r.draft_id),
        submittedBy:Number(r.submitted_by), entityId:r.entity_id,
        body:r.body, revisionChecksum:r.checksum,
        locator:r.locator,sourceDescription:r.description,
        claim:r.statement,anchor:r.anchor,pinpoint:r.pinpoint,
        licenseDeclaration:r.license_declaration,
        status:r.decision ?? 'needs-review',
        sourceVerdict:r.source_verdict ?? 'pending',
        rightsVerdict:r.rights_verdict ?? 'pending',
        reviewNote:r.review_note ?? null,
        reviewerStaffId:r.reviewer_staff_id == null ? null : Number(r.reviewer_staff_id),
      })),
      warning:'The reviewer must independently inspect actual source material and license; this endpoint does not establish truth.',
    },{headers:{'Cache-Control':'private, no-store'}})
  },
}
const decision:Endpoint={
  path:'/g1-review-decision',method:'post',
  handler:async(req)=>{
    const reviewerId=requireReviewer(req)
    if(typeof req.json!=='function')throw new APIError('INVALID_DECISION_BODY',400)
    const data=await req.json().catch(()=>{throw new APIError('INVALID_DECISION_BODY',400)})
    const revisionId=data?.revisionId
    const decision=data?.decision
    const sourceVerdict=data?.sourceVerdict
    const rightsVerdict=data?.rightsVerdict
    const note=data?.note
    if(typeof revisionId!=='string'||!uuid.test(revisionId)||
      !['accepted','rejected'].includes(decision)||
      !verdicts.has(sourceVerdict)||!rights.has(rightsVerdict)||
      typeof note!=='string'||note.trim().length<20||note.length>2000) {
      throw new APIError('INVALID_DECISION_METADATA',400)
    }
    if(decision==='accepted' && (sourceVerdict!=='verified'||rightsVerdict!=='cleared')){
      throw new APIError('INDEPENDENT_VERIFICATION_REQUIRED',400)
    }
    const rows=await reviewer.query(
      'SELECT r.checksum FROM kg.g1_candidates c JOIN kg.revisions r ON r.id=c.revision_id WHERE c.revision_id=$1::uuid',
      [revisionId],
    )
    if(rows.rowCount!==1)throw new APIError('CANDIDATE_NOT_FOUND',404)
    const checksum=rows.rows[0].checksum as string
    const secret=process.env.G1_REVIEW_ATTESTATION_SECRET ?? ''
    if(!/^[0-9a-f]{64}$/i.test(secret))throw new APIError('REVIEW_ATTESTATION_UNAVAILABLE',503)
    const nonce=randomBytes(16).toString('hex')
    const noteDigest=createHash('sha256').update(note,'utf8').digest('hex')
    const message=['g1-review-decision-v1',String(reviewerId),
      revisionId,checksum,decision,sourceVerdict,rightsVerdict,noteDigest,nonce].join('|')
    const signature=createHmac('sha256',Buffer.from(secret,'hex'))
      .update(message,'utf8').digest('hex')
    try{
      await reviewer.query(
        'SELECT kg.g1_record_review_decision($1::uuid,$2::bigint,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text)',
        [revisionId,reviewerId,decision,sourceVerdict,rightsVerdict,note,nonce,signature],
      )
    }catch{
      throw new APIError('REVIEW_DECISION_REJECTED',409)
    }
    return Response.json({
      decided:true, revisionId, decision,
      status:decision==='accepted'?'ready-for-separate-approval':'rejected',
      warning:'A recorded decision is an attestation by a reviewer, not an automated truth guarantee.',
    },{status:200,headers:{'Cache-Control':'private, no-store'}})
  },
}
export const reviewerDecisionEndpoints:Endpoint[]=[queue,decision]
