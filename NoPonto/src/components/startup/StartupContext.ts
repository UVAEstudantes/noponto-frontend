import { createContext } from "react";

// Optional notification: the map remains independent of the opening animation.
export const StartupContext = createContext<() => void>(() => {});
