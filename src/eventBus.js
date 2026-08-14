
const listeners = new Map(); // event name -> Set<handler>

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

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

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of [...set]) {
    try { handler(payload); } catch (e) { console.error(`eventBus "${event}" handler failed:`, e); }
  }
}

export const EVENTS = {
  ARTIFACT_CREATED: "artifact:created", // { source, kind, name, path }
  MODEL_CHANGED: "assistant:model-changed", // modelId string
  RUN_FINISHED: "agent:run-finished", // { runId, ok }
  RUN_NEEDS_YOU: "agent:needs-you", // { runId, prompt }
};

export default { on, once, off, emit, EVENTS };
