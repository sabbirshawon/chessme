"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import { START_RATING } from "@/lib/chessGame";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // firebase auth user
  const [profile, setProfile] = useState(null); // firestore users/{uid} data
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) { setLoading(false); return; } // Firebase not configured yet
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setUser(u);
      const ref = doc(db, "users", u.uid);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const fresh = {
            name: u.displayName || "Player",
            photo: u.photoURL || "",
            rating: START_RATING,
            played: 0,
            won: 0,
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, fresh);
          setProfile(fresh);
        } else {
          const data = snap.data();
          // keep name/photo fresh from the Google account
          if (data.name !== u.displayName || data.photo !== u.photoURL) {
            const patch = { name: u.displayName || data.name, photo: u.photoURL || data.photo };
            await updateDoc(ref, patch);
            Object.assign(data, patch);
          }
          setProfile(data);
        }
      } catch (e) {
        console.error("Profile load failed:", e);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (snap.exists()) setProfile(snap.data());
  }, []);

  const login = useCallback(async () => {
    if (!auth) throw new Error("Firebase is not configured — see README.md");
    await signInWithPopup(auth, googleProvider);
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
