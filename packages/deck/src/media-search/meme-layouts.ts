import type { Caption } from "./snippets.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE A TEMPLATE'S CAPTIONS GO  —  caption boxes for Imgflip's top templates, by id
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The hosted builder's table (apps/deck-app/src/lib/meme-layouts.ts), kept identical, so a
 * template found with `kadal-deck media search template` goes in with the captions where the
 * builder's meme editor would put them.
 *
 * "Top text / bottom text" is right for a photo with one joke, and wrong for most of the top
 * templates: Drake's captions belong in the empty right column, Two Buttons' on the buttons,
 * Distracted Boyfriend's on the three people, Gru's Plan's on the four whiteboards. Each entry
 * here is the template's boxes in the engine's own units (x, y, width in % of the image; size in
 * % of the meme's width) in Imgflip's box order, measured against the template image on a 10 %
 * grid. A box on a white panel (a whiteboard, a sign, a blank column) writes black with no
 * outline; everything else keeps the classic white with a black outline.
 *
 * A template not listed keeps the old rule (snippets.ts `defaultCaptions`). Ids are Imgflip's
 * (https://api.imgflip.com/get_memes); a template they retire just stops matching.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Box = [x: number, y: number, width: number, size?: number];
interface Layout {
  boxes: Box[];
  /** Black text, no outline: the boxes sit on a white or pale panel. */
  ink?: boolean;
  /** Only these boxes (by index) are inked; the rest stay classic. */
  inkOnly?: number[];
}

const L: Record<string, Layout> = {
  // Drake Hotline Bling: the right column, beside each panel
  "181913649": {
    boxes: [
      [52, 16, 45, 7],
      [52, 66, 45, 7],
    ],
    ink: true,
  },
  // Two Buttons: one on each button, the sweating man at the bottom
  "87743020": {
    boxes: [
      [6, 6, 40, 5.5],
      [52, 2, 40, 5.5],
      [5, 84, 90, 8],
    ],
  },
  // Distracted Boyfriend: the woman in red, the boyfriend, the girlfriend
  "112126428": {
    boxes: [
      [8, 62, 30, 5],
      [40, 22, 26, 5],
      [68, 40, 30, 5],
    ],
  },
  // UNO Draw 25 Cards: on the card's blank face, then over the man
  "217743513": {
    boxes: [
      [8, 12, 34, 5.5],
      [52, 4, 45, 6],
    ],
    inkOnly: [0],
  },
  // Always Has Been: the first astronaut's question, the second's answer
  "252600902": {
    boxes: [
      [4, 6, 52, 5.5],
      [56, 8, 42, 5.5],
    ],
  },
  // Left Exit 12 Off Ramp: straight on, the exit, the car
  "124822590": {
    boxes: [
      [22, 9, 24, 4.5],
      [47, 9, 26, 4.5],
      [22, 70, 56, 6],
    ],
  },
  // Anakin Padme 4 Panel: his line, her smile, her doubt
  "322841258": {
    boxes: [
      [2, 38, 46, 5],
      [52, 38, 46, 5],
      [52, 88, 46, 5],
    ],
  },
  // Epic Handshake: the left arm, the right arm, what they agree on
  "135256802": {
    boxes: [
      [3, 58, 34, 6],
      [63, 58, 34, 6],
      [33, 6, 34, 6],
    ],
  },
  // Gru's Plan: the four whiteboards
  "131940431": {
    boxes: [
      [28, 12, 18, 3.5],
      [77, 12, 18, 3.5],
      [28, 62, 18, 3.5],
      [77, 62, 18, 3.5],
    ],
    ink: true,
  },
  // Running Away Balloon: the man, the balloon, the pink blob, the man again, the balloon again
  "131087935": {
    boxes: [
      [4, 20, 40, 5],
      [62, 12, 34, 5],
      [2, 72, 28, 5],
      [33, 80, 34, 5],
      [70, 62, 28, 5],
    ],
  },
  // Sad Pablo Escobar: the wide panel, then the two small ones
  "80707627": {
    boxes: [
      [5, 42, 90, 5.5],
      [2, 88, 46, 5],
      [52, 88, 46, 5],
    ],
  },
  // Trade Offer: "I receive", "you receive", and the man
  "309868304": {
    boxes: [
      [3, 24, 44, 5.5],
      [53, 24, 44, 5.5],
      [5, 86, 90, 6],
    ],
  },
  // Change My Mind: on the sign, and above
  "129242436": {
    boxes: [
      [44, 70, 44, 4.5],
      [5, 3, 90, 7],
    ],
    inkOnly: [0],
  },
  // Woman Yelling At Cat: the white band over each picture
  "188390779": {
    boxes: [
      [2, 3, 46, 5],
      [52, 3, 46, 5],
    ],
    ink: true,
  },
  // Marked Safe From: between the two lines, and in place of "Today"
  "161865971": {
    boxes: [
      [10, 56, 80, 6],
      [10, 84, 80, 5],
    ],
    ink: true,
  },
  // Batman Slapping Robin: the two speech bubbles
  "438680": {
    boxes: [
      [3, 3, 42, 5.5],
      [55, 3, 42, 5.5],
    ],
    ink: true,
  },
  // Is This A Pigeon: the man, the butterfly, the question
  "100777631": {
    boxes: [
      [4, 12, 40, 5],
      [68, 20, 30, 5],
      [5, 84, 90, 6],
    ],
  },
  // Buff Doge vs. Cheems: over each dog, then under each
  "247375501": {
    boxes: [
      [5, 3, 40, 5],
      [55, 3, 40, 5],
      [5, 86, 40, 5],
      [55, 86, 40, 5],
    ],
    ink: true,
  },
  // Bike Fall: one line per panel
  "79132341": {
    boxes: [
      [5, 2, 90, 5.5],
      [5, 36, 90, 5.5],
      [5, 69, 90, 5.5],
    ],
  },
  // 0 days without: after "DAYS WITHOUT" on the sign, then the caption
  "427308417": {
    boxes: [
      [24, 20, 72, 6.5],
      [5, 84, 90, 7],
    ],
    inkOnly: [0],
  },
  // They're The Same Picture: the two papers, then Pam
  "180190441": {
    boxes: [
      [4, 8, 40, 4.5],
      [52, 6, 42, 4.5],
      [5, 84, 90, 5],
    ],
    inkOnly: [0, 1],
  },
  // Expanding Brain: the white column, one per brain
  "93895088": {
    boxes: [
      [3, 4, 46, 5],
      [3, 29, 46, 5],
      [3, 54, 46, 5],
      [3, 79, 46, 5],
    ],
    ink: true,
  },
  // Mother Ignoring Kid Drowning In A Pool: the mother, her girl, the drowning kid, the skeleton
  "252758727": {
    boxes: [
      [62, 2, 36, 5],
      [34, 2, 26, 5],
      [2, 24, 34, 5],
      [30, 68, 40, 5],
    ],
  },
  // This Is Where I'd Put My Trophy If I Had One: under each panel
  "3218037": {
    boxes: [
      [5, 36, 90, 7],
      [5, 86, 90, 7],
    ],
  },
  // Tuxedo Winnie The Pooh: the white column, beside each Pooh
  "178591752": {
    boxes: [
      [45, 18, 52, 6],
      [45, 67, 52, 6],
    ],
    ink: true,
  },
  // I Bet He's Thinking About Other Women: over her, over him
  "110163934": {
    boxes: [
      [3, 4, 44, 5],
      [52, 4, 45, 5],
    ],
  },
  // Bell Curve: the left tail, the middle, the right tail
  "533936279": {
    boxes: [
      [2, 58, 28, 4.5],
      [30, 4, 40, 4.5],
      [72, 58, 28, 4.5],
    ],
    ink: true,
  },
  // Soldier protecting sleeping child: what attacks, the soldier, the child
  "171305372": {
    boxes: [
      [2, 2, 44, 5],
      [4, 56, 40, 5],
      [52, 66, 45, 5],
    ],
  },
  // Monkey Puppet: the white band on top, then the bottom
  "148909805": {
    boxes: [
      [3, 5, 94, 6],
      [5, 86, 90, 6],
    ],
    inkOnly: [0],
  },
  // Two guys on a bus: the wall side, the view side
  "354700819": {
    boxes: [
      [2, 3, 44, 5],
      [54, 3, 44, 5],
    ],
  },
  // Clown Applying Makeup: the white column, one per step
  "195515965": {
    boxes: [
      [3, 6, 54, 5],
      [3, 31, 54, 5],
      [3, 56, 54, 5],
      [3, 81, 54, 5],
    ],
    ink: true,
  },
  // Spider Man Triple: each Spider-Man
  "206151308": {
    boxes: [
      [2, 30, 30, 5],
      [35, 4, 30, 5],
      [68, 22, 30, 5],
    ],
  },
  // Boardroom Meeting Suggestion: the boss's bubble, then the three suggestions
  "1035805": {
    boxes: [
      [29, 2, 34, 3.5],
      [5, 33, 22, 3.2],
      [33, 33, 22, 3.2],
      [60, 33, 32, 3.2],
    ],
    ink: true,
  },
  // Three-headed Dragon: each head, then a caption
  "187102311": {
    boxes: [
      [2, 4, 30, 5],
      [35, 2, 30, 5],
      [68, 8, 30, 5],
      [5, 86, 90, 6],
    ],
  },
  // Flex Tape: the problem, the fix, the result
  "166969924": {
    boxes: [
      [5, 3, 90, 6],
      [5, 44, 90, 6],
      [5, 86, 90, 6],
    ],
  },
};

const BLACK = { color: "#000000", stroke: "transparent" } as const;

/** The template's caption boxes, filled with placeholder text; null when it isn't known here. */
export function memeLayout(id: string | undefined): Caption[] | null {
  const l = id ? L[id] : undefined;
  if (!l) return null;
  return l.boxes.map(([x, y, width, size], i) => {
    const c: Caption = { text: `Text ${i + 1}`, x, y, width, size: size ?? 7 };
    if (l.ink || l.inkOnly?.includes(i)) Object.assign(c, BLACK);
    return c;
  });
}

/** How many templates have a layout (the credits and the tests read it). */
export const MEME_LAYOUT_IDS = Object.keys(L);
