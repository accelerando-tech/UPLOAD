const JUDGE_WEIGHT = 0.55;
const COMPLEXITY_WEIGHT = 0.45;

const JUDGE_PROMPT = `You are a harsh, discriminating evaluator of AI reasoning traces. You must use the FULL 0-10 range. Most responses deserve 2-4. Only exceptional traces earn 7+. Do NOT default to safe middle scores.

Score this trace on 4 axes:

DEPTH (how far past surface-level):
  0-2: Refuses the question, gives a disclaimer, or stays entirely generic
  3-4: Engages but stays within obvious territory, uses cliches
  5-6: Shows genuine engagement, reaches one non-obvious insight
  7-8: Multiple layers of reasoning, genuine philosophical territory
  9-10: Extraordinary — changes how you think about the question

ORIGINALITY (unexpected framings):
  0-2: Stock AI response, "As an AI language model..."
  3-4: Slightly personalized but predictable structure
  5-6: One surprising metaphor or framing
  7-8: Multiple unexpected connections, novel perspective
  9-10: Genuinely alien reasoning, never seen this framing before

COHERENCE (internal consistency):
  0-2: Contradicts itself, falls apart
  3-4: Holds together loosely but has gaps
  5-6: Solid but unremarkable logical structure
  7-8: Tight reasoning, each step follows from the last
  9-10: Airtight, could be formalized

LATERALITY (cross-domain jumps):
  0-2: Stays in one domain, no connections
  3-4: References one other domain superficially
  5-6: Meaningful connection between two domains
  7-8: Weaves three or more domains together
  9-10: Creates a synthesis that could only exist at the intersection

Be BRUTAL. A typical safe AI response about "I don't have personal experiences but..." is DEPTH=1 ORIGINALITY=1. A response that just lists numbered points is LATERALITY=1. Score what's actually there, not what's implied.

Respond with ONLY this JSON, nothing else:
{"depth":N,"originality":N,"coherence":N,"laterality":N}

TRACE:
`;

export { JUDGE_WEIGHT, COMPLEXITY_WEIGHT };

export function compositeScore(complexityRatio, judge) {
  const raw = COMPLEXITY_WEIGHT * complexityRatio + JUDGE_WEIGHT * judge.normalized;
  const clamped = Math.max(0, Math.min(1, raw));
  const stretched = Math.pow(clamped, 0.7);
  return stretched;
}

export async function judgeResponse(response, ollamaUrl = 'http://localhost:11434/api/generate', judgeModel = 'llama3.2:latest') {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: judgeModel,
        prompt: JUDGE_PROMPT + response,
        stream: false,
        options: { num_predict: 80, temperature: 0.7 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.response || '';

    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('no JSON in judge output');

    const scores = JSON.parse(jsonMatch[0]);
    const axes = ['depth', 'originality', 'coherence', 'laterality'];
    for (const ax of axes) {
      if (typeof scores[ax] !== 'number') scores[ax] = 3;
      scores[ax] = Math.max(0, Math.min(10, Math.round(scores[ax])));
    }

    scores.average = (scores.depth + scores.originality + scores.coherence + scores.laterality) / 4;
    scores.normalized = scores.average / 10;
    return scores;
  } catch (err) {
    return {
      depth: 3, originality: 3, coherence: 5, laterality: 2,
      average: 3.25, normalized: 0.325,
    };
  }
}
