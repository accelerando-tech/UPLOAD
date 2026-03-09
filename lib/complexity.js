import zlib from 'zlib';

const GZIP_HEADER_OVERHEAD = 18;

/**
 * Gzip compression ratio as approximation of Kolmogorov complexity.
 * Complex text → high ratio. Repetitive text → low ratio.
 */
export function analyzeComplexity(text) {
  const original = Buffer.from(text, 'utf-8');
  const compressed = zlib.gzipSync(original, { level: 9 });
  const originalSize = original.length;
  const compressedSize = compressed.length;
  const effectiveCompressed = Math.max(0, compressedSize - GZIP_HEADER_OVERHEAD);
  const ratio = originalSize > 0
    ? Math.min(1, effectiveCompressed / originalSize)
    : 0;
  return { originalSize, compressedSize, effectiveCompressed, ratio };
}

export function complexityToBitmapSize(score, curve = {}) {
  const {
    minSize = 6,
    maxSize = 80,
    curveSteepness = 5,
    curveMidpoint = 0.45,
  } = curve;
  const sigmoid = 1 / (1 + Math.exp(-curveSteepness * (score - curveMidpoint)));
  return Math.max(minSize, Math.min(maxSize, Math.round(minSize + sigmoid * (maxSize - minSize))));
}
