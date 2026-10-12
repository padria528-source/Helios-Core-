import type { AnatomyId } from '../../sim/simulation'
import type { ViewId } from '../../store/experienceStore'

/** All interface copy in one place. */

export const SPECIMEN = {
  number: 'Specimen No. 002',
  name: 'Helios Core',
  collection: 'Mechanica Collection',
  tagline: 'A sun for a brighter tomorrow',
  serial: 'Stellar Engine // Atelier IX',
  facts: [
    ['Class', 'Energy Core'],
    ['Order', 'Solis Machina'],
    ['Family', 'Stellar Engine'],
    ['Origin', 'Atelier IX'],
    ['Year', '2024'],
  ] as const,
  verse: ['Light endures.', 'So do we.'] as const,
}

export const NAV: readonly { id: ViewId; index: string; label: string; hint: string }[] = [
  { id: 'observe', index: '01', label: 'Observe', hint: 'Watch the instrument run' },
  { id: 'explore', index: '02', label: 'Explore', hint: 'Examine its anatomy' },
  { id: 'interact', index: '03', label: 'Interact', hint: 'Operate the core' },
  { id: 'collect', index: '04', label: 'Collect', hint: 'Keep a plate of this view' },
]

export const ANATOMY: readonly { id: AnatomyId; name: string; material: string; note: string }[] = [
  {
    id: 'fins',
    name: 'Solar Fin',
    material: 'Brass · Etched Helios Mark',
    note: 'Six articulated shields that decide how much of the core the room is allowed to see.',
  },
  {
    id: 'rings',
    name: 'Gyro Rings',
    material: 'Counter-Rotating Stabilization',
    note: 'Four graduated rings on one polar axis, each turning at its own rate and in its own sense.',
  },
  {
    id: 'core',
    name: 'Plasma Core',
    material: 'Amber Containment · Stellar Heart',
    note: 'A white-hot heart held in turbulent plasma and sealed behind amber glass.',
  },
  {
    id: 'regulator',
    name: 'Regulator',
    material: 'Mechanical Harmonics',
    note: 'Piston, flywheel, gear train and balance: the output of a star, metered into motion.',
  },
  {
    id: 'anchor',
    name: 'Anchor',
    material: 'Forged Steel · Brass',
    note: 'Forged struts and a graduated pedestal carry the instrument and its inscription.',
  },
]

export const PLATE = {
  title: "Collector's Plate",
  lines: [
    ['Plate', '002 · Mechanica Collection'],
    ['Edition', 'Museum proof'],
    ['Serial', 'HC · IX · 0002'],
    ['Materials', 'Antique brass, forged steel, amber glass'],
  ] as const,
  note: 'Frames the view you have composed, with its specimen label, as a PNG.',
}
