const DEFAULT_HOME_ID =
  import.meta.env.VITE_HOME_ID?.trim() || "11111111-1111-1111-1111-111111111111";

const DEFAULT_TERMINAL_ID =
  import.meta.env.VITE_TERMINAL_ID?.trim() || "22222222-2222-2222-2222-222222222222";

export function getRequestContext() {
  return {
    homeId: DEFAULT_HOME_ID,
    terminalId: DEFAULT_TERMINAL_ID,
  };
}
