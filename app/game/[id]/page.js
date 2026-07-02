"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chess } from "chess.js";
import {
  doc, onSnapshot, updateDoc, deleteDoc, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { playerStub, claimSeat, eloDelta, fmtClock } from "@/lib/chessGame";
import Board from "@/components/Board";
import CapturedPieces from "@/components/CapturedPieces";
import Chat from "@/components/Chat";
import { GoogleButton, Spinner, useToast } from "@/components/ui";
import { playCheckmate } from "@/lib/sounds";

export default function GamePage() {
  const { id: gameId } = useParams();
  const router = useRouter();
  const { user, profile, loading, login, refreshProfile } = useAuth();
  const [toast, toastNode] = useToast();

  const [game, setGame] = useState(null);      // firestore doc data
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [targets, setTargets] = useState([]);
  const [now, setNow] = useState(Date.now());  // clock tick
  const [copied, setCopied] = useState(false);
  const joinTried = useRef(false);
  const ratingsTried = useRef(false);
  const flagTried = useRef(false);

  /* ---------- realtime game subscription ---------- */
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "games", gameId),
      (snap) => {
        if (!snap.exists()) { setMissing(true); return; }
        setGame(snap.data());
      },
      (e) => toast("Connection error: " + (e.code || e.message))
    );
    return unsub;
  }, [user, gameId, toast]);

  /* ---------- auto-claim black seat when arriving via invite link ---------- */
  useEffect(() => {
    if (!game || !user || !profile || joinTried.current) return;
    const iAmSeated = game.white?.uid === user.uid || game.black?.uid === user.uid;
    if (game.status === "waiting" && !iAmSeated) {
      joinTried.current = true;
      claimSeat(gameId, playerStub(user.uid, profile)).catch(() => {
        toast("Couldn't join — the seat was just taken.");
        router.push("/");
      });
    }
  }, [game, user, profile, gameId, router, toast]);

  /* ---------- derived position ---------- */
  const chess = useMemo(() => {
    const c = new Chess();
    if (game?.fen) {
      try { c.load(game.fen); } catch {}
    }
    return c;
  }, [game?.fen]);

  const mine = game?.white?.uid === user?.uid ? "w" : game?.black?.uid === user?.uid ? "b" : "w";
  const oppColor = mine === "w" ? "b" : "w";
  const oppPlayer = mine === "w" ? game?.black : game?.white;
  const selfPlayer = mine === "w" ? game?.white : game?.black;
  const isMyTurn = game?.status === "active" && game?.turn === mine;

  /* ---------- clocks ---------- */
  useEffect(() => {
    if (game?.status !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [game?.status]);

  const msFor = useCallback(
    (color) => {
      if (!game) return 0;
      const base = color === "w" ? game.whiteMs : game.blackMs;
      if (game.status !== "active" || game.turn !== color || !game.lastMoveAt) return base;
      return Math.max(0, base - (now - game.lastMoveAt.toMillis()));
    },
    [game, now]
  );

  /* ---------- finishing, ratings ---------- */
  const finishGame = useCallback(
    async (winnerColor, result) => {
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, "games", gameId);
          const fresh = await tx.get(ref);
          if (!fresh.exists() || fresh.data().status !== "active") throw new Error("done");
          tx.update(ref, {
            status: "finished", winner: winnerColor, result,
            drawOffer: null, updatedAt: serverTimestamp(),
          });
        });
      } catch { /* the other client finished it first — snapshot will sync us */ }
    },
    [gameId]
  );

  const applyRatings = useCallback(async () => {
    if (ratingsTried.current) return;
    ratingsTried.current = true;
    try {
      await runTransaction(db, async (tx) => {
        const gRef = doc(db, "games", gameId);
        const g = (await tx.get(gRef)).data();
        if (!g || g.status !== "finished" || g.ratingsApplied || !g.white || !g.black) throw new Error("skip");
        const wRef = doc(db, "users", g.white.uid);
        const bRef = doc(db, "users", g.black.uid);
        const wU = (await tx.get(wRef)).data();
        const bU = (await tx.get(bRef)).data();
        const wScore = g.winner === "w" ? 1 : g.winner === "b" ? 0 : 0.5;
        const dW = eloDelta(wU.rating, bU.rating, wScore);
        const dB = eloDelta(bU.rating, wU.rating, 1 - wScore);
        tx.update(wRef, { rating: Math.max(100, wU.rating + dW), played: wU.played + 1, won: wU.won + (wScore === 1 ? 1 : 0) });
        tx.update(bRef, { rating: Math.max(100, bU.rating + dB), played: bU.played + 1, won: bU.won + (wScore === 0 ? 1 : 0) });
        tx.update(gRef, { ratingsApplied: true, deltaW: dW, deltaB: dB });
      });
    } catch { /* opponent's client applied them */ }
    refreshProfile();
  }, [gameId, refreshProfile]);

 const soundPlayed = useRef(false);

  useEffect(() => {
    if (game?.status === "finished") {
      applyRatings();
      if (game.result === "checkmate" && !soundPlayed.current) {
        soundPlayed.current = true;
        playCheckmate(game.winner === mine);
      }
    }
  }, [game?.status, game?.result, game?.winner, mine, applyRatings]);

  // flag fall — either client may record it; the transaction prevents doubles
  useEffect(() => {
    if (game?.status !== "active" || flagTried.current) return;
    const myMs = msFor(mine), opMs = msFor(oppColor);
    if (myMs <= 0 || opMs <= 0) {
      flagTried.current = true;
      const loser = myMs <= 0 ? mine : oppColor;
      finishGame(loser === "w" ? "b" : "w", "timeout").finally(() => { flagTried.current = false; });
    }
  }, [now, game?.status, mine, oppColor, msFor, finishGame]);

  /* ---------- moves ---------- */
  async function tapSquare(sq) {
    if (!isMyTurn) return;
    const piece = chess.get(sq);
    if (selected && targets.includes(sq)) {
      await makeMove(selected, sq);
      setSelected(null); setTargets([]);
      return;
    }
    if (piece && piece.color === mine) {
      setSelected(sq);
      setTargets(chess.moves({ square: sq, verbose: true }).map((m) => m.to));
    } else {
      setSelected(null); setTargets([]);
    }
  }

  async function makeMove(from, to) {
    const local = new Chess(game.fen);
    let mv;
    try { mv = local.move({ from, to, promotion: "q" }); } catch { return; }
    if (!mv) return;
    const elapsed = game.lastMoveAt ? Date.now() - game.lastMoveAt.toMillis() : 0;
    const key = mine === "w" ? "whiteMs" : "blackMs";
    const update = {
      fen: local.fen(),
      moves: [...game.moves, { from, to, san: mv.san }],
      turn: local.turn(),
      [key]: Math.max(0, game[key] - elapsed),
      lastMoveAt: serverTimestamp(),
      drawOffer: null,
      updatedAt: serverTimestamp(),
    };
    if (local.isGameOver()) {
      update.status = "finished";
      if (local.isCheckmate()) { update.winner = mine; update.result = "checkmate"; }
      else { update.winner = null; update.result = "draw"; }
    }
    try {
      await updateDoc(doc(db, "games", gameId), update);
    } catch (e) {
      toast("Move failed to sync: " + (e.code || e.message));
    }
  }

  /* ---------- actions ---------- */
  async function cancelWaiting() {
    try { await deleteDoc(doc(db, "games", gameId)); } catch {}
    router.push("/");
  }
  function resign() {
    if (!confirm("Resign this game?")) return;
    finishGame(oppColor, "resign");
  }
  const offerDraw = () => updateDoc(doc(db, "games", gameId), { drawOffer: user.uid }).catch(() => {});
  const declineDraw = () => updateDoc(doc(db, "games", gameId), { drawOffer: null }).catch(() => {});
  const acceptDraw = () => finishGame(null, "draw");

  async function copyLink() {
    const link = `${location.origin}/game/${gameId}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast(link); }
  }

  /* ================= RENDER ================= */

  if (loading) return <div className="center-screen"><Spinner /></div>;

  if (!user || !profile) {
    return (
      <div className="center-screen">
        <div className="knight-mark">♞</div>
        <h1 className="auth-title">You&apos;re invited</h1>
        <p className="auth-sub">Sign in with Google to join this chess game.</p>
        <GoogleButton onClick={() => login().catch((e) => toast("Sign-in failed: " + (e.code || e.message)))} />
        {toastNode}
      </div>
    );
  }

  if (missing) {
    return (
      <div className="center-screen">
        <h2>Game not found</h2>
        <p className="muted">It may have been cancelled.</p>
        <button className="btn" onClick={() => router.push("/")}>Back to lobby</button>
      </div>
    );
  }

  if (!game) return <div className="center-screen"><Spinner /></div>;

  /* ---------- waiting room ---------- */
  if (game.status === "waiting") {
    const isCreator = game.createdBy === user.uid;
    return (
      <>
        <header className="profile">
          {isCreator && <button className="btn ghost small" onClick={cancelWaiting}>← Cancel</button>}
        </header>
        <div className="card waiting-box">
          <Spinner />
          <h2 style={{ marginTop: 14 }}>{game.private ? "Private room" : "Finding an opponent…"}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {game.private
              ? "Send this link to a friend — they'll sign in with Google and the game starts."
              : `Waiting in the ${Math.round(game.timeControl / 60)} minute queue.`}
          </p>
          {game.private && (
            <div className="share-row">
              <input readOnly value={`${typeof window !== "undefined" ? location.origin : ""}/game/${gameId}`} aria-label="Invite link" />
              <button className="btn small" onClick={copyLink}>{copied ? "Copied!" : "Copy"}</button>
            </div>
          )}
        </div>
        {toastNode}
      </>
    );
  }

  /* ---------- live / finished game ---------- */
  const lastMove = game.moves.length ? game.moves[game.moves.length - 1] : null;
  const myMs = msFor(mine), opMs = msFor(oppColor);
  const finished = game.status === "finished";
  const iWon = game.winner === mine;
  const draw = game.winner === null && finished;
  const myDelta = mine === "w" ? game.deltaW : game.deltaB;
  const howText = { checkmate: "by checkmate", timeout: "on time", resign: "by resignation", draw: "by agreement" }[game.result] || "";
  const drawOffered = game.status === "active" && game.drawOffer;

  return (
    <>
      <div className="player-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar sm" src={oppPlayer?.photo || ""} alt="" referrerPolicy="no-referrer" />
        <div className="nm">
          <b>{oppPlayer?.name || "Opponent"}</b>
          <span>({oppPlayer?.rating}) </span>
          {game.status === "active" && !isMyTurn && <span className="turn-tag">their turn</span>}
        </div>
        <div className={`clock${game.status === "active" && game.turn === oppColor ? " active" : ""}${opMs < 20000 ? " low" : ""}`}>
          {fmtClock(opMs)}
        </div>
      </div>

      <CapturedPieces chess={chess} color={oppColor} />

      <Board chess={chess} mine={mine} lastMove={lastMove} selected={selected} targets={targets} onTap={tapSquare} />

      <CapturedPieces chess={chess} color={mine} />

      <div className="player-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar sm" src={selfPlayer?.photo || ""} alt="" referrerPolicy="no-referrer" />
        <div className="nm">
          <b>{selfPlayer?.name || "You"}</b>
          <span>({selfPlayer?.rating}) </span>
          {isMyTurn && <span className="turn-tag">your turn</span>}
        </div>
        <div className={`clock${isMyTurn ? " active" : ""}${myMs < 20000 ? " low" : ""}`}>{fmtClock(myMs)}</div>
      </div>

      {drawOffered && game.drawOffer !== user.uid && (
        <div className="status-banner">
          Opponent offers a draw
          <button className="btn small" onClick={acceptDraw}>Accept</button>
          <button className="btn ghost small" onClick={declineDraw}>Decline</button>
        </div>
      )}
      {drawOffered && game.drawOffer === user.uid && <div className="status-banner">Draw offer sent…</div>}
      {finished && (
        <div className={`status-banner ${draw ? "" : iWon ? "win" : "loss"}`}>
          {draw ? "Draw" : iWon ? "You win! 🏆" : "You lose"} — {howText}
          {typeof myDelta === "number" && <b>{(myDelta >= 0 ? "+" : "") + myDelta} rating</b>}
        </div>
      )}

      {game.status === "active" ? (
        <div className="game-actions">
          <button className="btn ghost small" onClick={offerDraw}>Offer draw</button>
          <button className="btn danger small" onClick={resign}>Resign</button>
        </div>
      ) : (
        <div className="game-actions">
          <button className="btn small" onClick={() => router.push("/")}>Back to lobby</button>
        </div>
      )}

      <Chat gameId={gameId} canChat={game.white?.uid === user.uid || game.black?.uid === user.uid} />
      {toastNode}
    </>
  );
}
