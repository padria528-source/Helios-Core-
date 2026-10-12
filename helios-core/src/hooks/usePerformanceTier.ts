import { useCallback } from 'react'
import { TIER_CONFIG, lowerTier, type PerformanceTier, type TierSettings } from './tiers'
import { useExperienceStore } from '../store/experienceStore'

/** Reads the detected tier from the store and exposes a one-way step down. */
export function usePerformanceTier(): {
  tier: PerformanceTier
  settings: TierSettings
  degrade: () => void
} {
  const tier = useExperienceStore((s) => s.performanceTier)
  const setTier = useExperienceStore((s) => s.setPerformanceTier)

  const degrade = useCallback(() => {
    setTier(lowerTier(useExperienceStore.getState().performanceTier))
  }, [setTier])

  return { tier, settings: TIER_CONFIG[tier], degrade }
}
