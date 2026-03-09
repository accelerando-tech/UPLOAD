import { createCanvas, loadImage } from 'canvas';

const CURVE = {
  minSize: 6,
  maxSize: 80,
  baseCellSize: 32,
  curveSteepness: 5,
  curveMidpoint: 0.45,
};

function floydSteinbergDither(pixels, width, height, numLevels) {
  const grid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = Math.max(0, Math.min(1, pixels[idx]));
      const level = Math.round(oldVal * (numLevels - 1));
      const clamped = Math.max(0, Math.min(numLevels - 1, level));
      grid[idx] = clamped;
      const quantized = clamped / (numLevels - 1);
      const error = oldVal - quantized;
      if (x + 1 < width)
        pixels[idx + 1] += error * 7 / 16;
      if (y + 1 < height) {
        if (x > 0)
          pixels[(y + 1) * width + (x - 1)] += error * 3 / 16;
        pixels[(y + 1) * width + x] += error * 5 / 16;
        if (x + 1 < width)
          pixels[(y + 1) * width + (x + 1)] += error * 1 / 16;
      }
    }
  }
  return grid;
}

function shiftColor(hex, warmth) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const rShift = Math.round(r + (warmth - 0.5) * 40);
  const bShift = Math.round(b - (warmth - 0.5) * 30);
  const clamp = v => Math.max(0, Math.min(255, v));
  return `#${clamp(rShift).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(bShift).toString(16).padStart(2, '0')}`;
}

export function getVisualMods(judge) {
  const cellSize = Math.round(CURVE.baseCellSize * (0.7 + (judge.depth / 10) * 0.6));
  const colorTemp = judge.originality / 10;
  const gridScale = 0.6 + (judge.laterality / 10) * 0.8;
  return { cellSize, colorTemp, gridScale };
}

/**
 * Render dithered ASCII-art PNG from source image.
 * @param {string} inputImagePath - Path to source image
 * @param {string} outputPath - Where to write PNG
 * @param {number} size - Bitmap grid size (e.g. 50)
 * @param {object} palette - { background, characters }
 * @param {object} mods - { cellSize, colorTemp }
 * @returns {{ width, height }}
 */
export async function renderDither(inputImagePath, outputPath, size, palette, mods) {
  const { cellSize, colorTemp } = mods;
  const { background, characters } = palette;
  const numLevels = characters.length;

  const img = await loadImage(inputImagePath);
  const tmpCanvas = createCanvas(size, size);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(img, 0, 0, size, size);
  const imageData = tmpCtx.getImageData(0, 0, size, size);

  const pixels = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    pixels[i] = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  const grid = floydSteinbergDither(pixels, size, size, numLevels);

  const outW = size * cellSize;
  const outH = size * cellSize;
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = shiftColor(background, colorTemp);
  ctx.fillRect(0, 0, outW, outH);
  ctx.font = `bold ${Math.floor(cellSize * 0.85)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const charIdx = grid[y * size + x];
      const { char, color } = characters[charIdx];
      if (char.trim()) {
        ctx.fillStyle = shiftColor(color, colorTemp);
        ctx.fillText(char, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
      }
    }
  }

  const fs = await import('fs');
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buf);

  return { width: outW, height: outH };
}

export { CURVE };
