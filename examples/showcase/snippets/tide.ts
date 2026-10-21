// The tour's snippet file: slides import its regions with `<<< @/snippets/tide.ts#name`.

// #region model
export interface Tide {
  /** Metres above chart datum. */
  height: number;
  at: Date;
}
// #endregion model

// #region ask
export function nextHighWater(now: Date, period = 745): Date {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const wait = (period - (minutes % period)) % period;
  return new Date(now.getTime() + wait * 60_000);
}
// #endregion ask

// #region edit
export const harbour = "Kadal";
export const greeting = `High water at ${harbour}`;
// #endregion edit
