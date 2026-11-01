// Diagnostics stay hidden until the server confirms the signed-in account's admin role.
import { isAdmin } from "./cloud.js";
export function watchAdmin({
  elements = [],
  onAdmin = () => {},
  onHide = () => {},
} = {}) {
  let revision = 0,
    disposed = false;
  const hide = () => {
    ++revision;
    elements.forEach((n) => {
      if (n) n.hidden = true;
    });
    onHide();
  };
  const refresh = async () => {
    hide();
    const attempt = revision;
    if (disposed || document.visibilityState === "hidden") return;
    let allowed = false;
    try {
      allowed = (await isAdmin()) === true;
    } catch {}
    if (disposed || attempt !== revision || !allowed) return;
    elements.forEach((n) => {
      if (n) n.hidden = false;
    });
    await onAdmin(() => !disposed && attempt === revision);
  };
  const visibility = () =>
    document.visibilityState === "visible" ? refresh() : hide();
  const storage = (e) => {
    if (e.key === null || /^sb-.+-auth-token$/.test(e.key ?? "")) refresh();
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("storage", storage);
  window.addEventListener("pageshow", refresh);
  refresh();
  return () => {
    disposed = true;
    hide();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("storage", storage);
    window.removeEventListener("pageshow", refresh);
  };
}
