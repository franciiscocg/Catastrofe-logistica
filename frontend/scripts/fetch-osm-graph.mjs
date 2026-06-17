#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Descarga un extracto OSM de la red de calles de una zona (vía Overpass API),
// lo convierte en un grafo compacto y lo guarda en public/osm/<id>.json,
// actualizando public/osm/manifest.json. La app lo carga al arrancar para
// enrutar OFFLINE sobre el grafo local (ver src/utils/osmGraphStore.ts).
//
// Uso:
//   node scripts/fetch-osm-graph.mjs --id paiporta --bbox 39.41,-0.43,39.44,-0.40 --nombre "Paiporta"
//
// Sin argumentos usa la zona de Paiporta (DANA Valencia 2024) por defecto.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'public', 'osm')

const HIGHWAYS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track'
const OVERPASS = 'https://overpass-api.de/api/interpreter'

function parseArgs(argv) {
  const args = { id: 'paiporta', bbox: '39.41,-0.43,39.44,-0.40', nombre: 'Paiporta' }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--id') args.id = argv[++i]
    else if (a === '--bbox') args.bbox = argv[++i]
    else if (a === '--nombre') args.nombre = argv[++i]
  }
  return args
}

async function main() {
  const { id, bbox, nombre } = parseArgs(process.argv.slice(2))
  const [minLat, minLng, maxLat, maxLng] = bbox.split(',').map(Number)
  if ([minLat, minLng, maxLat, maxLng].some(Number.isNaN)) {
    throw new Error('bbox inválido. Formato: minLat,minLng,maxLat,maxLng')
  }

  const query = `[out:json][timeout:90];
way["highway"~"${HIGHWAYS}"](${minLat},${minLng},${maxLat},${maxLng});
(._;>;);
out;`

  console.log(`Descargando extracto OSM "${id}" (${bbox}) desde Overpass…`)
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'catastrofe-logistica-tfm/1.0 (osm graph extractor)',
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`Overpass respondió ${res.status} ${res.statusText}`)
  const data = await res.json()

  // Nodos por id OSM
  const nodeCoords = new Map()
  for (const el of data.elements) {
    if (el.type === 'node') nodeCoords.set(el.id, [el.lat, el.lon])
  }

  // Reindexa solo los nodos usados por las vías y construye aristas.
  const indexById = new Map()
  const nodes = []
  const edges = []
  const idxOf = (osmId) => {
    let idx = indexById.get(osmId)
    if (idx === undefined) {
      const coord = nodeCoords.get(osmId)
      if (!coord) return -1
      idx = nodes.length
      nodes.push([Number(coord[0].toFixed(6)), Number(coord[1].toFixed(6))])
      indexById.set(osmId, idx)
    }
    return idx
  }

  let ways = 0
  for (const el of data.elements) {
    if (el.type !== 'way' || !Array.isArray(el.nodes)) continue
    ways += 1
    for (let i = 0; i < el.nodes.length - 1; i += 1) {
      const a = idxOf(el.nodes[i])
      const b = idxOf(el.nodes[i + 1])
      if (a >= 0 && b >= 0 && a !== b) edges.push([a, b])
    }
  }

  const grafo = { id, nombre, bbox: [minLat, minLng, maxLat, maxLng], nodes, edges }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(resolve(OUT_DIR, `${id}.json`), JSON.stringify(grafo), 'utf8')

  // Actualiza el manifiesto
  const manifestPath = resolve(OUT_DIR, 'manifest.json')
  let manifest = { extractos: [] }
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    /* primer extracto */
  }
  manifest.extractos = [
    ...manifest.extractos.filter((e) => e.id !== id),
    { id, nombre, bbox: grafo.bbox },
  ]
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log(`✓ ${nombre}: ${ways} vías → ${nodes.length} nodos, ${edges.length} aristas`)
  console.log(`  Escrito en public/osm/${id}.json y manifest.json`)
}

main().catch((err) => {
  console.error('Error generando el extracto OSM:', err.message)
  process.exit(1)
})
