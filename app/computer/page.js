"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { useAuth } from "@/context/AuthContext";
import { bestMove } from "@/lib/bot";
import { playCheckmate } from "@/lib/sounds";
import Board from "@/components/Board";
import CapturedPieces from "@/components/CapturedPieces";

const BOT_NAMES = { easy: "Pawn Bot", medium: "Knight Bot", hard: "Queen Bot" };
const BOT_FACES = { easy: "🤖", medium: "🤖", hard: "👑" };

export default function ComputerPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [started, setStarted] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [colorChoice, setColorChoice] = useState("w"); // w | b | random
  const [mine, setMine] = useState("w");
  const [fen, setFen] = useState(new Chess().fen());
  const [history, setHistory] = useState([]); // [{from,to,san}]
  const [selected, setSelected] = useState(null);
  const [targets, setTargets] = useState([]);
  const [thinking, setThinking] = useState(false);
  const botTimer = useRef(null);
  const soundPlayed = useRef(false);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const botColor = mine === "w" ? "b" : "w";
  const over = chess.isGameOver();
  const isMyTurn = started && !over && chess.turn() === mine && !thinking;

  function start() {
    const c = colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice;
    setMine(c);
    setFen(new Chess().fen());
    setHistory([]);
    setSelected(null);
    setTargets([]);
    soundPlayed.current = false;
    setStarted(true);
  }

  function reset() {
    if (botTimer.current) clearTimeout(botTimer.current);
    setThinking(false);
    setStarted(false);
  }

  // Bot plays whenever it's its turn
  useEffect(() => {
    if (!started || over || chess.turn() !== botColor) return;
    setThinking(true);
    botTimer.current = setTimeout(() => {
      const mv = bestMove(chess.fen(), difficulty);
      if (mv) {
        const g = new Chess(chess.fen());
        g.move(mv);
        setHistory((h) => [...h, { from: mv.from, to: mv.to, san: mv.san }]);
        setFen(g.fen());
      }
      setThinking(false);
    }, 400); // brief pause so it feels like it's thinking
    return () => clearTimeout(botTimer.current);
  }, [started, fen, over, botColor, difficulty, chess]);

  // Checkmate sound — plays once per game
  useEffect(() => {
    if (!started || !over) return;
    if (chess.isCheckmate() && !soundPlayed.current) {
      soundPlayed.current = true;
      playCheckmate(chess.turn() === botColor); // side to move is the one mated
    }
  }, [over, started, chess, botColor]);

  function tapSquare(sq) {
    if (!isMyTurn) return;
    const piece = chess.get(sq);
    if (selected && targets.includes(sq)) {
      const g = new Chess(fen);
      let mv;
      try { mv = g.move({ from: selected, to: sq, promotion: "q" }); } catch { return; }
      if (!mv) return;
      setHistory((h) => [...h, { from: mv.from, to: mv.to, san: mv.san }]);
      setFen(g.fen());
      setSelected(null);
      setTargets([]);
      return;
    }
    if (piece && piece.color === mine) {
      setSelected(sq);
      setTargets(chess.moves({ square: sq, verbose: true }).map((m) => m.to));
    } else {
      setSelected(null);
      setTargets([]);
    }
  }

  // Undo: take back the bot's reply and your move (2 plies)
  function undo() {
    if (!history.length || thinking) return;
    const g = new Chess();
    const keep = history.slice(0, chess.turn() === mine ? -2 : -1);
    for (const m of keep) g.move({ from: m.from, to: m.to, promotion: "q" });
    setHistory(keep);
    setFen(g.fen());
    setSelected(null);
    setTargets([]);
  }

  /* ---------- result ---------- */
  let resultText = null;
  let iWon = false;
  if (over) {
    if (chess.isCheckmate()) {
      iWon = chess.turn() === botColor; // side to move is mated
      resultText = iWon ? "You win! 🏆 — by checkmate" : "You lose — by checkmate";
    } else {
      resultText = "Draw — " + (chess.isStalemate() ? "stalemate" : "by repetition or insufficient material");
    }
  }

  const lastMove = history.length ? history[history.length - 1] : null;
  const myName = profile?.name || "You";

  /* ---------- setup screen ---------- */
  if (!started) {
    return (
      <>
        <header className="profile">
          <button className="btn ghost small" onClick={() => router.push("/")}>← Back</button>
        </header>
        <div className="center-screen" style={{ paddingTop: 20, justifyContent: "flex-start" }}>
          <div className="knight-mark">🤖</div>
          <h1 className="auth-title" style={{ fontSize: "2rem" }}>Play vs Computer</h1>
          <p className="auth-sub">Practice against the built-in engine. No rating changes — sharpen up, then hit the ranked queues.</p>

          <div className="card" style={{ width: "100%", maxWidth: 360, padding: 18, textAlign: "left" }}>
            <div className="section-label" style={{ marginTop: 0 }}>Difficulty</div>
            <div className="tabs" style={{ marginBottom: 12 }}>
              {["easy", "medium", "hard"].map((d) => (
                <button key={d} className={difficulty === d ? "active" : ""} onClick={() => setDifficulty(d)}>
                  {d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
            <div className="section-label">Your color</div>
            <div className="tabs" style={{ marginBottom: 4 }}>
              <button className={colorChoice === "w" ? "active" : ""} onClick={() => setColorChoice("w")}>♔ White</button>
              <button className={colorChoice === "b" ? "active" : ""} onClick={() => setColorChoice("b")}>♚ Black</button>
              <button className={colorChoice === "random" ? "active" : ""} onClick={() => setColorChoice("random")}>Random</button>
            </div>
          </div>

          <button className="btn" style={{ width: "100%", maxWidth: 360 }} onClick={start}>
            Start game
          </button>
        </div>
      </>
    );
  }

  /* ---------- game screen ---------- */
  return (
    <>
      <div className="player-bar">
        <div className="glyph" style={{ width: 34, height: 34, fontSize: "1.1rem", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--walnut-2)", border: "1px solid #4b3928" }}>
          {BOT_FACES[difficulty]}
        </div>
        <div className="nm">
          <b>{BOT_NAMES[difficulty]}</b>
          <span>Computer · {difficulty}</span>{" "}
          {thinking && <span className="turn-tag">thinking…</span>}
        </div>
      </div>

      <CapturedPieces chess={chess} color={botColor} />

      <Board chess={chess} mine={mine} lastMove={lastMove} selected={selected} targets={targets} onTap={tapSquare} />

      <CapturedPieces chess={chess} color={mine} />

      <div className="player-bar">
        <div className="glyph" style={{ width: 34, height: 34, fontSize: "1.1rem", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--walnut-2)", border: "1px solid #4b3928" }}>
          ♟
        </div>
        <div className="nm">
          <b>{myName}</b>
          <span>{mine === "w" ? "White" : "Black"}</span>{" "}
          {isMyTurn && <span className="turn-tag">your turn</span>}
        </div>
      </div>

      {resultText && (
        <div className={`status-banner ${over && !resultText.startsWith("Draw") ? (iWon ? "win" : "loss") : ""}`}>
          {resultText}
        </div>
      )}

      <div className="game-actions">
        <button className="btn ghost small" onClick={undo} disabled={!history.length || thinking}>↩ Undo</button>
        <button className="btn small" onClick={start}>New game</button>
        <button className="btn ghost small" onClick={reset}>Change settings</button>
        <button className="btn ghost small" onClick={() => router.push("/")}>Lobby</button>
      </div>
    </>
  );
}
