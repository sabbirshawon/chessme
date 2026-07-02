import { Chess } from "chess.js";

/**
 * Built-in chess engine: negamax + alpha-beta pruning + iterative deepening
 * with a hard time budget, so the UI never freezes.
 *
 * Difficulties:
 *   easy   — shallow, plays a random move ~35% of the time
 *   medium — up to 2 plies, slight randomness
 *   hard   — up to 4 plies within ~1s, best move
 */

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = new Set(["d4", "e4", "d5", "e5"]);
const NEAR_CENTER = new Set(["c3", "d3", "e3", "f3", "c4", "f4", "c5", "f5", "c6", "d6", "e6", "f6"]);
const FILES = "abcdefgh";

class Timeout extends Error {}

/** Static evaluation from the perspective of the side to move. */
function evaluate(game) {
  const board = game.board();
  const turn = game.turn();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sq = FILES[c] + (8 - r);
      let v = VAL[p.type];
      if (CENTER.has(sq)) v += 12;
      else if (NEAR_CENTER.has(sq)) v += 5;
      if (p.type === "p") {
        const rank = 8 - r;
        v += (p.color === "w" ? rank - 2 : 7 - rank) * 4;
      }
      score += p.color === turn ? v : -v;
    }
  }
  return score;
}

function orderMoves(moves) {
  // captures & promotions first — makes alpha-beta pruning far more effective
  return moves.sort((a, b) => {
    const av = (a.captured ? VAL[a.captured] * 10 - VAL[a.piece] : 0) + (a.promotion ? 8000 : 0);
    const bv = (b.captured ? VAL[b.captured] * 10 - VAL[b.piece] : 0) + (b.promotion ? 8000 : 0);
    return bv - av;
  });
}

function negamax(game, depth, alpha, beta, deadline, ctx) {
  if (++ctx.nodes % 64 === 0 && Date.now() > deadline) throw new Timeout();

  const moves = game.moves({ verbose: true });
  if (!moves.length) return game.inCheck() ? -99999 - depth : 0; // mate or stalemate
  if (depth === 0) return evaluate(game);

  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    game.move(m);
    const s = -negamax(game, depth - 1, -beta, -alpha, deadline, ctx);
    game.undo();
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

/** Search the root position at a fixed depth. Throws Timeout if the budget runs out. */
function searchRoot(game, moves, depth, jitter, deadline, ctx) {
  let best = -Infinity;
  let chosen = moves[0];
  for (const m of moves) {
    game.move(m);
    let s;
    try {
      s = -negamax(game, depth - 1, -Infinity, Infinity, deadline, ctx);
    } finally {
      game.undo();
    }
    if (jitter) s += Math.random() * jitter;
    if (s > best) {
      best = s;
      chosen = m;
    }
  }
  return chosen;
}

/**
 * Pick the bot's move for the current position.
 * Returns a verbose move object ({ from, to, san, ... }) or null if no moves.
 */
export function bestMove(fen, difficulty = "medium") {
  const game = new Chess(fen);
  const moves = orderMoves(game.moves({ verbose: true }));
  if (!moves.length) return null;

  if (difficulty === "easy" && Math.random() < 0.35) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const cfg = {
    easy:   { maxDepth: 1, budgetMs: 200,  jitter: 60 },
    medium: { maxDepth: 2, budgetMs: 500,  jitter: 15 },
    hard:   { maxDepth: 4, budgetMs: 900, jitter: 0 },
  }[difficulty] ?? { maxDepth: 2, budgetMs: 500, jitter: 15 };

  const deadline = Date.now() + cfg.budgetMs;
  const ctx = { nodes: 0 };
  let chosen = moves[0];

  // Iterative deepening: always have a completed answer, go deeper if time allows
  for (let d = 1; d <= cfg.maxDepth; d++) {
    try {
      chosen = searchRoot(game, moves, d, cfg.jitter, deadline, ctx);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (Date.now() > deadline) break;
  }
  return chosen;
}
