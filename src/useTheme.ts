// Re-export from the new theme system for backward compatibility.
// All consumers should gradually migrate to importing from "./themes/useTheme".
export { useTheme, type Theme } from "./themes/useTheme";
