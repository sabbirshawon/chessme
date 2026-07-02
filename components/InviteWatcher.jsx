"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection, doc, query, where, onSnapshot, updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { playerStub, claimSeat } from "@/lib/chessGame";

const INVITE_TTL_MS = 2 * 60 * 1000; // invites expire after 2 minutes

/** Listens for incoming challenges and shows an accept/decline banner. */
export default function InviteWatcher({ toast }) {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "invites"),
      where("to", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(q, (snap) => {
      setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  const now = Date.now();
  const fresh = invites.filter(
    (i) => !i.createdAt || now - i.createdAt.toMillis() < INVITE_TTL_MS
  );
  if (!fresh.length) return null;
  const inv = fresh[fresh.length - 1]; // newest

  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      await claimSeat(inv.gameId, playerStub(user.uid, profile));
      await updateDoc(doc(db, "invites", inv.id), { status: "accepted" });
      router.push(`/game/${inv.gameId}`);
    } catch {
      toast("That invite is no longer available.");
      updateDoc(doc(db, "invites", inv.id), { status: "declined" }).catch(() => {});
      setBusy(false);
    }
  }

  function decline() {
    updateDoc(doc(db, "invites", inv.id), { status: "declined" }).catch(() => {});
  }

  return (
    <div className="card invite-banner">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="avatar sm" src={inv.from?.photo || ""} alt="" referrerPolicy="no-referrer" />
      <div className="nm">
        <b>{inv.from?.name}</b> challenges you!
        <div className="sub muted">
          {Math.round((inv.timeControl || 300) / 60)} min game · rating {inv.from?.rating}
        </div>
      </div>
      <button className="btn small" onClick={accept} disabled={busy}>
        {busy ? "…" : "Accept"}
      </button>
      <button className="btn ghost small" onClick={decline} disabled={busy}>
        Decline
      </button>
    </div>
  );
}
