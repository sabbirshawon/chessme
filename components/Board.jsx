"use client";

import { PIECE_GLYPH } from "@/lib/chessGame";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

/**
 * chess     — chess.js instance (current position)
 * mine      — "w" | "b" (board orientation; black sees flipped board)
 * lastMove  — { from, to } | null
 * selected  — square name | null
 * targets   — array of legal destination squares for the selected piece
 * onTap     — (square) => void
 */
export default function Board({ chess, mine, lastMove, selected, targets, onTap }) {
  const rows = mine === "b" ? [...RANKS].reverse() : RANKS;
  const cols = mine === "b" ? [...FILES].reverse() : FILES;
  const inCheck = chess.inCheck();
  const turnColor = chess.turn();

  return (
    <div className="board-frame">
      <div className="board">
        {rows.map((rank, ri) =>
          cols.map((file, ci) => {
            const sq = file + rank;
            const piece = chess.get(sq);
            const isLight = (ri + ci) % 2 === 0;
            const cls = [
              "sq",
              isLight ? "light" : "dark",
              lastMove && (sq === lastMove.from || sq === lastMove.to) ? "last" : "",
              sq === selected ? "sel" : "",
              piece && inCheck && piece.type === "k" && piece.color === turnColor ? "chk" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={sq} className={cls} onClick={() => onTap(sq)} data-sq={sq}>
                {piece && <span className={`piece ${piece.color}`}>{PIECE_GLYPH[piece.type]}</span>}
                {targets.includes(sq) && <div className={piece ? "ring" : "dot"} />}
                {(ci === 0 || ri === 7) && (
                  <span className="coord">
                    {ri === 7 ? file : ""}
                    {ci === 0 ? rank : ""}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
