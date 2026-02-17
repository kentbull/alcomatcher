import { randomUUID } from "node:crypto";

export type RealtimeEventType = "sync.ack" | "application.status_changed" | "batch.progress" | "scan.progress";

export interface RealtimeEventEnvelope {
  eventId: string;
  type: RealtimeEventType;
  timestamp: string;
  applicationId?: string;
  batchId?: string;
  scope: "mobile" | "admin" | "all";
  data: Record<string, unknown>;
}

interface SubscriberFilter {
  applicationId?: string;
  batchId?: string;
  scope?: "mobile" | "admin" | "all";
}

type SubscriberHandler = (event: RealtimeEventEnvelope) => void;

interface Subscriber {
  filter: SubscriberFilter;
  handler: SubscriberHandler;
}

/**
 * In-process pub/sub bus for SSE fanout.
 * Durable history/replay is intentionally out of scope for v1.
 */
class RealtimeEventBus {
  private readonly subscribers = new Map<string, Subscriber>();

  subscribe(filter: SubscriberFilter, handler: SubscriberHandler) {
    const subscriberId = randomUUID();
    this.subscribers.set(subscriberId, { filter, handler });
    return () => {
      this.subscribers.delete(subscriberId);
    };
  }

  publish(event: Omit<RealtimeEventEnvelope, "eventId" | "timestamp">) {
    const envelope: RealtimeEventEnvelope = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString()
    };

    for (const subscriber of this.subscribers.values()) {
      if (!this.matches(subscriber.filter, envelope)) continue;
      subscriber.handler(envelope);
    }
  }

  private matches(filter: SubscriberFilter, event: RealtimeEventEnvelope) {
    if (filter.scope && filter.scope !== "all" && event.scope !== "all" && filter.scope !== event.scope) {
      return false;
    }
    if (filter.applicationId && filter.applicationId !== event.applicationId) {
      return false;
    }
    if (filter.batchId && filter.batchId !== event.batchId) {
      return false;
    }
    return true;
  }
}

export const realtimeEventBus = new RealtimeEventBus();
