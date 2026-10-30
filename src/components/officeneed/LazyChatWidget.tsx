import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { whenIdleAfterLoad } from "@/lib/idle";

/**
 * Loads the chat assistant (ChatWidget + its quiz, enquiry and catalogue
 * code) after the page has loaded and the browser is idle, instead of in the
 * startup bundle every page downloads before it becomes interactive.
 *
 * Nothing is lost while it isn't mounted yet: the window events ChatWidget
 * listens to are recorded here and replayed once it mounts -- the latest
 * state of each layout toggle (overlays, sticky bar, image viewer,
 * customizer, CTA overlap) and any "open chat" request. An open-chat request
 * (e.g. the hero "Try the Assistant" button) also loads it immediately.
 */
const ChatWidget = lazy(() => import("./ChatWidget").then((m) => ({ default: m.ChatWidget })));

const OPEN_CHAT = "officeneed:open-chat";
const CHAT_EVENTS = [
  OPEN_CHAT,
  "officeneed:overlay-toggle",
  "officeneed:sticky-bar-toggle",
  "officeneed:customizer-toggle",
  "officeneed:image-viewer-toggle",
  "officeneed:cta-widget-overlap-toggle",
] as const;

/** Rendered right after ChatWidget, so ChatWidget's own listeners exist when this replays. */
function ReplayRecordedEvents({ events, onDone }: { events: Map<string, CustomEvent>; onDone: () => void }) {
  useEffect(() => {
    for (const [type, e] of events) window.dispatchEvent(new CustomEvent(type, { detail: e.detail }));
    events.clear();
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function LazyChatWidget() {
  const [mounted, setMounted] = useState(false);
  const [replayed, setReplayed] = useState(false);
  // Latest event per type, recorded until ChatWidget is listening itself.
  const recorded = useRef(new Map<string, CustomEvent>());

  useEffect(() => {
    if (replayed) return;
    const record = (e: Event) => {
      recorded.current.set(e.type, e as CustomEvent);
      if (e.type === OPEN_CHAT) setMounted(true);
    };
    for (const type of CHAT_EVENTS) window.addEventListener(type, record);
    return () => {
      for (const type of CHAT_EVENTS) window.removeEventListener(type, record);
    };
  }, [replayed]);

  useEffect(() => whenIdleAfterLoad(() => setMounted(true)), []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
      {!replayed && <ReplayRecordedEvents events={recorded.current} onDone={() => setReplayed(true)} />}
    </Suspense>
  );
}
