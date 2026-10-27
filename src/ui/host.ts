/** Where the online league lives. In the browser it is the page's own host; in the desktop app it is the live site. */
type Desk = { desktop?: boolean; host?: string };
const desk = (): Desk => (typeof window !== "undefined" ? ((window as unknown as { boxbox?: Desk }).boxbox ?? {}) : {});
export const isDesktop = () => !!desk().desktop;
export const apiHost = () => (isDesktop() ? desk().host ?? location.host : location.host);
export const wsProto = () => (isDesktop() ? "wss" : location.protocol === "https:" ? "wss" : "ws");
export const shareOrigin = () => (isDesktop() ? `https://${apiHost()}` : location.origin);
export const sharePath = () => (isDesktop() ? "/" : location.pathname);
