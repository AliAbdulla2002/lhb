import { loadFont as loadAlexandria } from "@remotion/google-fonts/Alexandria";
import { loadFont as loadReadex } from "@remotion/google-fonts/ReadexPro";

// Brand colours sampled from the official logo (same tokens as the website).
export const C = {
  red: "#E54135",
  yellow: "#FABA10",
  maroon: "#5A2828",
  night: "#2B1110",
  cream: "#F0E4B2",
  paper: "#FBF4E2",
};

export const display = loadAlexandria("normal", { weights: ["700", "800", "900"], subsets: ["arabic", "latin"] }).fontFamily;
export const body = loadReadex("normal", { weights: ["400", "500", "600"], subsets: ["arabic", "latin"] }).fontFamily;

// Screens were captured at 1170×1992 (iPhone 13 viewport at 3×); the phone shows them at 2/3.
export const SHOT_W = 1170;
export const SHOT_H = 1992;
export const SCREEN_W = 780;
export const SCALE = SCREEN_W / SHOT_W;
export const SCREEN_H = SHOT_H * SCALE;
