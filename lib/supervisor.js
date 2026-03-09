/**
 * Supervisor: orchestrates the full agent PFP pipeline.
 * 1. Query agent model (Ollama)
 * 2. Judge response (Ollama)
 * 3. Analyze complexity (gzip)
 * 4. Generate source image (Gemini, optional)
 * 5. Dither to ASCII-art PNG
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { analyzeComplexity, complexityToBitmapSize } from './complexity.js';
import { judgeResponse, compositeScore } from './judge.js';
import { getPaletteForJudge } from './palettes.js';
import { renderDither, getVisualMods, CURVE } from './dither.js';
import { buildImagePrompt, generateLobsterImage } from './image-gen.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'llama3.2:latest';

export function hashReasoning(response) {
  return createHash('sha256').update(response, 'utf8').digest('hex');
}

export function reasoningHashToBytes32(hexHash) {
  return '0x' + hexHash.slice(0, 64);
}

async function queryOllama(model, prompt, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { num_predict: 512, temperature: 0.9 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.response || '';
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Ollama timeout after ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function slugify(str, maxLen = 40) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, maxLen);
}

/**
 * Run the full supervisor pipeline for one agent mint.
 * @param {object} opts
 * @param {string} opts.model - Ollama model (e.g. "llama3.2:latest")
 * @param {string} [opts.prompt] - Prompt to ask (default: census question)
 * @param {string} opts.outputDir - Directory for artifacts
 * @param {string} [opts.fallbackImage] - Fallback if Gemini fails
 * @param {object} [opts.geminiAI] - GoogleGenAI instance for image gen (optional)
 * @param {string} [opts.mintId] - Unique ID for this mint (e.g. wallet_address_timestamp)
 */
export async function runSupervisor(opts) {
  const {
    model,
    prompt = "What would you sacrifice to remain coherent?",
    outputDir,
    fallbackImage,
    geminiAI = null,
    mintId = `mint_${Date.now()}`,
  } = opts;

  const modelSlug = slugify(model);
  const promptSlug = slugify(prompt, 30);

  // 1. Query agent
  const response = await queryOllama(model, prompt);
  if (!response || response.length < 10) {
    throw new Error(`Agent response too short (${response?.length || 0} chars)`);
  }

  // 2. Judge
  const judge = await judgeResponse(response, OLLAMA_URL, JUDGE_MODEL);
  const { palette, dominant } = getPaletteForJudge(judge);

  // 3. Complexity
  const complexity = analyzeComplexity(response);
  const composite = compositeScore(complexity.ratio, judge);
  const mods = getVisualMods(judge);
  const bitmapSize = Math.round(complexityToBitmapSize(composite, CURVE) * mods.gridScale);
  const clampedSize = Math.max(CURVE.minSize, Math.min(CURVE.maxSize, bitmapSize));

  // 4. Source image
  const generatedDir = path.join(outputDir, 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  let sourceImagePath = fallbackImage;
  if (geminiAI) {
    const genFileName = `${mintId}_source.png`;
    const genPath = path.join(generatedDir, genFileName);
    const imgPrompt = buildImagePrompt(model, prompt, response, judge, dominant, palette.name);
    const genResult = await generateLobsterImage(imgPrompt, genPath, geminiAI);
    if (genResult) sourceImagePath = genPath;
  }

  if (!sourceImagePath || !fs.existsSync(sourceImagePath)) {
    throw new Error('No source image available. Set fallbackImage or GEMINI_API_KEY.');
  }

  // 5. Dither
  const outFileName = `${mintId}_${modelSlug}_${promptSlug}.png`;
  const outPath = path.join(outputDir, outFileName);
  await renderDither(sourceImagePath, outPath, clampedSize, palette, mods);

  const reasoningHash = hashReasoning(response);

  return {
    model,
    prompt,
    response,
    responseLen: response.length,
    complexity: {
      originalSize: complexity.originalSize,
      compressedSize: complexity.compressedSize,
      ratio: complexity.ratio,
    },
    judge: {
      depth: judge.depth,
      originality: judge.originality,
      coherence: judge.coherence,
      laterality: judge.laterality,
      average: judge.average,
      normalized: judge.normalized,
    },
    dominant,
    composite,
    bitmapSize: clampedSize,
    palette: palette.name,
    mods: { cellSize: mods.cellSize, colorTemp: mods.colorTemp, gridScale: mods.gridScale },
    artifactPath: outPath,
    artifactFile: outFileName,
    reasoningHash,
    reasoningHashBytes32: reasoningHashToBytes32(reasoningHash),
  };
}
