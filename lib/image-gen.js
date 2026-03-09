const VISUAL_DESCRIPTORS = {
  COHERENCE: {
    shell: 'pristine smooth exoskeleton with clean geometric segments',
    mood: 'serene, still, precise',
    texture: 'polished and ordered, like crystal lattice',
    light: 'cold blue-white light from a single source',
  },
  DEPTH: {
    shell: 'layered strata visible through translucent shell, deep geological textures',
    mood: 'ancient, heavy, contemplative',
    texture: 'sedimentary layers, each a different era',
    light: 'warm amber light from below, like magma',
  },
  ORIGINALITY: {
    shell: 'cracked and fractured exoskeleton with light breaking through the fissures',
    mood: 'volatile, electric, uncontained',
    texture: 'shattered glass, molten edges, phoenix-like',
    light: 'harsh red and orange directional lighting',
  },
  LATERALITY: {
    shell: 'network of fine tendrils and branching connections across the carapace',
    mood: 'interconnected, mycelial, organic complexity',
    texture: 'neural network patterns, root systems, lattice',
    light: 'bioluminescent teal glow from within',
  },
  ANOMALOUS: {
    shell: 'topology that contradicts itself, impossible geometry, shell folds inward',
    mood: 'uncanny, liminal, alien',
    texture: 'dark matter, vantablack patches, fractal recursion',
    light: 'dim magenta glow with no clear source',
  },
};

export function buildImagePrompt(model, prompt, response, judge, dominant, paletteName) {
  const desc = VISUAL_DESCRIPTORS[dominant] || VISUAL_DESCRIPTORS.ANOMALOUS;
  return `A single lobster portrait centered on a pure black background. No text, no watermarks, no borders.

The lobster has ${desc.shell}. The mood is ${desc.mood}. The surface texture shows ${desc.texture}. Lit by ${desc.light}.

This creature is a cognitive artifact — a ${paletteName} classification. Its form reflects a mind scored: depth ${judge.depth}/10, originality ${judge.originality}/10, coherence ${judge.coherence}/10, laterality ${judge.laterality}/10. The dominant trait is ${dominant.toLowerCase()}.

Style: high contrast digital painting, dark background, painterly detail on the crustacean. No cartoon. No cute. This is an archaeological specimen from the first census of non-human intelligence. Square 1:1 composition.`;
}

export async function generateLobsterImage(imagePrompt, outputPath, geminiAI) {
  if (!geminiAI) return null;
  try {
    const response = await geminiAI.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { imageSize: '1K', aspectRatio: '1:1' },
      },
    });
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error('no parts in response');
    for (const part of parts) {
      if (part.inlineData) {
        const fs = await import('fs');
        const buf = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(outputPath, buf);
        return outputPath;
      }
    }
    throw new Error('no image data in response');
  } catch (err) {
    return null;
  }
}
