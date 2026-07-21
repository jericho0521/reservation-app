import type { ThemeClasses } from "./types.js";

export type BookingVisualPresetId = "editorial";

export interface BookingVisualPreset {
  id: BookingVisualPresetId;
  name: string;
  theme: Required<ThemeClasses>;
}

const editorialThemeClasses: Required<ThemeClasses> = {
  brandName: "Reservation Platform",
  shell: "rp-shell mx-auto max-w-5xl border border-black bg-white text-slate-950 font-sans antialiased shadow-none rounded-none p-6 md:p-8",
  panel: "rp-panel border border-black bg-neutral-50 p-6 rounded-none",
  button: "rp-button bg-black text-white px-5 py-3 text-xs font-bold uppercase tracking-widest hover:bg-neutral-800 active:scale-[0.98] transition-all duration-150 rounded-none",
  buttonDisabled: "rp-button rp-button-disabled bg-neutral-200 text-neutral-400 px-5 py-3 text-xs font-bold uppercase tracking-widest cursor-not-allowed rounded-none",
  input: "rp-input w-full border border-neutral-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-black transition-colors rounded-none font-mono",
  selected: "rp-selected border-black bg-black text-white font-semibold",
  muted: "text-xs text-neutral-500 font-medium",
  error: "border border-red-600 bg-red-50 p-4 text-xs font-mono text-red-700 rounded-none",
  success: "border border-black bg-neutral-900 text-white p-4 text-xs font-mono rounded-none",
};

export const bookingVisualPresets: Readonly<Record<BookingVisualPresetId, BookingVisualPreset>> = Object.freeze({
  editorial: Object.freeze({
    id: "editorial",
    name: "Editorial",
    theme: Object.freeze(editorialThemeClasses),
  }),
});

export const defaultBookingVisualPresetId: BookingVisualPresetId = "editorial";
export const defaultThemeClasses = bookingVisualPresets[defaultBookingVisualPresetId].theme;

export function resolveBookingVisualPreset(
  presetId: BookingVisualPresetId = defaultBookingVisualPresetId,
): BookingVisualPreset {
  return bookingVisualPresets[presetId];
}
