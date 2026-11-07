// Offline structural inventory only. It never sends or modifies a manuscript.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export function inventory(text) {
  const lines = text.split(/\r?\n/)
  const headings = lines.filter(line => /^#{1,6}\s/.test(line)).length
  const tables = lines.filter(line => /^\s*\|.*\|\s*$/.test(line)).length
  const imageReferences = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].length
  const citationGroups = [...text.matchAll(/\[((?:S?\d+)(?:\s*,\s*S?\d+)*)\]/g)]
  const cited = new Set(citationGroups.flatMap(match => match[1].split(',').map(id => id.trim())))
  const sourceHeading = lines.findIndex(line => /^#{1,3}\s+(?:sources|references)\s*$/i.test(line))
  const sourceLines = sourceHeading < 0 ? [] : lines.slice(sourceHeading + 1)
  const declared = new Set()
  for (const line of sourceLines) {
    const match = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?\[?(S?\d+)(?:\]|\.)/i)
    if (match) declared.add(match[1])
  }
  return {
    sha256: createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text), headings, tableRows: tables,
    imageReferences, citationGroups: citationGroups.length,
    distinctCitations: cited.size, declaredSources: declared.size,
    unlistedCitationIds: [...cited].filter(id => !declared.has(id)).sort(),
    // This is not a source check, approval, renderer, import, or publishing decision.
    status: 'structural-inventory-only',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  if (!file || process.argv.length !== 3) {
    console.error('Usage: node draft-inventory.mjs <local-markdown-file>')
    process.exitCode = 2
  } else {
    try { console.log(JSON.stringify(inventory(await readFile(file, 'utf8')), null, 2)) }
    catch { console.error('Unable to read the local draft.'); process.exitCode = 1 }
  }
}
