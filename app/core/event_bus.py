"""In-process SSE event fan-out, keyed by scan_id.

Buffers every event published for a scan so a client connecting mid-scan
(or reconnecting) replays history before joining the live tail. This is the
`asyncio.Queue`-based option the spec calls out as acceptable for a
single-instance MVP deployment (the alternative being a Redis pub/sub
channel, needed only once this runs as more than one process).
"""

import asyncio
from collections.abc import AsyncGenerator

_END_SENTINEL = {"type": "__end__"}


class ScanEventBus:
    def __init__(self) -> None:
        self._buffers: dict[str, list[dict]] = {}
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._done: set[str] = set()

    def create(self, scan_id: str) -> None:
        self._buffers[scan_id] = []
        self._subscribers[scan_id] = []

    async def publish(self, scan_id: str, event: dict) -> None:
        self._buffers.setdefault(scan_id, []).append(event)
        for queue in self._subscribers.get(scan_id, []):
            await queue.put(event)

    async def mark_done(self, scan_id: str) -> None:
        self._done.add(scan_id)
        for queue in self._subscribers.get(scan_id, []):
            await queue.put(_END_SENTINEL)

    async def subscribe(self, scan_id: str) -> AsyncGenerator[dict, None]:
        for event in list(self._buffers.get(scan_id, [])):
            yield event
            if event.get("type") == "scan_complete":
                return

        if scan_id in self._done:
            return

        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(scan_id, []).append(queue)
        try:
            while True:
                event = await queue.get()
                if event is _END_SENTINEL or event.get("type") == "__end__":
                    return
                yield event
                if event.get("type") == "scan_complete":
                    return
        finally:
            subs = self._subscribers.get(scan_id)
            if subs and queue in subs:
                subs.remove(queue)


scan_event_bus = ScanEventBus()
