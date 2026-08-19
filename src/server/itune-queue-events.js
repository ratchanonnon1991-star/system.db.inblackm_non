const EVENT_BUS_KEY = Symbol.for("projectm.itune.queue-events");

function getEventBus() {
  if (!globalThis[EVENT_BUS_KEY]) {
    globalThis[EVENT_BUS_KEY] = { revision: 0, listeners: new Set() };
  }
  return globalThis[EVENT_BUS_KEY];
}

export function publishItuneQueueChanged() {
  const bus = getEventBus();
  bus.revision += 1;
  for (const listener of bus.listeners) listener(bus.revision);
}

export function subscribeToItuneQueue(listener) {
  const bus = getEventBus();
  bus.listeners.add(listener);
  return () => bus.listeners.delete(listener);
}
