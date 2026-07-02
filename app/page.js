"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GoogleButton, Spinner, useToast } from "@/components/ui";
import Lobby from "@/components/Lobby";
import Leaderboard from "@/components/Leaderboard";
import OnlinePlayers from "@/components/OnlinePlayers";
import InviteWatcher from "@/components/InviteWatcher";

export default function Home() {
  const { user, profile, loading, login, logout } = useAuth();
  const [tab, setTab] = useState("play");
  const [toast, toastNode] = useToast();

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="center-screen">
        <div className="knight-mark">♞</div>
        <h1 className="auth-title">Knight Club</h1>
        <p className="auth-sub">
          Play live chess with friends and strangers. Ranked queues, private rooms, one leaderboard.
        </p>
        {!isFirebaseConfigured && (
          <div className="config-warn">
            ⚠️ Firebase isn&apos;t configured. Add your <code>NEXT_PUBLIC_FIREBASE_*</code> variables
            (see <code>.env.local.example</code> and README) — sign-in won&apos;t work until then.
          </div>
        )}
        <GoogleButton
          onClick={async () => {
            try {
              await login();
            } catch (e) {
              toast("Sign-in failed: " + (e.code || e.message));
            }
          }}
        />
        {toastNode}
      </div>
    );
  }

  return (
    <>
      <header className="profile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar" src={profile.photo} alt="Your profile photo" referrerPolicy="no-referrer" />
        <div className="grow">
          <div className="name">{profile.name}</div>
          <div className="stats">
            Played: {profile.played} · Won: {profile.won}
          </div>
        </div>
        <span className="pill">{profile.rating}</span>
        <button className="btn ghost small" onClick={logout}>
          Sign out
        </button>
      </header>

      <InviteWatcher toast={toast} />

      <div className="tabs">
        <button className={tab === "play" ? "active" : ""} onClick={() => setTab("play")}>
          Play
        </button>
        <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>
          Players
        </button>
        <button className={tab === "lb" ? "active" : ""} onClick={() => setTab("lb")}>
          Leaders
        </button>
      </div>

      {tab === "play" && <Lobby toast={toast} />}
      {tab === "players" && <OnlinePlayers toast={toast} />}
      {tab === "lb" && <Leaderboard />}
      {toastNode}
    </>
  );
}
