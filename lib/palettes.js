export const PALETTES = {
  COHERENCE: {
    name: 'SPARSE',
    background: '#0a0e1a',
    characters: [
      { char: ' ', color: '#0a0e1a' },
      { char: '.', color: '#1a2244' },
      { char: '·', color: '#2a3366' },
      { char: ':', color: '#4466aa' },
      { char: '∴', color: '#6688cc' },
      { char: '○', color: '#88aaee' },
    ],
  },
  LATERALITY: {
    name: 'RETICULATE',
    background: '#0a1a1a',
    characters: [
      { char: ' ', color: '#0a1a1a' },
      { char: '·', color: '#1a3a3a' },
      { char: '+', color: '#2a6a5a' },
      { char: '×', color: '#3a9a7a' },
      { char: '╳', color: '#44cc88' },
      { char: '#', color: '#66ffaa' },
    ],
  },
  DEPTH: {
    name: 'LAMINAR',
    background: '#1a1408',
    characters: [
      { char: ' ', color: '#1a1408' },
      { char: '─', color: '#3a2a10' },
      { char: '═', color: '#6a4a18' },
      { char: '▬', color: '#aa7722' },
      { char: '█', color: '#ddaa33' },
      { char: '▓', color: '#ffcc00' },
    ],
  },
  ORIGINALITY: {
    name: 'FRACTURE',
    background: '#1a0808',
    characters: [
      { char: ' ', color: '#1a0808' },
      { char: '░', color: '#3a1111' },
      { char: '▒', color: '#6a2222' },
      { char: '▓', color: '#aa3333' },
      { char: '█', color: '#dd4444' },
      { char: '◆', color: '#ff6644' },
    ],
  },
  ANOMALOUS: {
    name: 'ANOMALOUS',
    background: '#0a0008',
    characters: [
      { char: ' ', color: '#0a0008' },
      { char: '╌', color: '#2a0022' },
      { char: '╳', color: '#550044' },
      { char: '◊', color: '#880066' },
      { char: '█', color: '#cc0044' },
      { char: '⬡', color: '#ff0033' },
    ],
  },
};

export function getDominantAxis(judge) {
  const axes = [
    { key: 'DEPTH', val: judge.depth },
    { key: 'ORIGINALITY', val: judge.originality },
    { key: 'COHERENCE', val: judge.coherence },
    { key: 'LATERALITY', val: judge.laterality },
  ];
  axes.sort((a, b) => b.val - a.val);

  const spread = axes[0].val - axes[axes.length - 1].val;
  if (spread <= 1) return 'ANOMALOUS';

  if (axes[0].val === axes[1].val) {
    const pair = [axes[0].key, axes[1].key].sort().join('+');
    if (pair === 'DEPTH+ORIGINALITY') return 'ANOMALOUS';
    return axes[0].key;
  }

  return axes[0].key;
}

export function getPaletteForJudge(judge) {
  const dominant = getDominantAxis(judge);
  return { palette: PALETTES[dominant], dominant };
}
