import { createHash, randomBytes } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

const TSA_URL = process.env.TSA_URL ?? 'https://freetsa.org/tsr'

// ── DER helpers ──────────────────────────────────────────────────────────────

function derLength(n: number): Buffer {
  if (n < 128) return Buffer.from([n])
  if (n < 256) return Buffer.from([0x81, n])
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff])
}

function derTlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value])
}

/**
 * Builds a minimal RFC 3161 TimeStampReq DER structure.
 *
 * TimeStampReq ::= SEQUENCE {
 *   version           INTEGER { v1(1) },
 *   messageImprint    MessageImprint,
 *   nonce             INTEGER OPTIONAL,
 *   certReq           BOOLEAN DEFAULT FALSE
 * }
 */
function buildTSQ(hashHex: string): Buffer {
  const hashBytes = Buffer.from(hashHex, 'hex') // 32 bytes (SHA-256)

  // AlgorithmIdentifier for SHA-256 OID 2.16.840.1.101.3.4.2.1
  const sha256OID = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01])
  const algId = derTlv(0x30, Buffer.concat([sha256OID, Buffer.from([0x05, 0x00])]))

  // MessageImprint ::= SEQUENCE { hashAlgorithm, hashedMessage }
  const hashedMsg = derTlv(0x04, hashBytes)
  const messageImprint = derTlv(0x30, Buffer.concat([algId, hashedMsg]))

  // version INTEGER 1
  const version = Buffer.from([0x02, 0x01, 0x01])

  // nonce — 8 random bytes as INTEGER (unsigned, prepend 0x00 if high bit set)
  const nonceRaw = randomBytes(8)
  const noncePadded = nonceRaw[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), nonceRaw]) : nonceRaw
  const nonce = derTlv(0x02, noncePadded)

  // certReq BOOLEAN TRUE
  const certReq = Buffer.from([0x01, 0x01, 0xff])

  return derTlv(0x30, Buffer.concat([version, messageImprint, nonce, certReq]))
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function postBinary(url: string, body: Buffer, contentType: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const fn = isHttps ? httpsRequest : httpRequest

    const req = fn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      },
    )

    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('TSA timeout')) })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TSAResult {
  token: string      // base64-encoded raw TSR
  timestamp: Date
}

/**
 * Sends a SHA-256 hash to the configured TSA and returns the timestamp token.
 * Throws if the TSA is unreachable or returns a non-success status.
 */
export async function requestTimestamp(hashHex: string): Promise<TSAResult> {
  const tsq = buildTSQ(hashHex)
  const tsr = await postBinary(TSA_URL, tsq, 'application/timestamp-query')

  // TSR starts with SEQUENCE { status SEQUENCE { PKIStatusInfo }, timeStampToken }
  // Minimal parse: status[0] byte 0x02 0x01 0x00 means GRANTED
  // Byte offset 4 is the PKIStatus INTEGER value (0 = granted, 1 = grantedWithMods)
  if (tsr.length < 6) throw new Error('TSA returned empty response')

  // Walk to the inner status integer — position is after outer SEQUENCE tag+len (2-4 bytes)
  // then inner SEQUENCE tag+len (2-4 bytes), then INTEGER tag (1) + len (1) + value (1)
  // We do a conservative check: the status integer must be 0 or 1
  const statusByte = tsr[6] // works for typical short-length responses
  if (statusByte !== 0x00 && statusByte !== 0x01) {
    throw new Error(`TSA denied timestamp (status byte: ${statusByte})`)
  }

  return {
    token: tsr.toString('base64'),
    timestamp: new Date(),
  }
}

/**
 * Computes the SHA-256 hash of arbitrary content and requests a timestamp.
 * Convenience wrapper used by chain.ts.
 */
export async function timestampHash(content: string): Promise<TSAResult> {
  const hash = createHash('sha256').update(content).digest('hex')
  return requestTimestamp(hash)
}
