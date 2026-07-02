"use client";

import { useMemo } from "react";
import { PIECE_GLYPH } from "@/lib/chessGame";

const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ORDER = ["q", "r", "b", "n", "p"];

function countPieces(chess) {
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type !== "k") counts[sq.color][sq.type]++;
    }
  }
  return counts;
}

/**
 * Pieces captured BY `color` (i.e. the opponent's missing pieces),
 * shown under that player's bar. Also shows material lead if this side is ahead.
 */
export default function CapturedPieces({ chess, color }) {
  const { pieces, lead } = useMemo(() => {
    const counts = countPieces(chess);
    const enemy = color === "w" ? "b" : "w";
    const pieces = [];
    let myGain = 0;
    let theirGain = 0;
    for (const t of ORDER) {
      const takenFromEnemy = Math.max(0, START_COUNTS[t] - counts[enemy][t]);
      const takenFromMe = Math.max(0, START_COUNTS[t] - counts[color][t]);
      myGain += takenFromEnemy * VALUES[t];
      theirGain += takenFromMe * VALUES[t];
      for (let i = 0; i < takenFromEnemy; i++) pieces.push(t);
    }
    return { pieces, lead: myGain - theirGain };
  }, [chess, color]);

  if (!pieces.length && lead <= 0) return <div className="captured" />;

  return (
    <div className="captured">
      {pieces.map((t, i) => (
        <span key={i} className={`cap-piece ${color === "w" ? "b" : "w"}`}>
          {PIECE_GLYPH[t]}
        </span>
      ))}
      {lead > 0 && <span className="cap-lead">+{lead}</span>}
    </div>
  );
}
