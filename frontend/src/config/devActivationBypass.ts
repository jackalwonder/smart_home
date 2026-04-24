export function isDevActivationBypassEnabled() {
  return import.meta.env.VITE_DEV_BYPASS_TERMINAL_ACTIVATION === "true";
}
