// Seed catalog for the Positions repository — the "current" roles across
// medical practice, LTC/SNF, management company, laboratory, and hospital
// settings. Loaded into the data store on first run; users add/edit more
// (with AI assistance) from the Positions screen.
//
// Shape matches the `positions` table / Position type in ./positions.ts.
import type { Position } from './positions'

export type PositionSeed = Omit<Position, 'id' | 'created_at' | 'updated_at' | 'active'>

export const POSITION_SEED: PositionSeed[] = []
