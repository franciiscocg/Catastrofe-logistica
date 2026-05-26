import { randomBytes } from 'node:crypto'
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
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks)
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`TSA HTTP error (${res.statusCode ?? 'unknown'})`))
            return
          }
          resolve(responseBody)
        })
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

function readLength(buffer: Buffer, offset: number) {
  const first = buffer[offset]
  if (first === undefined) throw new Error('Malformed TSA response')
  if ((first & 0x80) === 0) return { length: first, bytes: 1 }

  const size = first & 0x7f
  if (size < 1 || size > 4 || offset + size >= buffer.length) throw new Error('Malformed TSA response')
  let length = 0
  for (let i = 1; i <= size; i += 1) length = (length << 8) | buffer[offset + i]
  return { length, bytes: size + 1 }
}

function readTlv(buffer: Buffer, offset: number, expectedTag: number) {
  if (buffer[offset] !== expectedTag) throw new Error('Malformed TSA response')
  const { length, bytes } = readLength(buffer, offset + 1)
  const valueStart = offset + 1 + bytes
  const valueEnd = valueStart + length
  if (valueEnd > buffer.length) throw new Error('Malformed TSA response')
  return { valueStart, valueEnd }
}

/**
 * Sends a SHA-256 hash to the configured TSA and returns the timestamp token.
 * Throws if the TSA is unreachable or returns a non-success status.
 */
export async function requestTimestamp(hashHex: string): Promise<TSAResult> {
  const tsq = buildTSQ(hashHex)
  const tsr = await postBinary(TSA_URL, tsq, 'application/timestamp-query')

  const outer = readTlv(tsr, 0, 0x30)
  const statusInfo = readTlv(tsr, outer.valueStart, 0x30)
  const statusInteger = readTlv(tsr, statusInfo.valueStart, 0x02)
  const statusBytes = tsr.subarray(statusInteger.valueStart, statusInteger.valueEnd)
  const status = statusBytes.reduce((value, byte) => (value << 8) | byte, 0)
  if (status !== 0 && status !== 1) {
    throw new Error(`TSA denied timestamp (status: ${status})`)
  }
  if (statusInfo.valueEnd >= outer.valueEnd) {
    throw new Error('TSA granted timestamp without a token')
  }

  return {
    token: tsr.toString('base64'),
    timestamp: new Date(),
  }
}

/**
 * Requests a timestamp for a SHA-256 event hash that is already computed.
 */
export async function timestampHash(hashHex: string): Promise<TSAResult> {
  if (!/^[a-f0-9]{64}$/i.test(hashHex)) throw new Error('Invalid SHA-256 hash')
  return requestTimestamp(hashHex)
}
