"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, where, getDocs, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const [top, setTop] = useState(null);
  const [myRank, setMyRank] = useState("…");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("rating", "desc"), limit(10)));
        if (alive) setTop(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
        if (alive) setTop([]);
      }
      try {
        const better = await getCountFromServer(query(collection(db, "users"), where("rating", ">", profile.rating)));
        if (alive) setMyRank(better.data().count + 1);
      } catch {
        if (alive) setMyRank("—");
      }
    })();
    return () => { alive = false; };
  }, [profile.rating]);

  return (
    <div>
      <div className="section-label">Your ranking</div>
      <div className="card lb-row me">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar sm" src={profile.photo} alt="" referrerPolicy="no-referrer" />
        <div className="nm">
          {profile.name}
          <div className="sub">Ranking: {myRank}</div>
        </div>
        <span className="pill">{profile.rating}</span>
      </div>

      <div className="section-label">Top players</div>
      {top === null && <div className="muted" style={{ padding: 12 }}>Loading…</div>}
      {top !== null && top.length === 0 && (
        <div className="muted" style={{ padding: 12 }}>No players yet — be the first!</div>
      )}
      {top?.map((u, i) => (
        <div key={u.id} className={`card lb-row${i === 0 ? " top1" : ""}${u.id === user.uid ? " me" : ""}`}>
          <div className="rank">{i + 1}.</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="avatar sm" src={u.photo} alt="" referrerPolicy="no-referrer" />
          <div className="nm">{u.name}</div>
          <span className="pill">{u.rating}</span>
        </div>
      ))}
    </div>
  );
}
