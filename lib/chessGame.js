import { Chess } from "chess.js";
import {
  collection, doc, addDoc, getDocs, query, where, limit,
  runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const START_RATING = 1200;
export const K_FACTOR = 32;

export const QUEUES = [
  { id: "bullet", name: "1 Minute",   sub: "Bullet · random color",  secs: 60,  glyph: "♟", hot: false },
  { id: "blitz",  name: "3 Minutes",  sub: "Blitz · random color",   secs: 180, glyph: "♞", hot: false },
  { id: "quick",  name: "Quick Play", sub: "5 mins · random color",  secs: 300, glyph: "♘", hot: true  },
  { id: "rapid",  name: "15 Minutes", sub: "Rapid · random color",   secs: 900, glyph: "♖", hot: false },
];

export const PIECE_GLYPH = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };

export function eloDelta(myRating, oppRating, score) {
  // score: 1 = win, 0.5 = draw, 0 = loss
  const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
  return Math.round(K_FACTOR * (score - expected));
}

export function playerStub(uid, profile) {
  return { uid, name: profile.name, photo: profile.photo, rating: profile.rating };
}

export function newGameDoc(creator, secs, isPrivate, queueId) {
  return {
    private: isPrivate,
    queueId: queueId || null,
    status: "waiting", // waiting | active | finished
    white: creator,    // creator starts as white
    black: null,
    createdBy: creator.uid,
    fen: new Chess().fen(),
    moves: [],
    turn: "w",
    timeControl: secs,
    whiteMs: secs * 1000,
    blackMs: secs * 1000,
    lastMoveAt: null,
    drawOffer: null,
    winner: null,
    result: null, // checkmate | timeout | resign | draw
    ratingsApplied: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Try to claim the black seat of a waiting game. Throws if it's been taken. */
export async function claimSeat(gameId, seatPlayer) {
  const ref = doc(db, "games", gameId);
  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists()) throw new Error("gone");
    const g = fresh.data();
    if (g.status !== "waiting" || g.black) throw new Error("taken");
    tx.update(ref, {
      black: seatPlayer,
      status: "active",
      lastMoveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Matchmaking: join an open public game with this time control, or create one. Returns gameId. */
export async function findOrCreateMatch(queue, seatPlayer) {
  const open = await getDocs(
    query(
      collection(db, "games"),
      where("status", "==", "waiting"),
      where("private", "==", false),
      where("queueId", "==", queue.id),
      limit(5)
    )
  );
  for (const d of open.docs) {
    if (d.data().createdBy === seatPlayer.uid) return d.id; // rejoin my own waiting game
    try {
      await claimSeat(d.id, seatPlayer);
      return d.id;
    } catch {
      /* seat taken by someone else — try the next one */
    }
  }
  const ref = await addDoc(collection(db, "games"), newGameDoc(seatPlayer, queue.secs, false, queue.id));
  return ref.id;
}

export async function createPrivateRoom(seatPlayer, secs) {
  const ref = await addDoc(collection(db, "games"), newGameDoc(seatPlayer, secs, true, null));
  return ref.id;
}

/** Challenge another online player: creates a private game + an invite doc. Returns gameId. */
export async function sendInvite(fromPlayer, toUid, toName, secs = 300) {
  const gameRef = await addDoc(collection(db, "games"), newGameDoc(fromPlayer, secs, true, "invite"));
  await addDoc(collection(db, "invites"), {
    from: fromPlayer,
    to: toUid,
    toName: toName || "",
    gameId: gameRef.id,
    timeControl: secs,
    status: "pending", // pending | accepted | declined
    createdAt: serverTimestamp(),
  });
  return gameRef.id;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function extractGameId(input) {
  const m = String(input).match(/\/game\/([A-Za-z0-9_-]+)/) || String(input).match(/[?&]g=([A-Za-z0-9_-]+)/);
  return m ? m[1] : String(input).trim();
}
