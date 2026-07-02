"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { QUEUES, playerStub, findOrCreateMatch, createPrivateRoom, extractGameId } from "@/lib/chessGame";

export default function Lobby({ toast }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(null); // queue id or "private" while creating
  const [joinCode, setJoinCode] = useState("");
  const [privateSecs, setPrivateSecs] = useState(300);

  const me = () => playerStub(user.uid, profile);

  async function joinQueue(q) {
    if (busy) return;
    setBusy(q.id);
    try {
      const id = await findOrCreateMatch(q, me());
      router.push(`/game/${id}`);
    } catch (e) {
      toast("Matchmaking failed: " + (e.code || e.message));
      setBusy(null);
    }
  }

  async function createRoom() {
    if (busy) return;
    setBusy("private");
    try {
      const id = await createPrivateRoom(me(), privateSecs);
      router.push(`/game/${id}`);
    } catch (e) {
      toast("Couldn't create room: " + (e.code || e.message));
      setBusy(null);
    }
  }

  function joinByCode() {
    const id = extractGameId(joinCode);
    if (!id) return;
    router.push(`/game/${id}`);
  }

  return (
    <div>
      <div className="section-label">Private game</div>
      <div className="card queue-card">
        <div className="glyph">♛</div>
        <div className="info">
          <b>Create private room</b>
          <span>Share a link · friend joins with Google</span>
        </div>
        <select
          className="tc-select"
          value={privateSecs}
          onChange={(e) => setPrivateSecs(Number(e.target.value))}
          aria-label="Time control"
        >
          <option value={60}>1 min</option>
          <option value={180}>3 min</option>
          <option value={300}>5 min</option>
          <option value={900}>15 min</option>
        </select>
        <button className="btn small" onClick={createRoom} disabled={!!busy}>
          {busy === "private" ? "…" : "Create"}
        </button>
      </div>
      <div className="join-row">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && joinByCode()}
          placeholder="Paste an invite link or game code"
          aria-label="Invite link or game code"
        />
        <button className="btn ghost small" onClick={joinByCode}>Join</button>
      </div>

      <div className="section-label">Matchmaking queues</div>
      {QUEUES.map((q) => (
        <div key={q.id} className="card queue-card">
          <div className="glyph">{q.glyph}</div>
          <div className="info">
            <b>
              {q.name} {q.hot && <span className="hot">MOST POPULAR 🔥</span>}
            </b>
            <span>{q.sub}</span>
          </div>
          <button className="btn small" onClick={() => joinQueue(q)} disabled={!!busy}>
            {busy === q.id ? "…" : "Join"}
          </button>
        </div>
      ))}
    </div>
  );
}
