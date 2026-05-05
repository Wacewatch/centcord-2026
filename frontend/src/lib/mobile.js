import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const MobileContext = createContext(null);

/**
 * Provides mobile/drawer state to the whole app.
 * - isMobile: boolean, true when viewport < 768px
 * - drawerOpen: boolean, whether the side drawer is open on mobile
 * - toggleDrawer(), openDrawer(), closeDrawer()
 */
export function MobileProvider({ children }) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false); // auto close drawer on desktop
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  return (
    <MobileContext.Provider value={{ isMobile, drawerOpen, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </MobileContext.Provider>
  );
}

export function useMobile() {
  const ctx = useContext(MobileContext);
  if (!ctx) {
    // safe fallback (non-breaking if provider missing)
    return { isMobile: false, drawerOpen: false, openDrawer: () => {}, closeDrawer: () => {}, toggleDrawer: () => {} };
  }
  return ctx;
}
