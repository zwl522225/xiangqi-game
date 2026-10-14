export type AiDifficulty = 'easy' | 'normal' | 'challenge'

export const difficultyProfiles = {
  easy: { label: '启蒙', help: '最多看一着，比较本着走法。', maxPlies: 1, rootCandidates: 12, maxNodes: 2000, timeoutMs: 1400 },
  normal: { label: '入门', help: '最多看二着，考虑对方下一着。', maxPlies: 2, rootCandidates: 12, maxNodes: 2000, timeoutMs: 1400 },
  challenge: { label: '挑战', help: '最多看三着，尝试再考虑自己的回应；受候选和计算量限制。', maxPlies: 3, rootCandidates: 12, maxNodes: 2000, timeoutMs: 2400 },
} as const

export function normalizeDifficulty(value: unknown): AiDifficulty {
  return value === 'easy' || value === 'challenge' ? value : 'normal'
}
