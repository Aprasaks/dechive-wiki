import { createHash } from 'node:crypto'
import { prepareMultiSourceProjection, type EvidenceLocation } from './multi-source-projection'
import type { EditorialPackage } from './editorial-package'
import type { ReviewInputs } from './multi-source-review'

// The reviewed package must match the exact title and body being published.
// This function only prepares data: it never approves or writes a revision.
export function preparePublicationEvidence(
  draft: { title: string; body: string },
  reviewed: EditorialPackage,
  decisions: ReviewInputs,
  locations: EvidenceLocation[],
) {
  if (draft.title !== reviewed.title || draft.body !== reviewed.body) {
    throw new Error('PUBLICATION_REVIEW_MISMATCH')
  }
  const projection = prepareMultiSourceProjection(reviewed, decisions, locations)
  const sources = new Map(projection.sources.map(source => [source.id, source]))
  const rows = projection.claims.flatMap(claim => claim.evidence.map(evidence => {
    const source = sources.get(evidence.sourceId)
    if (!source) throw new Error('MISSING_REVIEWED_SOURCE')
    return {
      claimKey: claim.id,
      anchor: claim.anchor,
      statement: claim.statement,
      sourceKey: source.id,
      locator: source.url,
      description: source.description,
      pinpoint: evidence.pinpoint,
      stance: 'supports' as const,
    }
  }))
  return {
    snapshotHash: projection.snapshotHash,
    bodySha256: createHash('sha256').update(draft.body, 'utf8').digest('hex'),
    rows,
    status: 'private-preparation' as const,
  }
}
