// Theater store — the "take control" mode of the agent widget.
//
// A tiny module-level pub/sub (no context, no deps). The agent widget calls
// enter()/exit(); HomePage subscribes and mounts the fullscreen AgentTheater
// overlay while active. The grid layout itself is never touched — theater is
// a transient view over it.

type TheaterListener = (active: boolean) => void;

let active = false;
const listeners = new Set<TheaterListener>();

export function isTheaterActive(): boolean {
  return active;
}

export function enterTheater(): void {
  if (active) return;
  active = true;
  listeners.forEach((l) => l(true));
}

export function exitTheater(): void {
  if (!active) return;
  active = false;
  listeners.forEach((l) => l(false));
}

/** Subscribe to theater on/off transitions. Returns a disposer. */
export function subscribeTheater(listener: TheaterListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
