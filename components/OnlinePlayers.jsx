"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { playerStub, sendInvite } from "@/lib/chessGame";

const ONLINE_WINDOW_MS = 90 * 1000; // seen in the last 90s = online

export default function OnlinePlayers({ toast }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState(null);
  const [busy, setBusy] = useState(null);
  const [, setTick] = useState(0);

  // live presence list
  useEffect(() => {
    const q = query(collection(db, "presence"), orderBy("lastSeen", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => setPlayers(snap.docs.map((d) => d.data())),
      () => setPlayers([])
    );
    return unsub;
  }, []);

  // re-render every 20s so stale players drop off the list
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 20000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const online = (players || []).filter(
    (p) => p.uid !== user.uid && p.lastSeen && now - p.lastSeen.toMillis() < ONLINE_WINDOW_MS
  );

  async function invite(p) {
    if (busy) return;
    setBusy(p.uid);
    try {
      const gameId = await sendInvite(playerStub(user.uid, profile), p.uid, p.name, 300);
      toast(`Invite sent to ${p.name}!`);
      router.push(`/game/${gameId}`); // wait for them in the room
    } catch (e) {
      toast("Couldn't send invite: " + (e.code || e.message));
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="section-label">
        Online now {players !== null && <span className="online-count">· {online.length}</span>}
      </div>

      {players === null && <div className="muted" style={{ padding: 12 }}>Loading…</div>}
      {players !== null && online.length === 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: ".9rem", lineHeight: 1.5 }}>
            No one else is online right now. Share your site with a friend, or jump into a
            matchmaking queue — you&apos;ll be paired the moment someone joins.
          </div>
        </div>
      )}

      {online.map((p) => (
        <div key={p.uid} className="card lb-row">
          <span className="online-dot" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="avatar sm" src={p.photo || ""} alt="" referrerPolicy="no-referrer" />
          <div className="nm">
            {p.name}
            <div className="sub">Rating: {p.rating}</div>
          </div>
          <button className="btn small" onClick={() => invite(p)} disabled={!!busy}>
            {busy === p.uid ? "…" : "⚔ Invite"}
          </button>
        </div>
      ))}
    </div>
  );
}
