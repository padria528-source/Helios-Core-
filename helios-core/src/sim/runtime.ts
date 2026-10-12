import { createSimState } from './simulation'

/** The live machine state. Scene components read it inside useFrame. */
export const sim = createSimState()
