"use client";

import React from "react";
import { AuthContext, useAuthState } from "@/lib/useAuth";
import LoginModal from "./LoginModal";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuthState();

  return (
    <AuthContext.Provider value={auth}>
      {children}
      <LoginModal open={auth.loginOpen} onClose={auth.closeLogin} />
    </AuthContext.Provider>
  );
}
