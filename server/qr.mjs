// QR Model 2, version 6, error correction L, byte mode, mask 0.
// Fixed size covers ordinary Cloud Run URLs without a package or external service.
export function qrMatrix(text) {
  const data = new TextEncoder().encode(text)
  if (data.length > 134) throw Error('URL is too long for the QR code')
  const bits = []
  const append = (value, count) => { for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1) }
  append(4, 4); append(data.length, 8)
  for (const value of data) append(value, 8)
  append(0, Math.min(4, 1088 - bits.length))
  while (bits.length % 8) bits.push(0)
  const bytes = []
  for (let i = 0; i < bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((v, b) => v * 2 + b, 0))
  for (let i = 0; bytes.length < 136; i++) bytes.push(i % 2 ? 0x11 : 0xec)
  const multiply = (a, b) => {
    let result = 0
    for (let i = 0; i < 8; i++) { if (b & 1) result ^= a; b >>>= 1; a <<= 1; if (a & 256) a ^= 0x11d }
    return result
  }
  let generator = [1], power = 1
  for (let i = 0; i < 18; i++) {
    const next = Array(generator.length + 1).fill(0)
    generator.forEach((value, j) => { next[j] ^= value; next[j + 1] ^= multiply(value, power) })
    generator = next; power = multiply(power, 2)
  }
  const blocks = [bytes.slice(0, 68), bytes.slice(68)]
  const corrections = blocks.map(block => {
    const remainder = [...block, ...Array(18).fill(0)]
    for (let i = 0; i < block.length; i++) { const factor = remainder[i]; generator.forEach((value, j) => { remainder[i + j] ^= multiply(value, factor) }) }
    return remainder.slice(68)
  })
  const codewords = []
  for (let i = 0; i < 68; i++) for (const block of blocks) codewords.push(block[i])
  for (let i = 0; i < 18; i++) for (const block of corrections) codewords.push(block[i])
  const size = 41, matrix = Array.from({ length: size }, () => Array(size).fill(null))
  const put = (x, y, value) => { if (x >= 0 && y >= 0 && x < size && y < size) matrix[y][x] = Boolean(value) }
  for (const [x, y] of [[0, 0], [34, 0], [0, 34]]) {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) put(x + dx, y + dy, dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)))
  }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) put(34 + x, 34 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1)
  for (let i = 8; i < size - 8; i++) { put(i, 6, i % 2 === 0); put(6, i, i % 2 === 0) }
  const format = 0x77c4 // BCH encoded L + mask 0, XOR 0x5412.
  for (let i = 0; i < 15; i++) {
    const value = (format >>> i) & 1
    if (i < 6) put(8, i, value)
    else if (i === 6) put(8, 7, value)
    else if (i === 7) put(8, 8, value)
    else if (i === 8) put(7, 8, value)
    else put(14 - i, 8, value)
    if (i < 8) put(size - 1 - i, 8, value)
    else put(8, size - 15 + i, value)
  }
  put(8, size - 8, true)
  let index = 0, upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--
    for (let offset = 0; offset < size; offset++) {
      const y = upward ? size - 1 - offset : offset
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx
        if (matrix[y][x] !== null) continue
        const value = index < codewords.length * 8 ? (codewords[index >>> 3] >>> (7 - (index & 7))) & 1 : 0
        put(x, y, value ^ ((x + y) % 2 === 0 ? 1 : 0)); index++
      }
    }
    upward = !upward
  }
  return matrix
}
export function qrSvg(text) {
  const matrix = qrMatrix(text)
  const paths = []
  matrix.forEach((row, y) => row.forEach((value, x) => { if (value) paths.push(`M${x + 4},${y + 4}h1v1h-1z`) }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" width="245" height="245" shape-rendering="crispEdges"><rect width="49" height="49" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`
}
