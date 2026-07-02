"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export default function Chat({ gameId, canChat }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "games", gameId, "chat"),
      orderBy("createdAt", "asc"),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [gameId, user]);

  // auto-scroll to the newest message
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  async function send() {
    const t = text.trim();
    if (!t || !canChat) return;
    setText("");
    try {
      await addDoc(collection(db, "games", gameId, "chat"), {
        uid: user.uid,
        name: profile.name,
        text: t.slice(0, 300),
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Chat send failed:", e);
    }
  }

  return (
    <div className="card chat-box">
      <button className="chat-head" onClick={() => setOpen((o) => !o)}>
        <span>💬 Chat</span>
        <span className="muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <div className="muted chat-empty">Say hello…</div>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg${m.uid === user?.uid ? " mine" : ""}`}>
                <span className="chat-name">{m.uid === user?.uid ? "You" : m.name}</span>
                <span className="chat-bubble">{m.text}</span>
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={canChat ? "Say hello…" : "Spectators can't chat"}
              disabled={!canChat}
              maxLength={300}
              aria-label="Chat message"
            />
            <button className="btn small" onClick={send} disabled={!canChat || !text.trim()}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
