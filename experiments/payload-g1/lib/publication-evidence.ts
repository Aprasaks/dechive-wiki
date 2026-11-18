import { createHash } from 'node:crypto'
import { packageHash, type ReviewInputs } from './multi-source-review'
import { prepareMultiSourceProjection, type EvidenceLocation } from './multi-source-projection'
import type { EditorialPackage } from './editorial-package'

export type PublicationReview = {
  draftId: string
  snapshotEntityId: string
  snapshotHash: string
  snapshot: EditorialPackage
  editorId: string
  reviewerId: string
  evidence: ReviewInputs['evidence']
  media: ReviewInputs['media']
}

// Pure preparation only. Callers must load the review and draft through
// authenticated, access-controlled server APIs; never trust browser-supplied
// review records. This function does not itself approve or publish anything.
export function preparePublicationEvidence(
  draft: { id: string; entityId: string; editorId: string; title: string; body: string },
  reviewed: EditorialPackage,
  record: PublicationReview,
  locations: EvidenceLocation[],
) {
  if (draft.title !== reviewed.title || draft.body !== reviewed.body ||
      draft.id !== record.draftId || draft.entityId !== record.snapshotEntityId ||
      draft.editorId !== record.editorId ||
      packageHash(reviewed) !== record.snapshotHash ||
      packageHash(record.snapshot) !== record.snapshotHash) {
    throw new Error('PUBLICATION_REVIEW_MISMATCH')
  }
  const projection = prepareMultiSourceProjection(reviewed, record, locations)
  const sources = new Map(projection.sources.map(source => [source.id, source]))
  const rows = projection.claims.flatMap(claim => claim.evidence.map(evidence => {
    const source = sources.get(evidence.sourceId)
    if (!source) throw new Error('MISSING_REVIEWED_SOURCE')
    return {
      claimKey: claim.id, anchor: claim.anchor, statement: claim.statement,
      sourceKey: source.id, locator: source.url, description: source.description,
      pinpoint: evidence.pinpoint, stance: 'supports' as const,
    }
  }))
  return {
    snapshotHash: projection.snapshotHash,
    bodySha256: createHash('sha256').update(draft.body, 'utf8').digest('hex'),
    rows, status: 'private-preparation' as const,
  }
}
