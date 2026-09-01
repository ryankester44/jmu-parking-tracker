"use client";

/**
 * Tiny in-browser event so data panels can refetch immediately after a
 * manual "Collect Now" click, instead of waiting for their next 60s poll.
 * The 60s poll (present on every data panel) still exists as the fallback
 * for the other collection path — `npm run collector` running in a
 * separate terminal has no way to reach into the browser directly.
 */
const EVENT_NAME = "jmu-parking:collected";

export function emitCollected() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onCollected(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
