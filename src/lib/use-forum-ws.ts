import { useEffect, useRef, useCallback } from "react";
import { getSession } from "./forum-store";

export type WSPresenceUser = {
  userId: string;
  forumId: string;
  username: string;
  color: string;
  lastSeen: number;
};

export type WSMessagePayload = {
  id: number;
  forum_id: number;
  author_id: number;
  author_name: string;
  text: string;
  created_at: string;
  private_to_id: number | null;
};

export type WSSystemEvent = { text: string; at: number };

type Handlers = {
  onMessage?: (msg: WSMessagePayload) => void;
  onPresence?: (users: WSPresenceUser[]) => void;
  onTyping?: (payload: { userId: string; username: string; at: number }) => void;
  onSystemEvent?: (event: WSSystemEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

export function useForumWS(forumId: string, handlers: Handlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const activeRef = useRef(false);

  const connect = useCallback(() => {
    if (!activeRef.current) return;
    const session = getSession();
    if (!session?.token) return;

    try {
      const ws = new WebSocket(
        `ws://127.0.0.1:8000/ws/${forumId}?token=${encodeURIComponent(session.token)}`
      );
      wsRef.current = ws;

      ws.onopen = () => handlersRef.current.onConnected?.();

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.type === "message") handlersRef.current.onMessage?.(data.message);
          else if (data.type === "presence") handlersRef.current.onPresence?.(data.users);
          else if (data.type === "typing") handlersRef.current.onTyping?.(data.payload);
          else if (data.type === "system") handlersRef.current.onSystemEvent?.({ text: data.text, at: data.at });
        } catch {}
      };

      ws.onclose = () => {
        handlersRef.current.onDisconnected?.();
        if (!activeRef.current) return;
        retryRef.current = setTimeout(connect, 2500);
      };

      ws.onerror = () => ws.close();
    } catch {}
  }, [forumId]);

  const sendTyping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    connect();

    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 5000);

    return () => {
      activeRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { sendTyping };
}
