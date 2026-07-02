# ♞ Knight Club — Online Chess (Next.js + Firebase)

A real-time multiplayer chess app built with **Next.js 15 (App Router)** and **Firebase** (Google sign-in + Firestore). Made to deploy on **Vercel** in a few clicks.

## Features

- **Google sign-in** — one tap, via Firebase Authentication
- **Matchmaking queues** — 1 min Bullet, 3 min Blitz, 5 min Quick Play, 15 min Rapid
- **Private rooms** — pick a time control, create a room, copy the invite link (`yoursite.com/game/abc123`); your friend opens it, signs in with Google, and the game starts
- **Live play** — real-time move sync, chess clocks, legal-move hints, last-move & check highlights, board flips for Black, auto-queen promotion
- **Resign / draw offers** with accept & decline
- **Elo ratings** — start at 1200, K=32, updated automatically after every game
- **Leaderboard** — top 10 players plus your own global rank
- **Profile stats** — rating, played, won

## Project structure

```
app/
  layout.js            Root layout (fonts, AuthProvider)
  globals.css          Design system (walnut & baize theme)
  page.js              Sign-in screen + lobby (Play / Leaderboard tabs)
  game/[id]/page.js    Waiting room + live game (board, clocks, actions)
components/
  Board.jsx            Chessboard rendering & tap handling
  Lobby.jsx            Queues, private room, join-by-link
  Leaderboard.jsx      Top players + your rank
  ui.jsx               Toast, Google button, spinner
context/
  AuthContext.jsx      Google auth + Firestore profile
lib/
  firebase.js          Firebase init (env-driven, browser-only)
  chessGame.js         Matchmaking, Elo, game document helpers
firestore.rules        Security rules to paste into Firestore
```

---

## Setup — Part 1: Firebase (~5 min)

1. Go to https://console.firebase.google.com → **Add project** (name it anything).
2. **Build → Authentication → Get started** → Sign-in method tab → enable **Google** → Save.
3. **Build → Firestore Database → Create database** → Production mode → pick a region.
4. Firestore → **Rules** tab → replace contents with the contents of `firestore.rules` from this repo → **Publish**.
5. Project overview → click the **</>** (Web) icon → register a web app (no hosting needed).
6. Firebase shows a `firebaseConfig` object — keep this tab open, you'll copy these 6 values next.

## Setup — Part 2: Run locally (optional)

```bash
npm install
cp .env.local.example .env.local   # then paste your Firebase values into .env.local
npm run dev                        # open http://localhost:3000
```

`localhost` is already an authorized domain in Firebase, so Google sign-in works immediately.

## Setup — Part 3: Deploy to Vercel (~5 min)

1. Push this folder to a GitHub repository:
   ```bash
   git init && git add -A && git commit -m "Knight Club chess"
   # create a repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
2. Go to https://vercel.com → **Add New → Project** → import that repo. Vercel auto-detects Next.js.
3. Before clicking Deploy, expand **Environment Variables** and add all six values from your Firebase config:

   | Name | Value (from Firebase config) |
   |---|---|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

4. Click **Deploy**. You'll get a URL like `https://your-app.vercel.app`.
5. **Last step (required):** back in Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → add `your-app.vercel.app`. Without this, the Google popup is blocked.

Done — open the URL on two phones, sign in with different Google accounts, and play.

> If Firestore ever logs a *"query requires an index"* error in the browser console, it includes a direct link — click it and Firebase creates the index for you.

## How it works

- **Matchmaking:** joining a queue searches Firestore for a public game with `status == "waiting"` and the same time control. If one exists, a transaction claims the Black seat atomically (two players can never take the same seat). Otherwise a new waiting game is created.
- **Private rooms:** the same game document with `private: true`, joined through the `/game/[id]` link. Whoever opens the link and isn't seated gets the Black seat automatically.
- **Live sync:** every client holds an `onSnapshot` listener on the game document — moves appear on the opponent's screen in real time (push, not polling).
- **Clocks:** remaining milliseconds per side are stored with a server timestamp of the last move; each client renders the running clock locally. Either client may record a flag fall — a transaction prevents double-finishing.
- **Ratings:** when a game finishes, a transaction (guarded by a `ratingsApplied` flag so it runs exactly once) computes Elo deltas and updates both players' profiles.

## Production hardening (optional, later)

Everything works as-is, but a few things run client-side for simplicity:

- Move **rating updates** into a Cloud Function triggered on game finish, and tighten `firestore.rules` so clients can't write `rating` at all — makes ratings tamper-proof.
- Re-validate moves server-side (Cloud Function checks the FEN transition) to block modified clients.
- Add a scheduled function to clean up abandoned `waiting` games.
- Add a promotion picker if you want under-promotion (currently auto-queen).
