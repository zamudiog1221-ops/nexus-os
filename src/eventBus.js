// Phase 1 foundation: a tiny in-app event bus.
//
// Modules don't own each other, so cross-module signals (an artifact was
// created, a scan finished, the selected model changed) should travel through
// one shared bus rather than direct imports. This is the seam the Phase 2
// artifact bus (Voice Notes -> Files) plugs into: emit "artifact:created" here,
// have Files subscribe, and no module needs a reference to any other.
//
// Deliberately dependency-free and synchronous. Handlers run in subscription
// order; a throwing handler is isolated so one bad listener can't break the
// emit for the others.

const listeners = new Map(); // event name -> Set<handler>

// Subscribe to an event. Returns an unsubscribe function.
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

// Subscribe for a single fire, then auto-unsubscribe.
export function once(event, handler) {
  const wrapped = (payload) => {
    off(event, wrapped);
    handler(payload);
  };
  return on(event, wrapped);
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

// Emit an event to every current subscriber. Errors are contained per handler.
export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  // Copy so a handler that (un)subscribes mid-emit doesn't corrupt iteration.
  for (const handler of [...set]) {
    try { handler(payload); } catch (e) { console.error(`eventBus "${event}" handler failed:`, e); }
  }
}

// Known event names, kept in one place so producers and consumers agree.
// Add here as modules start speaking to each other.
export const EVENTS = {
  ARTIFACT_CREATED: "artifact:created", // { source, kind, name, path }
  MODEL_CHANGED: "assistant:model-changed", // modelId string
  RUN_FINISHED: "agent:run-finished", // { runId, ok }
  RUN_NEEDS_YOU: "agent:needs-you", // { runId, prompt }
};

export default { on, once, off, emit, EVENTS };
