/// <reference types="vite/client" />
import {
  TrailGame,
  readSave,
  names,
  titles,
  ends,
  label,
  description,
  portraitBirthdays,
  journeyDate,
  nextJourneyStartDate,
  calendarDate,
  hazardDeadline,
  hazardSeverity,
  type HazardSeverity,
  type TrailCard,
  type Supply,
  type Hazard,
  type Calamity,
  type Journey,
  type TrailReport,
  type SupplyLoss,
} from "./TrailCard";
import "./style.css";
import { randomName, randomParty, portraitSlots } from "./Party";
import { gsap } from "gsap";
import {
  chooseComputerMove,
  chooseBequests,
  type ComputerMove,
} from "./Computer";
import { reconcile } from "./Render";
import { advanceSimulation } from "./Simulation";
import type { FlowMode } from "./Flows";
import { supplyEmblem, supplyColor, supplyCollectionEmblem } from "./Supplies";
import { GameHistory, replayGame, type GameAction } from "./History";
import {
  gameStatistics,
  summarizeJourneys,
  type Outcome,
  type JourneyModeFilter,
} from "./Stats";
import {
  validateBatchOptions,
  type BatchOptions,
  type BatchProgress,
  type SimulationDataset,
  type BatchMessage,
} from "./SimulationBatch";
import {
  journeyFlow,
  journeyMap,
  journeyMapPreview,
  installJourneyMapInteraction,
  initializeJourneyMapViewport,
} from "./JourneyVisuals";
installJourneyMapInteraction();
const key = "oregon-trail-cards.official.v2";
let saved;
try {
  saved = readSave(localStorage.getItem(key));
} catch {}
const pendingRolls: number[] = [];
let revealedCalamity: Calamity | undefined;
let game = new TrailGame(
  Math.random,
  saved,
  (n) => pendingRolls.push(n),
  (kind) => {
    revealedCalamity = kind;
  },
);
// Preserve remedies recorded by older UI versions without replacing the visit title.
for (const report of Object.values(game.state.trailReports ?? {})) {
  const remedy = (Object.keys(titles) as Calamity[]).find(
    (kind) =>
      report.title === `${titles[kind]} · remedied` ||
      report.title === `${titles[kind]} remedied`,
  );
  if (remedy) {
    (report.remedies ??= []).push(remedy);
    report.title = report.calamity
      ? titles[report.calamity]
      : report.card
        ? label(report.card)
        : titles[remedy];
  }
}
const app = document.querySelector<HTMLElement>("#app")!;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const art = {
  outcomeSuccess: new URL("./assets/outcome-success.webp", import.meta.url)
    .href,
  outcomeFailure: new URL("./assets/outcome-failure.webp", import.meta.url)
    .href,
  journeyMap: new URL("./assets/oregon-trail-map.webp", import.meta.url).href,
  town: new URL("./assets/town.webp", import.meta.url).href,
  independence: new URL("./assets/independence.webp", import.meta.url).href,
  victory: new URL("./assets/journey-victory.webp", import.meta.url).href,
  defeat: new URL("./assets/journey-defeat.webp", import.meta.url).href,
  progressWagon: new URL("./assets/progress-wagon.webp", import.meta.url).href,
  fort: new URL("./assets/fort.webp", import.meta.url).href,
  shop: new URL("./assets/shop.webp", import.meta.url).href,
  legacy: new URL("./assets/legacy.webp", import.meta.url).href,
  tombstone: new URL("./assets/tombstone-full.webp", import.meta.url).href,
  tombstoneIcon: new URL("./assets/tombstone-icon.webp", import.meta.url).href,
  landscape: new URL("./assets/landscape.webp", import.meta.url).href,
  trail: new URL("./assets/trail.webp", import.meta.url).href,
  river: new URL("./assets/river-ford.webp", import.meta.url).href,
  calamity: new URL("./assets/calamity.webp", import.meta.url).href,
};
const riverArt = {
  moderate: new URL("./assets/river-moderate.webp", import.meta.url).href,
  raging: new URL("./assets/river-raging.webp", import.meta.url).href,
  success: new URL("./assets/river-success.webp", import.meta.url).href,
  loss: new URL("./assets/river-supply-loss.webp", import.meta.url).href,
  drowning: new URL("./assets/river-drowning.webp", import.meta.url).href,
};
function riverFailureTag(deadly: boolean) {
  return `<span class="river-failure-tag ${deadly ? "is-deadly" : ""}">Risk: ${deadly ? "drowning" : "supply loss"}</span>`;
}
const wagonArt: Partial<Record<string, string>> = {
  water: new URL("./assets/unsafe-water.webp", import.meta.url).href,
  grass: new URL("./assets/inadequate-grass.webp", import.meta.url).href,
  wheel: new URL("./assets/broken-wheel.webp", import.meta.url).href,
  axle: new URL("./assets/broken-axle.webp", import.meta.url).href,
  tongue: new URL("./assets/broken-tongue.webp", import.meta.url).href,
  oxen: new URL("./assets/dead-oxen.webp", import.meta.url).href,
};
const calamityArt: Record<Calamity, string> = {
  axle: wagonArt.axle!,
  tongue: wagonArt.tongue!,
  wheel: wagonArt.wheel!,
  oxen: wagonArt.oxen!,
  water: wagonArt.water!,
  grass: wagonArt.grass!,
  cholera: new URL("./assets/calamity-cholera.webp", import.meta.url).href,
  measles: new URL("./assets/calamity-measles.webp", import.meta.url).href,
  typhoid: new URL("./assets/calamity-typhoid.webp", import.meta.url).href,
  arm: new URL("./assets/calamity-arm.webp", import.meta.url).href,
  cold: new URL("./assets/calamity-cold.webp", import.meta.url).href,
  starvation: new URL("./assets/calamity-starvation.webp", import.meta.url)
    .href,
  thief: new URL("./assets/calamity-thief.webp", import.meta.url).href,
  hunting: new URL("./assets/calamity-hunting.webp", import.meta.url).href,
  snake: new URL("./assets/calamity-snake.webp", import.meta.url).href,
  dysentery: new URL("./assets/calamity-dysentery.webp", import.meta.url).href,
};
let showJourneys = false;
let journeyOpenError = "";
let welcomeDismissed = false;
let simulationRunning = false;
let simulationError = "";
let showStatistics = false;
let selectedJourneyMap: string | undefined;
let mapReturnView: "stats" | "journey" = "stats";
let statisticsFilter: Outcome | "all" = "all";
let ledgerPage = 0;
const ledgerPageSize = 12;
let flowMode: FlowMode = "journeys";
let statisticsData: ReturnType<typeof gameStatistics> | undefined;
const statisticsByMode = new Map<
  JourneyModeFilter,
  ReturnType<typeof gameStatistics>
>();
let journeysMode: JourneyModeFilter = "played";
let statisticsMode: JourneyModeFilter = "all";
let statisticsSource: "saved" | "batch" = "saved";
let batchDataset: SimulationDataset | undefined;
let batchStatistics: ReturnType<typeof summarizeJourneys> | undefined;
let batchWorker: Worker | undefined;
let batchRunning = false,
  batchStopping = false;
let batchProgress: BatchProgress | undefined;
let batchError = "";
let batchExpanded = false;
let batchConfig = { count: 1000, minPlayers: 2, maxPlayers: 6 };

let statisticsSkipped = 0;
let journeyScroll = 0;
let setup = !game.state.started,
  confirming = false,
  shopOpen = false,
  storageAvailable = true;
let history: GameHistory | undefined;
try {
  history = new GameHistory(localStorage);
} catch {
  storageAvailable = false;
}
type WagonTraveller = {
  name: string;
  portrait: number;
  controller?: "human" | "computer";
};
let party: WagonTraveller[] = randomParty(3);
let computerPaused = false;
let computerSequenceOwner: number | undefined;
let partyKeys = party.map(() => crypto.randomUUID());
let renderedProgress = -1;
let firstPlayer = 0;
let portraitPicker: number | null = null;
const animationRate = 0.4;
document.documentElement.style.setProperty(
  "--motion-scale",
  String(1 / animationRate),
);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let busy = false,
  active: gsap.core.Timeline | null = null;
let pendingNewJourney = false;
function setBusy(b: boolean) {
  busy = b;
  app.setAttribute("aria-busy", String(b));
  if (!b) computerSequenceOwner = undefined;
  if (!b && pendingNewJourney) {
    pendingNewJourney = false;
    queueMicrotask(() =>
      app.querySelector<HTMLButtonElement>('[data-action="new"]')?.click(),
    );
  }
}
let topExpandedManually = false;
function updateHeaderSize() {
  // Separate thresholds prevent the header's height change from toggling it
  // repeatedly when the scroll position is close to the collapse point.
  const compact = document.body.classList.contains("header-compact");
  if (window.scrollY < 2 && topExpandedManually) {
    topExpandedManually = false;
    document.body.classList.remove("top-expanded-manually");
  }
  if (topExpandedManually) document.body.classList.remove("header-compact");
  else if (window.scrollY > 8) document.body.classList.add("header-compact");
  else if (window.scrollY < 2 && compact)
    document.body.classList.remove("header-compact");
}
window.addEventListener(
  "scroll",
  () => {
    updateHeaderSize();
    scheduleStickyPanels();
  },
  { passive: true },
);
updateHeaderSize();
let stickyFrame = 0;
let stickyObserved: Element[] = [];
const activePlayerScroll = new WeakMap<Element, string>();
function scrollToActivePlayer(row: HTMLElement | null) {
  if (!row) return;
  if (!document.body.classList.contains("players-compact")) {
    activePlayerScroll.delete(row);
    return;
  }
  const card = row.querySelector<HTMLElement>(".player.current");
  if (!card || Number(card.dataset.playerIndex) !== game.state.current) return;
  const key = `${game.state.turn}:${card.dataset.playerIndex}`;
  if (activePlayerScroll.get(row) === key) return;
  activePlayerScroll.set(row, key);
  const view = row.getBoundingClientRect(),
    target = card.getBoundingClientRect();
  if (target.left >= view.left + 4 && target.right <= view.right - 4) return;
  const left = Math.max(
    0,
    Math.min(
      row.scrollWidth - row.clientWidth,
      row.scrollLeft +
        target.left -
        view.left -
        (row.clientWidth - target.width) / 2,
    ),
  );
  gsap.killTweensOf(row, "scrollLeft");
  if (reducedMotion.matches) row.scrollLeft = left;
  else gsap.to(row, { scrollLeft: left, duration: 0.35, ease: "power2.out" });
}
const stickySizes = new ResizeObserver(() => scheduleStickyPanels());
function scheduleStickyPanels() {
  if (stickyFrame) return;
  stickyFrame = requestAnimationFrame(() => {
    stickyFrame = 0;
    const header = app.querySelector<HTMLElement>(":scope > header");
    const players = app.querySelector<HTMLElement>(":scope > .players");
    const trail = app.querySelector<HTMLElement>(":scope > .trail-area");
    const scene = app.querySelector<HTMLElement>(":scope > .journey");
    if (!players && topExpandedManually) {
      topExpandedManually = false;
      document.body.classList.remove("top-expanded-manually");
      updateHeaderSize();
    }
    const observed = [header, scene, players, trail].filter(
      (el): el is HTMLElement => !!el,
    );
    if (
      observed.length !== stickyObserved.length ||
      observed.some((el, i) => el !== stickyObserved[i])
    ) {
      stickySizes.disconnect();
      observed.forEach((el) => stickySizes.observe(el));
      stickyObserved = observed;
    }
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const setSize = (name: string, height: number) => {
      const value = `${height}px`;
      if (document.documentElement.style.getPropertyValue(name) !== value)
        document.documentElement.style.setProperty(name, value);
    };
    setSize("--sticky-header-height", headerHeight);
    const toggle = (name: string, panel: HTMLElement | null) => {
      const className = `${name}-compact`;
      if (!panel) {
        document.body.classList.remove(className);
        return;
      }
      const compact = document.body.classList.contains(className);
      const next = topExpandedManually
        ? false
        : window.scrollY > 8
          ? true
          : window.scrollY < 2
            ? false
            : compact;
      if (next === compact) return;
      const before = panel.getBoundingClientRect().height;
      const scene =
        name === "players"
          ? app.querySelector<HTMLElement>(":scope > .journey")
          : null;
      const sceneBefore = scene?.getBoundingClientRect().height ?? 0;
      const sceneMargin = scene
        ? parseFloat(getComputedStyle(scene).marginBottom)
        : 0;
      const sceneOpacity = scene
        ? parseFloat(getComputedStyle(scene).opacity)
        : 1;
      if (scene) {
        gsap.killTweensOf(scene);
        gsap.set(scene, { clearProps: "height,marginBottom,opacity" });
      }
      gsap.killTweensOf(panel, "height");
      panel.style.height = "";
      panel.classList.add("sticky-sizing");
      document.body.classList.toggle(className, next);
      const height = panel.getBoundingClientRect().height;
      panel.classList.remove("sticky-sizing");
      if (scene && !reducedMotion.matches) {
        const sceneHeight = scene.getBoundingClientRect().height;
        gsap.fromTo(
          scene,
          {
            height: sceneBefore,
            marginBottom: sceneMargin,
            opacity: sceneOpacity,
          },
          {
            height: sceneHeight,
            marginBottom: next ? 0 : 20,
            opacity: next ? 0 : 1,
            duration: 0.36,
            ease: "power2.inOut",
            clearProps: "height,marginBottom,opacity",
            onUpdate: scheduleStickyPanels,
          },
        );
      }
      const finish = () => {
        scheduleStickyPanels();
      };
      if (reducedMotion.matches) {
        finish();
        return;
      }
      gsap.fromTo(
        panel,
        { height: before },
        {
          height,
          duration: 0.36,
          ease: "power2.inOut",
          clearProps: "height",
          onComplete: finish,
        },
      );
    };
    toggle("players", players);
    const playersHeight = players?.getBoundingClientRect().height ?? 0;
    setSize("--sticky-players-height", playersHeight);
    const sceneHeight =
      topExpandedManually && scene
        ? scene.getBoundingClientRect().height +
          parseFloat(getComputedStyle(scene).marginBottom)
        : 0;
    setSize("--sticky-scene-height", sceneHeight);
    toggle("timeline", trail);
    scrollToActivePlayer(players);
    const tab = trail?.querySelector<HTMLButtonElement>(".top-expand-tab");
    if (tab) {
      const label = topExpandedManually
        ? "Collapse top section"
        : "Expand top section";
      tab.setAttribute("aria-expanded", String(topExpandedManually));
      tab.setAttribute("aria-label", label);
      tab.title = label;
    }
  });
}
window.addEventListener("resize", scheduleStickyPanels);
function playTimeline(build: (tl: gsap.core.Timeline) => void) {
  return new Promise<void>((resolve) => {
    active = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        active = null;
        resolve();
      },
    });
    active.timeScale(animationRate);
    build(active);
    if (!active.duration()) {
      active = null;
      resolve();
    } else if (reducedMotion.matches) active.progress(1);
  });
}
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) active?.progress(1);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) active?.progress(1);
});
function persist(action: GameAction = { type: "resume" }) {
  try {
    localStorage.setItem(key, JSON.stringify(game.state));
  } catch {
    storageAvailable = false;
  }
  try {
    history?.capture(game.state, { ...action, rolls: [...pendingRolls] });
  } catch {
    storageAvailable = false;
  }
}
function updateTrailReturnButton() {
  const strip = app.querySelector<HTMLElement>(".trail-strip");
  const button = app.querySelector<HTMLButtonElement>(
    '[data-action="trail-end"]',
  );
  if (strip && button)
    button.hidden =
      strip.scrollWidth - strip.clientWidth - strip.scrollLeft <= 8;
}
app.addEventListener(
  "scroll",
  (event) => {
    if ((event.target as Element).classList?.contains("trail-strip"))
      updateTrailReturnButton();
  },
  true,
);
window.addEventListener("resize", updateTrailReturnButton);
async function scrollTrailToEnd() {
  const strip = app.querySelector<HTMLElement>(".trail-strip");
  if (!strip) return;
  const end = Math.max(0, strip.scrollWidth - strip.clientWidth);
  if (Math.abs(strip.scrollLeft - end) < 1) return;
  if (reducedMotion.matches) strip.scrollLeft = end;
  else
    await playTimeline((tl) =>
      tl.to(strip, { scrollLeft: end, duration: 0.36, ease: "power2.inOut" }),
    );
}
async function scrollUpToState(target: Element | null | undefined) {
  if (!target) return;
  const top = Math.max(
    0,
    target.getBoundingClientRect().top + window.scrollY - 24,
  );
  // Keep the user's view when the destination is already below the viewport top.
  if (top >= window.scrollY - 1) return;
  if (reducedMotion.matches) window.scrollTo({ top, behavior: "instant" });
  else
    await playTimeline((tl) =>
      tl.to(document.scrollingElement, {
        scrollTop: top,
        duration: 0.3,
        ease: "power2.inOut",
      }),
    );
}
async function scrollUpToTurn() {
  const turn = app.querySelector<HTMLElement>(".turn-decision");
  if (!turn || window.scrollY < 1) return;
  // The turn must land below the entire sticky dock, including a manually
  // expanded scene, without pulling the page downward when already in view.
  const dockHeight = [
    "header",
    ".players",
    ".trail-area",
    ...(topExpandedManually ? [".journey"] : []),
  ].reduce(
    (height, selector) =>
      height +
      (app
        .querySelector<HTMLElement>(`:scope > ${selector}`)
        ?.getBoundingClientRect().height ?? 0),
    0,
  );
  const top = Math.max(
    0,
    turn.getBoundingClientRect().top + window.scrollY - dockHeight - 16,
  );
  if (top >= window.scrollY - 1) return;
  if (reducedMotion.matches) window.scrollTo({ top, behavior: "instant" });
  else
    await playTimeline((tl) =>
      tl.to(document.scrollingElement, {
        scrollTop: top,
        duration: 0.3,
        ease: "power2.inOut",
      }),
    );
}
async function flyPickup(
  source: Element,
  target: Element,
  playedHandCard?: HTMLElement,
  supply?: Supply,
) {
  const from = source.getBoundingClientRect();
  const landingRect = () => {
    const rect = target.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height, 36);
    return supply
      ? {
          width: size,
          height: size,
          left: rect.left + (rect.width - size) / 2,
          top: rect.top + (rect.height - size) / 2,
        }
      : rect;
  };
  if (!from.width || !landingRect().width) return;
  const startScroll = { x: window.scrollX, y: window.scrollY };
  const landingStyle = getComputedStyle(target);
  const border = supply ? 0 : parseFloat(landingStyle.borderLeftWidth) || 0;
  const token = document.createElement("template");
  if (supply) token.innerHTML = supplyEmblem(supply);
  const copy = (
    supply ? token.content.firstElementChild! : source.cloneNode(true)
  ) as HTMLElement;
  if (supply) copy.classList.add("supply-flight");
  copy.classList.add("pickup-flight");
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    zIndex: "1000",
    pointerEvents: "none",
    transformOrigin: "0 0",
    boxSizing: "border-box",
    aspectRatio: "auto",
    border: `0px solid ${landingStyle.borderLeftColor}`,
    background: supply ? "transparent" : landingStyle.backgroundColor,
  });
  const landingStubs = !supply
    ? (target.querySelector(".settlement-stubs")?.cloneNode(true) as
        SVGElement | undefined)
    : undefined;
  if (landingStubs) {
    landingStubs.style.opacity = "0";
    copy.append(landingStubs);
  }
  document.body.append(copy);
  const destination = target as HTMLElement;
  const origin = source as HTMLElement;
  if (!supply) {
    destination.style.visibility = "hidden";
    origin.style.visibility = "hidden";
  }
  const flight = { progress: 0 };
  const positionFlight = () => {
    const to = landingRect();
    const p = flight.progress;
    if (landingStubs) landingStubs.style.opacity = String(p);
    const startLeft = from.left - (window.scrollX - startScroll.x);
    const startTop = from.top - (window.scrollY - startScroll.y);
    Object.assign(copy.style, {
      left: `${startLeft + (to.left - startLeft) * p}px`,
      top: `${startTop + (to.top - startTop) * p}px`,
      width: `${from.width + (to.width - from.width) * p}px`,
      height: `${from.height + (to.height - from.height) * p}px`,
      borderWidth: `${border * p}px`,
    });
  };
  window.addEventListener("scroll", positionFlight, true);
  window.addEventListener("resize", positionFlight);
  try {
    await playTimeline((tl) => {
      tl.to(
        flight,
        {
          progress: 1,
          duration: 0.48,
          ease: "power2.inOut",
          onUpdate: positionFlight,
        },
        0,
      );
      if (playedHandCard) {
        tl.to(playedHandCard, { opacity: 0, duration: 0.2 }, 0);
        tl.fromTo(
          destination.parentElement!,
          { opacity: 0 },
          { opacity: 1, duration: 0.3, clearProps: "opacity" },
          0.1,
        );
      }
    });
    if (playedHandCard) {
      const remaining = Array.from(
        playedHandCard.parentElement!.children,
      ).filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node !== playedHandCard,
      );
      const positions = remaining.map((node) => node.getBoundingClientRect());
      playedHandCard.remove();
      positionFlight();
      await playTimeline((tl) => {
        tl.eventCallback("onUpdate", positionFlight);
        remaining.forEach((node, i) => {
          const after = node.getBoundingClientRect();
          const x = positions[i].left - after.left;
          const y = positions[i].top - after.top;
          if (x || y)
            tl.fromTo(
              node,
              { x, y },
              {
                x: 0,
                y: 0,
                duration: 0.3,
                ease: "power3.out",
                clearProps: "transform",
              },
              0,
            );
        });
      });
    }
  } finally {
    positionFlight();
    window.removeEventListener("scroll", positionFlight, true);
    window.removeEventListener("resize", positionFlight);
    copy.remove();
    destination.style.removeProperty("visibility");
    origin.style.removeProperty("visibility");
  }
}
function route(c: TrailCard) {
  const [a, b] = ends(c);
  const universal = c.type === "town" || c.type === "fort";
  if (universal)
    return `<span class="any-road">${c.type === "town" ? "TOWN" : "FORT"}</span>`;
  return `<div class="road-rotation"><svg class="road" viewBox="0 0 120 72" role="img" aria-label="${universal ? "Connects any road" : `Road enters ${["top", "middle", "bottom"][a]} edge and leaves ${["top", "middle", "bottom"][b]} edge`}"><path class="road-shadow" d="M0 ${12 + a * 24} C55 ${12 + a * 24},65 ${12 + b * 24},120 ${12 + b * 24}"/><path d="M0 ${12 + a * 24} C55 ${12 + a * 24},65 ${12 + b * 24},120 ${12 + b * 24}"/>${universal ? '<text x="60" y="40" text-anchor="middle">ANY ROAD</text>' : ""}</svg></div>`;
}
function settlementStubs(
  previous: TrailCard | undefined,
  next: TrailCard | undefined,
  first = false,
) {
  const universal = (card: TrailCard) =>
    card.type === "town" || card.type === "fort";
  const incoming = previous
    ? universal(previous)
      ? 1
      : ends(previous)[1]
    : first
      ? 1
      : undefined;
  const outgoing = next ? (universal(next) ? 1 : ends(next)[0]) : undefined;
  const paths = [
    incoming !== undefined ? `M-5 ${12 + incoming * 24} H14` : "",
    outgoing !== undefined ? `M125 ${12 + outgoing * 24} H106` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return paths
    ? `<svg class="road settlement-stubs" viewBox="0 0 120 72" aria-hidden="true"><path class="road-shadow" d="${paths}"/><path d="${paths}"/></svg>`
    : "";
}
function timelineCardAt(step: number) {
  const s = game.state;
  return (
    s.trailReports?.[step]?.card ??
    s.run.find(
      (card, offset) =>
        (card.journeyStep ?? s.count - s.run.length + offset + 1) === step,
    )
  );
}
function card(c: TrailCard, artwork?: string, overlay = "") {
  return `<div class="card-art" title="${escape(label(c))}${c.type === "river" ? "" : `: ${escape(description(c))}`}"><img src="${artwork ?? (c.type === "river" ? (c.deadly ? riverArt.raging : riverArt.moderate) : art[c.type])}" alt="" width="768" height="512" draggable="false">${route(c)}${overlay}</div>`;
}
const button = (action: string, text: string, disabled = false) =>
  `<button data-action="${action}" ${disabled ? "disabled" : ""}>${text}</button>`;
function actionIcon(kind: string) {
  const drawings: Record<string, string> = {
    warning:
      '<path d="M10.3 3.9a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3.1Z" fill="currentColor" stroke="none"/><path d="M12 8v6" stroke="var(--paper)" stroke-width="2"/><circle cx="12" cy="17" r="1" fill="var(--paper)" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<path d="M4 16V4h12M7 19V7h12"/><rect x="10" y="10" width="11" height="12" rx="1"/>',
    roll: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/>',
    draw: '<path d="M4 16V4h12M7 19V7h12"/><rect x="10" y="10" width="11" height="12" rx="1"/>',
    skip: '<path d="M18 4a8 8 0 1 0 2 12A8 8 0 0 1 18 4Z"/>',
    end: '<path d="m5 12 4 4L19 6M5 21h14"/>',
    leave: '<path d="M10 4H4v16h6M10 12h11m-5-5 5 5-5 5"/>',
    new: '<path d="M4 20 9 4l6 16 5-16M3 20h3M18 4h4"/>',
    remove: '<path d="m6 6 12 12M18 6 6 18"/>',
    will: '<path d="M3 10h18v11H3zM12 10v11M2 7h20v3H2z"/><path d="M12 7C5 7 5 1 8 2c3 0 4 5 4 5s1-5 4-5c3-1 3 5-4 5Z"/>',
    book: '<path d="M5 3h14v18H5a2 2 0 0 1 0-4h14M5 3a2 2 0 0 0-2 2v14M8 7h7"/>',
  };
  return `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawings[kind] ?? drawings.end}</svg>`;
}
const turnButton = (action: string, text: string, disabled = false) =>
  button(
    action,
    `${actionIcon(action === "repair" ? "roll" : action === "will-done" ? "book" : action)}<span>${text}</span>`,
    disabled,
  );
const hazardText: Record<string, string> = {
  axle: "Wagon stopped; repair before the round ends or everyone loses.",
  tongue: "Wagon stopped; repair before the round ends or everyone loses.",
  wheel: "Wagon stopped; repair before the round ends or everyone loses.",
  oxen: "Wagon stopped; replace the oxen before the round ends or everyone loses.",
  water: "Clean water cures this. A second bad-water card kills the oxen.",
  grass: "Only a town removes this. A second grass card kills the oxen.",
};
function conditionDescription(kind: Calamity, owner: number) {
  const name = game.state.players[owner].name;
  const personal: Partial<Record<Calamity, string>> = {
    cholera: `${name} has cholera. Two medicine cards cure it; a second cholera card kills ${name}.`,
    measles: `${name} has measles and must miss one turn. Medicine cures it; a second measles card kills ${name}.`,
    arm: `${name} has a broken arm. ${name} must miss two turns, then recovers.`,
    cold: `${name} is suffering from extreme cold. Supply clothes before the round ends, or ${name} dies.`,
    typhoid: `${name} has typhoid. Supply water AND medicine before the round ends, or ${name} dies.`,
    starvation: `${name} is starving. Supply food within two rounds, or ${name} dies.`,
  };
  return personal[kind] ?? hazardText[kind] ?? "";
}
function conditionPortrait(kind: Calamity, owner: number) {
  return wagonKinds.has(kind)
    ? ""
    : portraitImage(game.state.players[owner].portrait ?? owner % 6);
}
function remedyTitle(kind: Calamity, owner?: number) {
  if (owner === undefined || wagonKinds.has(kind))
    return `${titles[kind]} remedied`;
  const name = game.state.players[owner].name;
  if (kind === "starvation") return `${name} is no longer starving`;
  if (kind === "cold") return `${name} is warm again`;
  return `${name} recovered from ${kind === "arm" ? "a broken arm" : titles[kind]}`;
}
function conditionTitle(kind: Calamity, owner: number) {
  const name = game.state.players[owner].name;
  switch (kind) {
    case "cholera":
    case "measles":
    case "typhoid":
      return `${name} has ${titles[kind]}`;
    case "arm":
      return `${name} has a broken arm`;
    case "cold":
      return `${name} is suffering from extreme cold`;
    case "starvation":
      return `${name} is starving`;
    case "snake":
      return `${name} suffered a snakebite`;
    case "dysentery":
      return `${name} died of Dysentery`;
    case "hunting":
      return `${name} went hunting`;
    case "thief":
      return `A thief stole from ${name}`;
    default:
      return titles[kind];
  }
}
function portraitImage(slot: number, large = false) {
  const local = slot % 6;
  return `<span class="portrait portrait-sheet-${Math.floor(slot / 6)} ${large ? "large" : ""}" style="--portrait-x:${(local % 3) * 50}%;--portrait-y:${Math.floor(local / 3) * 100}%" aria-hidden="true"></span>`;
}
function portrait(index: number, large = false) {
  if (game.state.players[index]?.alive === false)
    return `<span class="portrait gravestone ${large ? "large" : ""}" aria-hidden="true"><img src="${art.tombstoneIcon}" alt=""></span>`;
  return portraitImage(game.state.players[index]?.portrait ?? index % 6, large);
}
const humanIcon =
  '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>';
const computerIcon =
  '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 12h.1m7.8 0h.1M8 16h8"/>';
function controllerPicker(p: WagonTraveller, index: number) {
  return `<div class="controller-picker" role="group" aria-label="Who controls ${escape(p.name)}?"><span class="controller-picker-label" aria-live="polite">${p.controller === "computer" ? "Computer" : "Human"}</span>${(["human", "computer"] as const).map((controller) => `<button type="button" data-controller-player="${index}" data-controller-value="${controller}" aria-label="${controller === "human" ? "Human" : "Computer"} controls ${escape(p.name)}" title="${controller === "human" ? "Human — you choose their moves" : "Computer — plays automatically"}" aria-pressed="${(p.controller ?? "human") === controller}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${controller === "human" ? humanIcon : computerIcon}</svg></button>`).join("")}</div>`;
}
function computerControl() {
  return `<button type="button" class="computer-control" data-computer-pause aria-pressed="${computerPaused}" title="${computerPaused ? "Resume" : "Pause"} computer play">${computerPaused ? "▶ Resume computer" : "Ⅱ Pause computer"}</button>`;
}
function travellerCard(p: WagonTraveller, i: number) {
  const choosing = portraitPicker === i;
  return `<article class="traveller-card" data-ui-key="${partyKeys[i]}" data-traveller="${i}"><span class="eyebrow">Traveller ${i + 1}</span><button class="traveller-remove" data-remove-traveller="${i}" aria-label="Remove ${escape(p.name)} from the wagon" title="${party.length === 2 ? "At least two travellers are needed" : "Remove traveller"}" ${party.length === 2 ? "disabled" : ""}><span aria-hidden="true">×</span></button><div class="traveller-portrait"><div class="portrait-picker" id="portrait-picker-${i}" ${!choosing ? "hidden" : ""} role="group" aria-label="Portraits for traveller ${i + 1}">${portraitSlots.map((slot) => `<button data-portrait="${slot}" data-player="${i}" aria-label="Portrait ${slot + 1} for traveller ${i + 1}" aria-pressed="${p.portrait === slot}" class="${p.portrait === slot ? "selected" : ""}">${portraitImage(slot)}</button>`).join("")}</div><button class="${choosing ? "portrait-picker-close" : "portrait-choice"}" data-picker="${i}" aria-expanded="${choosing}" aria-controls="portrait-picker-${i}" aria-label="${choosing ? "Close portrait selection" : "Choose portrait"} for traveller ${i + 1}">${choosing ? "Done" : `${portraitImage(p.portrait, true)}<span>Choose portrait</span>`}</button></div><label class="traveller-name">Name<input class="player-name" data-player="${i}" value="${escape(p.name)}" maxlength="30" required autocomplete="off"></label><small class="traveller-birthday">Born ${calendarDate(portraitBirthdays[p.portrait])}</small>${controllerPicker(p, i)}</article>`;
}
function leaderPicker() {
  return `<div class="leader-choice field"><span id="leader-label">Who leads the way?</span><div class="leader-icons" role="group" aria-labelledby="leader-label">${party.map((p, i) => `<button data-leader="${i}" aria-label="Lead with ${escape(p.name)}" aria-pressed="${i === firstPlayer}" class="leader-icon ${i === firstPlayer ? "selected" : ""}">${portraitImage(p.portrait)}</button>`).join("")}</div><strong class="leader-name" aria-live="polite">${escape(party[firstPlayer].name)}</strong></div>`;
}
function updateLeader() {
  const current = app.querySelector(".leader-choice");
  if (!current) return;
  const template = document.createElement("template");
  template.innerHTML = leaderPicker();
  reconcile(current, template.content.firstElementChild!);
}
function setupScreen() {
  return `<section class="decision setup"><img class="setup-banner" src="${art.landscape}" alt="A covered wagon beneath quiet prairie hills"><div class="setup-body"><p class="eyebrow">A good journey starts with good company</p><h2>Who’s in the wagon?</h2><p>Room for two to six. Pick your companions, pack the kettle, and keep at least one traveller breathing all the way to Oregon.</p><div class="setup-toolbar"><span>${party.length} travellers aboard</span>${button("randomize", "↻ Randomize everyone")}</div><div class="traveller-grid">${party.map(travellerCard).join("")}</div><div class="party-size">${button("add", "+ Traveller", party.length === 6)}</div><div class="setup-departure">${leaderPicker()}<div class="setup-start-actions">${button("start", "Pack up and start your trek →")}<div class="setup-simulation"><button type="button" data-action="simulate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${computerIcon}</svg><span class="simulation-link-text">Let the clankers take the wagon west</span></button></div></div></div></div></section>`;
}
function playerTag(index: number) {
  return `<span class="player-tag">${portrait(index)}<span>${escape(game.state.players[index].name)}</span></span>`;
}
function handCard(c: TrailCard, i: number) {
  const rotatable =
    c.type !== "town" && c.type !== "fort" && c.left + c.right !== 2;
  return `<article data-ui-key="trail-card-${c.id}" class="hand-card ${game.canPlay(c) ? "matches" : ""}" data-hand-index="${i}"><button class="trail-card" data-play="${i}" ${!game.canPlay(c) ? "disabled" : ""} aria-label="Play ${label(c)}">${card(c)}<div class="card-title">${c.type === "river" ? "River crossing" : label(c)}</div>${c.type === "river" ? riverFailureTag(!!c.deadly) : ""}<div class="card-description">${c.type === "river" ? (c.deadly ? "A raging river blocks the trail. Brave the current to reach the far bank." : "The trail meets a flowing river. Ford the water to carry on.") : description(c)}</div>${game.canPlay(c) ? "" : `<div class="card-caption">${game.matches({ ...c, rotated: !c.rotated }) ? "Rotate to connect" : "Does not connect"}</div>`}</button>${rotatable ? `<button class="rotate" data-rotate="${i}" ${game.state.phase !== "turn" || game.state.status !== "travel" ? "disabled" : ""} aria-label="Rotate ${label(c)} 180 degrees">↻ Rotate 180°</button>` : ""}</article>`;
}
const wagonKinds = new Set<Hazard["kind"]>([
  "axle",
  "tongue",
  "wheel",
  "oxen",
  "water",
  "grass",
]);
function playerCalamities() {
  if (game.state.status !== "travel" || game.state.phase === "legacy")
    return "";
  return hazards(
    game.state.hazards
      .filter((h) => Object.values(h.needs).some((count) => count! > 0))
      .sort((a, b) => (a.rounds ?? Infinity) - (b.rounds ?? Infinity)),
  );
}
type ActionNotice = { text: string; icon: string; danger?: boolean };
function conditionWarning(h: Hazard): ActionNotice[] {
  if (h.kind === "arm")
    return [
      { text: healingCountdown(h), icon: "clock" },
      { text: "Heals with rest", icon: "end" },
    ];
  if (h.rounds !== null) {
    const deadline = hazardDeadline(game.state, h);
    if (!deadline) return [];
    const name = game.state.players[deadline.player].name;
    const time = `${deadline.turns} player turn${deadline.turns === 1 ? "" : "s"} left, including this turn`;
    return [
      {
        text: wagonKinds.has(h.kind)
          ? `Remedy before ${name}’s turn ends (${time}), or the journey ends.`
          : `Treat before ${name}’s turn ends (${time}), or ${game.state.players[h.owner].name} dies.`,
        icon: "warning",
        danger: true,
      },
    ];
  }
  if (h.kind === "grass" || h.kind === "water")
    return [
      {
        text: `Second ${titles[h.kind]}: oxen die`,
        icon: "warning",
        danger: true,
      },
      {
        text:
          h.kind === "grass" ? "Remedy at a town" : "Remedy with clean water",
        icon: "end",
      },
    ];
  return [
    { text: "Until treated", icon: "clock" },
    {
      text: `Second ${titles[h.kind]}: ${game.state.players[h.owner].name} dies`,
      icon: "warning",
      danger: true,
    },
  ];
}
const severityRank: Record<HazardSeverity, number> = {
  setback: 0,
  risk: 1,
  danger: 2,
  critical: 3,
};
const severityLabels: Record<HazardSeverity, string> = {
  setback: "Temporary injury",
  risk: "Fatal if repeated",
  danger: "Fatal if untreated",
  critical: "Fatal deadline",
};
function playerSeverity(conditions: Hazard[]) {
  return conditions.reduce<HazardSeverity>(
    (level, h) =>
      severityRank[hazardSeverity(h)] > severityRank[level]
        ? hazardSeverity(h)
        : level,
    "setback",
  );
}
function conditionTiming(h: Hazard) {
  if (h.kind === "arm") return healingCountdown(h);
  if (h.rounds === null) return "";
  const deadline = hazardDeadline(game.state, h);
  return deadline
    ? `${deadline.turns} turn${deadline.turns === 1 ? "" : "s"} to treat`
    : "";
}
function healingCountdown(hazard: Hazard) {
  if (hazard.kind !== "arm") return "";
  const turns = hazard.rounds ?? hazard.skip;
  return `${turns} turn${turns === 1 ? "" : "s"} to heal`;
}
const inventoryTrailKinds: TrailCard["type"][] = [
  "trail",
  "calamity",
  "river",
  "town",
  "fort",
];
const inventoryTrailNames: Record<TrailCard["type"], string> = {
  trail: "Trail",
  calamity: "Calamity",
  river: "River",
  town: "Town",
  fort: "Fort",
};
function playerInventory(index: number) {
  const player = game.state.players[index];
  const stack = (
    kind: string,
    count: number,
    preview: "trail" | "supplies",
    face: string,
    text: string,
  ) =>
    preview === "supplies"
      ? `<button class="player-count inventory-stack inventory-supply" data-ui-key="inventory-${preview}-${kind}" data-player-preview="${preview}" data-player-index="${index}" data-inventory-kind="${kind}" aria-label="${escape(player.name)}: ${count} ${escape(text)}">${supplyEmblem(kind as Supply, count, true)}</button>`
      : `<button class="player-count inventory-stack" data-ui-key="inventory-${preview}-${kind}" data-player-preview="${preview}" data-player-index="${index}" data-inventory-kind="${kind}" aria-label="${escape(player.name)}: ${count} ${escape(text)}"><span class="inventory-layers" aria-hidden="true">${Array.from({ length: Math.min(3, count) }, (_, layer) => `<span class="inventory-layer" style="--inventory-layer:${Math.min(3, count) - layer - 1}">${layer === Math.min(3, count) - 1 ? face : ""}</span>`).join("")}<b class="inventory-count">${count}</b></span></button>`;
  const trail = inventoryTrailKinds
    .map((kind) => {
      const cards = player.hand.filter((card) => card.type === kind);
      if (!cards.length) return "";
      const image =
        kind === "river"
          ? cards[0].deadly
            ? riverArt.raging
            : riverArt.moderate
          : art[kind];
      return stack(
        kind,
        cards.length,
        "trail",
        `<img src="${image}" alt="">`,
        `${inventoryTrailNames[kind].toLowerCase()} card${cards.length === 1 ? "" : "s"}`,
      );
    })
    .join("");
  const supplies = (Object.keys(names) as Supply[])
    .map((kind) => {
      const count = player.supplies.filter((supply) => supply === kind).length;
      return count
        ? stack(
            kind,
            count,
            "supplies",
            supplyEmblem(kind),
            `${names[kind].toLowerCase()} suppl${count === 1 ? "y" : "ies"}`,
          )
        : "";
    })
    .join("");
  return `<div class="player-inventory"><div class="inventory-group" role="group" aria-label="Trail cards">${trail || `<button class="player-count inventory-empty" data-player-preview="trail" data-player-index="${index}" aria-label="${escape(player.name)} has no trail cards">No cards</button>`}</div><div class="inventory-group inventory-supplies" role="group" aria-label="Supplies">${supplies || `<button class="player-count inventory-empty" data-player-preview="supplies" data-player-index="${index}" aria-label="${escape(player.name)} has no supplies">No supplies</button>`}</div></div>`;
}
function compactPlayerInventory(index: number) {
  const p = game.state.players[index];
  const image = p.hand[0] ? art[p.hand[0].type] : art.trail;
  const layers = Math.min(3, Math.max(1, p.hand.length));
  return `<div class="compact-player-inventory"><button class="compact-card-stack ${p.hand.length ? "" : "is-empty"}" data-player-preview="summary" data-player-index="${index}" aria-label="${escape(p.name)}: ${p.hand.length} trail cards; full player details"><span class="inventory-layers" aria-hidden="true">${Array.from({ length: layers }, (_, i) => `<span class="inventory-layer" style="--inventory-layer:${layers - i - 1}">${i === layers - 1 ? `<img src="${image}" alt="">` : ""}</span>`).join("")}<b class="inventory-count">${p.hand.length}</b></span></button><button class="compact-supply-stack ${p.supplies.length ? "" : "is-empty"}" data-player-preview="summary" data-player-index="${index}" aria-label="${escape(p.name)}: ${p.supplies.length} supplies; full player details">${supplyCollectionEmblem(p.supplies)}</button></div>`;
}
function compactCondition(h: Hazard) {
  const severity = hazardSeverity(h);
  return `<span class="condition-compact" aria-hidden="true"><img src="${calamityArt[h.kind]}" alt=""><span class="compact-ailment-overlay">${actionIcon(severity === "setback" ? "clock" : severity === "risk" ? "draw" : "warning")}</span></span>`;
}
function playerCard(index: number, turnPlayer = game.state.current) {
  const s = game.state;
  const p = s.players[index];
  const conditions = s.hazards.filter(
    (h) => h.owner === index && !wagonKinds.has(h.kind),
  );
  return `<div data-ui-key="player-${index}" data-player-preview="summary" data-player-index="${index}" tabindex="0" aria-label="${escape(p.name)}${index === turnPlayer ? ", current turn" : ""}: full player details" class="player ${index === turnPlayer ? "current" : ""} ${!p.alive ? "dead" : conditions.length ? `unwell severity-${playerSeverity(conditions)}` : ""}">${index === turnPlayer && p.alive ? '<span class="compact-active-badge" aria-hidden="true">Turn</span>' : ""}<div class="player-heading">${portrait(index)}<div><strong>${escape(p.name)} ${p.controller === "computer" ? `<svg class="computer-player-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" role="img" aria-label="Computer">${computerIcon}</svg>` : ""} ${!p.alive ? "†" : index === turnPlayer ? '<span class="player-turn-tag">Turn</span>' : ""}</strong>${p.birthday ? `<small class="player-birthday">Born ${calendarDate(p.birthday)}</small>` : ""}</div></div>${p.alive ? `${playerInventory(index)}${compactPlayerInventory(index)}` : `<small class="player-epitaph">${escape(p.epitaph)}</small>`}<div class="player-state" aria-label="${escape(p.name)}’s condition">${(p.alive ? conditions : []).map((h) => `<button class="condition-status severity-${hazardSeverity(h)}" style="--condition-art:url('${calamityArt[h.kind]}')" data-ui-key="condition-${h.id}" data-player-preview="condition" data-player-index="${index}" data-hazard-id="${h.id}" aria-label="${escape(conditionTitle(h.kind, index))}: ${severityLabels[hazardSeverity(h)]}${conditionTiming(h) ? `, ${conditionTiming(h)}` : ""}: condition and remedies"><span>${titles[h.kind]}</span><span class="condition-severity">${severityLabels[hazardSeverity(h)]}</span>${conditionTiming(h) ? `<span class="healing-countdown">${conditionTiming(h)}</span>` : ""}${compactCondition(h)}</button>`).join("")}${p.alive && !conditions.length ? '<span class="condition-clear">In good health</span>' : ""}</div></div>`;
}
function refreshPlayerSummaries(turnPlayer: number) {
  const summaries = app.querySelector(".players");
  if (!summaries) return;
  const template = document.createElement("template");
  template.innerHTML = game.state.players
    .map((_, index) => playerCard(index, turnPlayer))
    .join("");
  reconcile(summaries, template.content);
  scheduleStickyPanels();
}
function reservePlayedTrailTile(played: TrailCard, animate: boolean) {
  const strip = app.querySelector(".trail-strip");
  if (!strip) return;
  const piece = document.createElement("div");
  piece.className = "trail-piece";
  if (animate) piece.style.opacity = "0";
  piece.dataset.uiKey = `trail-step-${played.journeyStep}`;
  piece.tabIndex = 0;
  piece.dataset.trailResults = "[]";
  const artwork = document.createElement("template");
  const step = played.journeyStep ?? game.state.count;
  const previous = timelineCardAt(step - 1);
  artwork.innerHTML = card(
    played,
    undefined,
    ["town", "fort"].includes(played.type)
      ? settlementStubs(previous, undefined, step === 1)
      : "",
  );
  if (previous && ["town", "fort"].includes(previous.type)) {
    const priorArt = strip.querySelector(
      `[data-ui-key="trail-step-${step - 1}"] .card-art`,
    );
    priorArt?.querySelector(".settlement-stubs")?.remove();
    priorArt?.insertAdjacentHTML(
      "beforeend",
      settlementStubs(timelineCardAt(step - 2), played, step === 2),
    );
  }
  piece.append(artwork.content);
  const caption = document.createElement("small");
  caption.textContent = label(played);
  piece.append(caption);
  strip.insertBefore(piece, strip.lastElementChild);
  return piece;
}
type SceneArt = { src: string; alt: string };
function actionArtwork(s = game.state): SceneArt | undefined {
  if (s.phase === "repair" && s.pending && wagonArt[s.pending])
    return { src: wagonArt[s.pending]!, alt: titles[s.pending] };
  if (s.phase === "river")
    return {
      src: s.run.at(-1)?.deadly ? riverArt.raging : riverArt.moderate,
      alt: s.run.at(-1)?.deadly
        ? "A wagon facing a raging river"
        : "A wagon fording a moderate river",
    };
  if (s.phase === "discard" && s.pending !== "thief")
    return {
      src: riverArt.loss,
      alt: "Supplies swept away during the crossing",
    };
  if (s.phase === "legacy")
    return { src: art.legacy, alt: "A quiet prairie gravestone" };
  if (s.phase === "town" || s.phase === "fort")
    return { src: art[s.phase], alt: `A welcoming frontier ${s.phase}` };
  if (s.phase === "discard")
    return { src: calamityArt.thief, alt: "A thief taking a supply" };
}
function journeyArtwork(s = game.state): SceneArt {
  const action = actionArtwork(s);
  if (action) return action;
  const breakdown = s.hazards.find((h) =>
    ["axle", "tongue", "wheel", "oxen"].includes(h.kind),
  );
  if (breakdown)
    return { src: wagonArt[breakdown.kind]!, alt: titles[breakdown.kind] };
  const condition = s.hazards.find((h) => wagonKinds.has(h.kind));
  if (condition)
    return { src: wagonArt[condition.kind]!, alt: titles[condition.kind] };
  if (s.status === "lost")
    return { src: art.legacy, alt: "The journey ended on the prairie" };
  return {
    src: art.landscape,
    alt: "A weathered print of a wagon beneath quiet prairie hills",
  };
}
function journeyPreviewArtwork(state: Journey): SceneArt {
  if (state.status === "won")
    return { src: art.victory, alt: "The wagon reaches Oregon" };
  if (state.status === "lost")
    return { src: art.defeat, alt: "The journey ends on the prairie" };
  const scene = journeyArtwork(state);
  if (scene.src === art.landscape) {
    const condition = state.hazards.find(
      (h) => h.owner === state.current && !wagonKinds.has(h.kind),
    );
    if (condition)
      return {
        src: calamityArt[condition.kind],
        alt: `${state.players[state.current].name}: ${titles[condition.kind]}`,
      };
  }
  return scene;
}
function wagonState() {
  const conditions = game.state.hazards.filter((h) => wagonKinds.has(h.kind));
  return conditions.length
    ? `<div class="wagon-state" aria-label="Wagon condition"><p class="eyebrow">Wagon conditions</p><div class="wagon-condition-list">${conditions.map((h) => `<button class="wagon-condition severity-${hazardSeverity(h)}" data-ui-key="wagon-condition-${h.id}" data-wagon-preview data-hazard-id="${h.id}" aria-label="${titles[h.kind]}: wagon condition and remedies"><img src="${calamityArt[h.kind]}" alt=""><span>${titles[h.kind]}<small>${h.rounds !== null ? `${h.rounds} round${h.rounds === 1 ? "" : "s"} left · journey at risk` : h.kind === "grass" ? "Next grass calamity: oxen die" : "Next bad water: oxen die"}</small></span></button>`).join("")}</div></div>`
    : "";
}
function remedyDescription(h: Hazard) {
  if (wagonKinds.has(h.kind)) return conditionDescription(h.kind, h.owner);
  const name = game.state.players[h.owner].name;
  const needed = (Object.entries(h.needs) as [Supply, number][])
    .filter(([, count]) => count > 0)
    .map(
      ([kind, count]) =>
        `${count} ${kind === "water" ? "clean water" : names[kind].toLowerCase()} card${count === 1 ? "" : "s"}`,
    )
    .join(" and ");
  if (h.kind === "arm")
    return `${name} is recovering from a broken arm and must rest ${h.skip} more turn${h.skip === 1 ? "" : "s"}. No supplies are needed; the arm heals with rest.`;
  const deadline =
    h.rounds === null
      ? ""
      : ` within ${h.rounds} round${h.rounds === 1 ? "" : "s"}`;
  const danger =
    h.kind === "cholera" || h.kind === "measles"
      ? ` The illness remains until fully treated; a second ${titles[h.kind].toLowerCase()} calamity would be fatal for ${name}.`
      : ` Without treatment before the deadline, ${name} will die.`;
  const rest = h.skip
    ? ` ${name} must also rest ${h.skip} turn${h.skip === 1 ? "" : "s"} unless cured first.`
    : "";
  return `${name} needs ${needed}${deadline} to recover. You can give a needed supply on your turn instead of playing a trail card.${rest}${danger}`;
}
function turnOption(
  key: string,
  title: string,
  text: string,
  controls: string,
  image?: string,
  urgent = false,
  warning: ActionNotice[] = [],
  subject = "",
  severity?: HazardSeverity,
) {
  return `<article class="turn-option ${urgent ? "is-urgent" : ""} ${severity ? `severity-${severity}` : ""}" data-ui-key="option-${key}"><div class="option-summary">${image ? `<img class="option-art" src="${image}" alt="">` : `<span class="option-symbol">${actionIcon(key)}</span>`}<div class="option-copy"><h3>${subject}${escape(title)}</h3>${text ? `<p>${escape(text)}</p>` : ""}${warning.length ? `<div class="option-notices" aria-label="Timing and consequences">${warning.map((notice) => `<span class="action-notice ${notice.danger ? "is-danger" : ""}">${actionIcon(notice.icon)}<span>${escape(notice.text)}</span></span>`).join("")}</div>` : ""}</div></div><div class="option-controls choices">${controls}</div></article>`;
}
function hazards(conditions: Hazard[]) {
  return conditions
    .map((h) => {
      const controls = (Object.keys(h.needs) as Supply[])
        .filter((k) => h.needs[k]! > 0)
        .map((k) => {
          const reason =
            game.state.phase !== "turn"
              ? "After this encounter"
              : game.skips
                ? "Resting this turn"
                : !game.player.supplies.includes(k)
                  ? `No ${names[k].toLowerCase()} in your bag`
                  : game.state.used >= (game.living.length === 2 ? 2 : 1)
                    ? "Supply turn used"
                    : "";
          return `<div class="remedy-choice"><button style="--remedy-color:${supplyColor(k)}" data-cure="${h.id}" data-supply="${k}" ${reason ? "disabled" : ""}>${supplyEmblem(k)}<span>Give ${names[k]}<small>${h.needs[k]} still needed</small></span>${actionIcon("end")}</button>${reason ? `<small class="action-unavailable">${escape(reason)}</small>` : ""}</div>`;
        })
        .join("");
      return turnOption(
        `hazard-${h.id}`,
        conditionTitle(h.kind, h.owner),
        `Give ${Object.entries(h.needs)
          .filter(([, count]) => count! > 0)
          .map(
            ([kind, count]) =>
              `${count} ${names[kind as Supply].toLowerCase()}`,
          )
          .join(
            " and ",
          )} to ${wagonKinds.has(h.kind) ? "get the wagon moving safely again" : `help ${game.state.players[h.owner].name} recover`}. Uses your supply turn.${h.skip ? ` They must rest ${h.skip} more turn${h.skip === 1 ? "" : "s"} unless cured.` : ""}`,
        controls,
        calamityArt[h.kind],
        true,
        conditionWarning(h),
        conditionPortrait(h.kind, h.owner),
        hazardSeverity(h),
      );
    })
    .join("");
}
let willPanel: HTMLElement | undefined;
let willDraftOwner = -1;
let willDraft = new Map<number, number>();
let selectedWillSupply: number | null = null;
let willMessage = "";
function memorial(index: number, editable = true) {
  const dead = game.state.players[index];
  return `<div class="memorial" aria-label="Gravestone for ${escape(dead.name)}"><div class="memorial-stone"><img class="memorial-template" src="${art.tombstone}" alt=""><div class="memorial-inscription"><span class="memorial-rip">R.I.P.</span><h3>${escape(dead.name)}</h3><div class="memorial-dates"><span>${dead.birthday ? calendarDate(dead.birthday) : "?"} — ${dead.deathDate ? calendarDate(dead.deathDate) : "?"}</span>${dead.deathDay !== undefined ? `<small>${dead.deathDay} day${dead.deathDay === 1 ? "" : "s"} on the trail</small>` : ""}</div><span class="memorial-rule" aria-hidden="true">✦</span>${editable ? `<label class="memorial-epitaph"><span class="sr-only">Epitaph for ${escape(dead.name)}</span><textarea id="epitaph" rows="3" maxlength="160" placeholder="A few words to remember them by…">${escape(dead.epitaph)}</textarea></label>` : `<p class="memorial-epitaph">${escape(dead.epitaph)}</p>`}</div></div></div>`;
}
function willEditor() {
  const s = game.state;
  const owner = s.deaths[0];
  if (willDraftOwner !== owner) {
    willDraftOwner = owner;
    willDraft = new Map();
    selectedWillSupply = null;
    willMessage = "";
  }
  const dead = s.players[owner];
  const chip = (kind: Supply, index: number) =>
    `<button class="will-chip ${selectedWillSupply === index ? "selected" : ""}" data-ui-key="will-item-${index}" data-will-item="${index}" draggable="true" aria-pressed="${selectedWillSupply === index}" aria-label="Select ${names[kind]} ${index + 1}">${supplyEmblem(kind)}</button>`;
  return `<div class="will-editor"><p class="will-instruction">Drag supplies to a traveller, or select a supply and then its recipient. Move it back to change your mind.</p><div class="will-columns"><div class="will-source will-drop-zone" data-will-source role="button" tabindex="0" aria-label="Return selected supply"><h4>Supplies left behind</h4><div class="will-items">${dead.supplies.map((kind, i) => (!willDraft.has(i) ? chip(kind, i) : "")).join("") || '<span class="will-empty">Nothing left in the bag.</span>'}</div></div><div class="will-recipients"><h4>Travellers</h4>${game.living
    .map(
      (i) =>
        `<div class="will-recipient will-drop-zone" data-will-recipient="${i}" role="button" tabindex="0" aria-label="Will selected supply to ${escape(s.players[i].name)}"><div class="will-recipient-name">${portrait(i)}<strong>${escape(s.players[i].name)}</strong></div><div class="will-items">${
          [...willDraft]
            .filter(([, recipient]) => recipient === i)
            .map(([index]) => chip(dead.supplies[index], index))
            .join("") || '<span class="will-empty">Drop a supply here</span>'
        }</div></div>`,
    )
    .join(
      "",
    )}</div></div><div class="will-footer"><span class="will-status" role="status">${willMessage || `${willDraft.size} / ${2 - s.legacyCount} supplies chosen`}</span>${button("will-supplies", "Will supplies")}</div></div>`;
}
function updateWillDraft() {
  const editor = (willPanel ?? app).querySelector(".will-editor");
  if (!editor) return;
  const template = document.createElement("template");
  template.innerHTML = willEditor();
  reconcile(editor, template.content.firstElementChild!);
}
function assignWillSupply(index: number, recipient?: number) {
  const s = game.state;
  if (
    (busy && !willPanel) ||
    s.phase !== "legacy" ||
    !s.players[s.deaths[0]].supplies[index]
  )
    return;
  willMessage = "";
  if (recipient === undefined) willDraft.delete(index);
  else if (!game.living.includes(recipient)) return;
  else if (!willDraft.has(index) && willDraft.size >= 2 - s.legacyCount) {
    willMessage = "Choose up to two supplies. Move one back to make room.";
    updateWillDraft();
    return;
  } else willDraft.set(index, recipient);
  selectedWillSupply = null;
  updateWillDraft();
}
let draggingWillSupply: number | null = null;
document.addEventListener("dragstart", (event) => {
  const chip = (event.target as Element).closest<HTMLElement>(
    "[data-will-item]",
  );
  if (!chip || (busy && !willPanel)) return;
  draggingWillSupply = Number(chip.dataset.willItem);
  event.dataTransfer?.setData(
    "application/x-oregon-will",
    String(draggingWillSupply),
  );
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragover", (event) => {
  const zone = (event.target as Element).closest(".will-drop-zone");
  if (!zone || draggingWillSupply === null || (busy && !willPanel)) return;
  event.preventDefault();
  document
    .querySelectorAll(".will-drop-zone.drag-over")
    .forEach((el) => el.classList.remove("drag-over"));
  zone.classList.add("drag-over");
});
document.addEventListener("drop", (event) => {
  const zone = (event.target as Element).closest<HTMLElement>(
    ".will-drop-zone",
  );
  if (!zone || draggingWillSupply === null) return;
  event.preventDefault();
  assignWillSupply(
    draggingWillSupply,
    zone.dataset.willRecipient === undefined
      ? undefined
      : Number(zone.dataset.willRecipient),
  );
  draggingWillSupply = null;
  document
    .querySelectorAll(".drag-over")
    .forEach((el) => el.classList.remove("drag-over"));
});
document.addEventListener("dragend", () => {
  draggingWillSupply = null;
  document
    .querySelectorAll(".drag-over")
    .forEach((el) => el.classList.remove("drag-over"));
});
document.addEventListener("click", (event) => {
  if ((busy && !willPanel) || game.state.phase !== "legacy") return;
  const target = event.target as Element;
  const chip = target.closest<HTMLElement>("[data-will-item]");
  const zone = target.closest<HTMLElement>(".will-drop-zone");
  if (!chip && !zone) return;
  event.stopImmediatePropagation();
  if (chip) {
    const index = Number(chip.dataset.willItem);
    selectedWillSupply = selectedWillSupply === index ? null : index;
    updateWillDraft();
  } else if (selectedWillSupply !== null && zone)
    assignWillSupply(
      selectedWillSupply,
      zone.dataset.willRecipient === undefined
        ? undefined
        : Number(zone.dataset.willRecipient),
    );
});
document.addEventListener("keydown", (event) => {
  const zone = event.target as HTMLElement;
  if (zone.matches(".will-drop-zone") && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    zone.click();
  }
});
function playerSupplies(index = game.state.current) {
  const p = game.state.players[index];
  return `<div class="supply-hand" aria-label="Current player supplies"><span class="resource-label">Supplies</span><div>${
    (Object.keys(names) as Supply[])
      .map((kind) => {
        const quantity = p.supplies.filter((k) => k === kind).length;
        return quantity ? supplyEmblem(kind, quantity, true) : "";
      })
      .join("") || '<span class="empty-supplies">A very light bag.</span>'
  }</div></div>`;
}
function decision() {
  const s = game.state,
    p = game.player;
  let options = "";
  if (s.status !== "travel") {
    options = turnOption(
      "new",
      s.status === "won" ? "Hello, Oregon." : "The prairie keeps your story.",
      s.note,
      turnButton("new", "Another journey"),
      s.status === "won" ? art.landscape : art.legacy,
    );
    options += renderJourneyMapPreview(s);
  } else if (s.phase === "legacy") {
    options = "";
  } else if (s.phase === "town" || s.phase === "fort") {
    const supplyChoices = (Object.keys(names) as Supply[])
      .map(
        (k) =>
          `<button data-take="${k}" ${!s.shop[k] ? "disabled" : ""}>${supplyEmblem(k, s.shop[k], true)}<span>Take ${names[k]}</span></button>`,
      )
      .join("");
    options = turnOption(
      "settlement-supplies",
      game.top ? label(game.top) : "Restock supplies",
      `Choose a supply to pack. ${s.take} pick${s.take === 1 ? "" : "s"} remaining.`,
      supplyChoices,
      art[s.phase],
    );
    if (s.phase === "town")
      options += s.hazards
        .map((h) =>
          turnOption(
            `town-${h.id}`,
            wagonKinds.has(h.kind)
              ? `Remedy ${titles[h.kind]}`
              : `Treat ${s.players[h.owner].name}’s ${titles[h.kind].toLowerCase()}`,
            "The town can remove this condition instead of providing a supply.",
            `<button data-town="${h.id}">${actionIcon("end")}<span>Remedy ${titles[h.kind]}</span></button>`,
            calamityArt[h.kind],
            true,
            conditionWarning(h),
          ),
        )
        .join("");
    options += turnOption(
      "leave",
      "Carry on",
      "Finish this stop and pass the turn.",
      turnButton(
        "leave",
        s.phase === "fort" && s.take < 2
          ? "Leave with what you have"
          : "Leave without supplies",
      ),
    );
  } else {
    options = playerCalamities();
    if (s.phase === "river") {
      options += turnOption(
        "roll",
        "Cross the river",
        "The wagon cannot continue until someone reaches the far bank. An even roll succeeds; an odd roll passes the attempt to the next traveller.",
        game.skips
          ? turnButton("skip", "Rest and pass the attempt")
          : turnButton("roll", "Roll to ford"),
        game.top?.deadly ? riverArt.raging : riverArt.moderate,
        true,
        [
          { text: "Even roll: cross safely", icon: "roll" },
          {
            text: game.top?.deadly
              ? "Roll 1: current traveller drowns"
              : "Roll 1: one supply lost",
            icon: "warning",
            danger: true,
          },
          { text: "Roll 3 or 5: try next turn", icon: "clock" },
        ],
      );
    } else if (s.phase === "repair") {
      options += turnOption(
        "repair",
        `Repair ${titles[s.pending!].toLowerCase()}`,
        "Try to get the wagon moving again. Roll 4–6 to repair it. On 1–3, the wagon needs a spare-part supply.",
        turnButton("repair", "Roll to repair"),
        calamityArt[s.pending!],
        true,
        [
          { text: "Roll 4–6: repaired", icon: "roll" },
          {
            text: "Roll 1–3: spare parts needed",
            icon: "warning",
            danger: true,
          },
          { text: "Then 1 round to remedy", icon: "clock" },
          {
            text: "Unresolved: the journey ends",
            icon: "warning",
            danger: true,
          },
        ],
      );
    } else if (game.skips) {
      const resting = s.hazards.filter(
        (h) => h.owner === s.current && h.skip > 0,
      );
      options += turnOption(
        "skip",
        "Rest this turn",
        resting
          .map((h) =>
            h.kind === "arm"
              ? remedyDescription(h)
              : `${titles[h.kind]} requires ${h.skip} more turn${h.skip === 1 ? "" : "s"} of rest.`,
          )
          .join(" "),
        turnButton("skip", "Rest and end turn"),
        resting[0] ? calamityArt[resting[0].kind] : undefined,
      );
    } else if (s.used) {
      options += turnOption(
        "end",
        "Finish supplying remedies",
        game.living.length === 2 && s.used < 2
          ? "You may give one more needed supply above, or finish your turn."
          : "Your remedy has been supplied. Pass to the next traveller.",
        turnButton("end", "Finish supply turn"),
      );
    } else {
      if (!game.blocked && p.hand.length)
        options += turnOption(
          "play",
          "Play a trail card",
          "Choose a connected card below. Rotate a card to line up its road.",
          `<section class="hand" aria-label="Current player trail cards">${p.hand.map(handCard).join("")}</section>`,
          art.trail,
        );
      if (!game.hasTrail)
        options += turnOption(
          "draw",
          "Draw a trail card",
          game.blocked
            ? "The wagon is stopped. Draw a card for a later turn while the party works on repairs."
            : "No card connects. Draw one for a later turn and pass to the next traveller.",
          turnButton("draw", "Draw one card & end turn"),
        );
    }
  }
  return `<section class="decision turn-decision" aria-live="polite"><p class="eyebrow">${s.status === "travel" ? `Day ${s.turn}` : "Journey’s end"}</p><div class="turn-header" data-turn-player="${s.phase === "legacy" ? s.deaths[0] : s.current}"><div class="decision-heading">${portraitImage(s.players[s.phase === "legacy" ? s.deaths[0] : s.current].portrait ?? 0, true)}<h2>${s.phase === "legacy" ? `Farewell, ${escape(s.players[s.deaths[0]].name)}.` : `${escape(p.name)}’s turn`}</h2></div>${s.status === "travel" && s.phase !== "legacy" ? playerSupplies() : ""}</div>${s.status === "travel" && p.controller === "computer" ? `<div class="computer-turn-status"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${computerIcon}</svg>Computer traveller</span>${computerControl()}</div>` : ""}<div class="turn-state-window"><div class="turn-state turn-options" data-ui-key="turn-state" data-phase="${s.phase}">${options}</div></div>${s.status === "travel" && s.phase !== "legacy" ? `<div class="turn-map-preview">${renderJourneyMapPreview(s)}</div>` : ""}</section>`;
}
function reportFor(c: TrailCard) {
  return c.journeyStep ? game.state.trailReports?.[c.journeyStep] : undefined;
}
function reportArtwork(report?: TrailReport, trailCard = report?.card) {
  if (trailCard?.type === "river")
    return trailCard.deadly ? riverArt.raging : riverArt.moderate;
  if (report?.calamity) return calamityArt[report.calamity];
  return report?.scene
    ? report.scene === "restored"
      ? art.landscape
      : report.scene === "attempt"
        ? art.river
        : riverArt[report.scene]
    : undefined;
}
function restoreTimelineOwners() {
  const reports = game.state.trailReports ?? {};
  const riverAttempts = new Map<number, number>();
  const recoveredResults = new Map<number, string[]>();
  const recoveredLossOwners = new Map<number, number[]>();
  const recoveredWagonRemedies = new Map<
    number,
    NonNullable<TrailReport["wagonRemedies"]>
  >();
  const recoverResult = (step: number, text: string) => {
    if (!reports[step]?.results?.length) {
      const list = recoveredResults.get(step) ?? [];
      list.push(text);
      recoveredResults.set(step, list);
    }
  };
  const remember = (state: Journey) => {
    state.hazards.forEach((h) => {
      if (
        h.trailStep &&
        reports[h.trailStep]?.calamity === h.kind &&
        !wagonKinds.has(h.kind)
      )
        reports[h.trailStep].owner ??= h.owner;
    });
  };
  remember(game.state);
  const recorded = history?.archive.games.find(
    (g) => g.id === history!.archive.active,
  );
  if (
    recorded &&
    recorded.initial.players.every(
      (p, i) => p.name === game.state.players[i]?.name,
    )
  ) {
    let previous = recorded.initial;
    remember(previous);
    for (const event of recorded.events) {
      const next = replayGame({
        ...recorded,
        initial: previous,
        events: [event],
      });
      if (event.action.type === "play" && next.count > previous.count) {
        const report = reports[next.count];
        if (report) report.playedBy ??= previous.current;
        if (report?.calamity && !wagonKinds.has(report.calamity))
          report.owner ??= previous.current;
      }
      if (event.action.type === "roll" && previous.phase === "river") {
        const step = previous.run.at(-1)?.journeyStep ?? previous.count;
        riverAttempts.set(step, (riverAttempts.get(step) ?? 0) + 1);
      }
      const top = previous.run.at(-1);
      const step = top?.journeyStep ?? previous.count;
      const roll = event.action.rolls?.at(-1);
      if (roll && ["roll", "repair"].includes(event.action.type)) {
        recoverResult(
          step,
          rollOutcomeText(
            roll,
            {
              phase: previous.phase,
              traveller: previous.players[previous.current].name,
              deadly: !!top?.deadly,
              calamity: previous.pending
                ? titles[previous.pending]
                : "Wagon repair",
            },
            riverAttempts.get(step) ?? 1,
            next.phase,
          ),
        );
      }
      if (
        event.action.type === "play" &&
        previous.players[previous.current].hand[Number(event.action.args?.play)]
          ?.type === "calamity"
      ) {
        recoverResult(
          next.count,
          calamityResultText(
            previous.calamities[0],
            next.note,
            previous.current,
          ),
        );
      }
      if (event.action.type === "discard") {
        const owner = Number(event.action.args?.owner);
        const owners = recoveredLossOwners.get(step) ?? [];
        owners.push(owner);
        recoveredLossOwners.set(step, owners);
        const kind =
          previous.players[owner]?.supplies[Number(event.action.args?.discard)];
        if (kind)
          recoverResult(
            step,
            `${previous.players[owner].name} lost ${names[kind].toLowerCase()}.`,
          );
      }
      if (event.action.type === "take") {
        const kind = event.action.args?.take as Supply;
        if (kind in names)
          recoverResult(
            step,
            `${names[kind]} added to ${previous.players[previous.current].name}’s supplies.`,
          );
      }
      if (["cure", "town"].includes(event.action.type)) {
        const hazard = previous.hazards.find(
          (h) =>
            h.id === Number(event.action.args?.cure ?? event.action.args?.town),
        );
        if (
          hazard &&
          event.action.type === "cure" &&
          wagonKinds.has(hazard.kind)
        ) {
          const source = hazard.trailStep ?? step;
          const remedies = recoveredWagonRemedies.get(source) ?? [];
          const supply = event.action.args?.supply as Supply;
          if (supply in names)
            remedies.push({
              kind: hazard.kind,
              supply,
              player: previous.current,
            });
          recoveredWagonRemedies.set(source, remedies);
        }
        if (hazard)
          recoverResult(
            hazard.trailStep ?? step,
            next.hazards.some((h) => h.id === hazard.id)
              ? `${wagonKinds.has(hazard.kind) ? "The wagon" : previous.players[hazard.owner].name} still needs more supplies to resolve ${titles[hazard.kind].toLowerCase()}.`
              : wagonKinds.has(hazard.kind)
                ? "This wagon condition is no longer active."
                : `${previous.players[hazard.owner].name} no longer has ${titles[hazard.kind].toLowerCase()}.`,
          );
      }
      next.players.forEach((player, index) => {
        const current = game.state.players[index];
        if (
          !player.alive &&
          previous.players[index]?.alive &&
          current?.alive === false &&
          current.deathDay === undefined
        ) {
          current.deathDay = previous.turn - 1;
          current.deathDate = journeyDate(
            current.deathDay,
            game.state.startDate,
          );
        }
      });
      remember(next);
      previous = next;
    }
  }
  for (const [step, report] of Object.entries(reports)) {
    report.attempts ??= riverAttempts.get(Number(step));
    report.wagonRemedies ??= recoveredWagonRemedies.get(Number(step));
    if (report.lostSupplies?.length)
      report.lostSupplyOwners ??= recoveredLossOwners
        .get(Number(step))
        ?.slice(-report.lostSupplies.length);
    if (!report.results?.length)
      report.results = recoveredResults.get(Number(step));
    report.remedies = report.remedies?.map((remedy) => {
      const kind = typeof remedy === "string" ? remedy : remedy.kind;
      if (wagonKinds.has(kind)) return remedy;
      return {
        kind,
        owner:
          (typeof remedy === "string" ? undefined : remedy.owner) ??
          report.owner,
      };
    });
  }
}
function timelineConditionTitle(kind: Calamity, owner: number) {
  return conditionTitle(kind, owner)
    .replace(" suffered a snakebite", " suffers a snakebite")
    .replace(" died of ", " dies of ")
    .replace(" went hunting", " goes hunting")
    .replace("A thief stole from ", "A thief steals from ");
}
function timelineRemedy(kind: Calamity, owner?: number) {
  if (owner === undefined || wagonKinds.has(kind))
    return `${titles[kind]} is remedied.`;
  const name = game.state.players[owner].name;
  return kind === "starvation"
    ? `${name} has food again.`
    : kind === "cold"
      ? `${name} is warm again.`
      : `${name} recovers from ${kind === "arm" ? "a broken arm" : titles[kind]}.`;
}
function timelineDescription(
  report: TrailReport | undefined,
  card?: TrailCard,
) {
  if (card?.type === "river") {
    const result = report?.results?.at(-1);
    if (result && (report?.attempts || report?.scene)) return result;
    if (report?.scene === "success")
      return crossingSuccessText(report.attempts ?? 1);
    if (report?.attempts)
      return "The crossing fails. The wagon remains on this bank of the river.";
    return card.deadly
      ? "A raging river blocks the trail. The current threatens the travellers."
      : "A river blocks the trail. The wagon waits at the bank.";
  }
  const kind = report?.calamity;
  if (kind) {
    const wagon: Partial<Record<Calamity, string>> = {
      axle: "The axle breaks, bringing the wagon to a halt.",
      tongue: "The wagon tongue breaks. The wagon cannot move.",
      wheel: "A wheel breaks, bringing the wagon to a halt.",
      oxen: "The oxen die. The wagon has no team to pull it.",
      water: "The wagon’s water is unsafe to drink.",
      grass: "Grazing is scarce. There is not enough grass for the oxen.",
    };
    if (
      kind === "grass" &&
      report.results?.some(
        (text) =>
          text.includes("second inadequate-grass") ||
          text.includes("second grass"),
      )
    )
      return "There is still not enough grass. The oxen die, and the wagon comes to a halt.";
    if (wagon[kind]) return wagon[kind]!;
    if (kind === "hunting")
      return Object.values(report.gains).some((count) => count > 0)
        ? "The hunt brings fresh food back to the wagon."
        : "The hunt brings no food back to the wagon.";
    if (kind === "thief") return "A thief strikes the wagon’s supplies.";
    if (report.owner !== undefined) {
      const name = game.state.players[report.owner].name;
      const death = report.deaths.find((death) => death.name === name);
      if (death) return `${name} dies of ${death.cause.toLowerCase()}.`;
      return `${timelineConditionTitle(kind, report.owner)}.`;
    }
    return `${titles[kind]} strikes the wagon party.`;
  }
  if (card?.type === "town" || card?.type === "fort") {
    const count = Object.values(report?.gains ?? {}).reduce(
      (sum, n) => sum + n,
      0,
    );
    const location = label(card);
    return count
      ? `At ${location}, ${report?.gainOwner !== undefined ? game.state.players[report.gainOwner].name : "the party"} packs ${count} new suppl${count === 1 ? "y" : "ies"}.`
      : `The wagon reaches ${location}, a welcome stop along the trail.`;
  }
  return "The wagon follows a quiet stretch of trail.";
}
function trailReportTitle(report: TrailReport | undefined, c?: TrailCard) {
  if (report && (c?.type === "river" || report.card?.type === "river")) {
    if (
      report.attempts === 0 ||
      (!report.scene &&
        !report.attempts &&
        !/^River · (not crossed|drowning)\s*\(/.test(report.title))
    )
      return "River crossing";
    if (report.scene === "success") {
      const attempts = report.attempts ?? 1;
      return `River crossing (${attempts} ${attempts === 1 ? "attempt" : "attempts"})`;
    }
    if (
      ["attempt", "loss", "drowning"].includes(report.scene ?? "") ||
      /^River · (not crossed|drowning)\s*\(/.test(report.title)
    )
      return "River crossing failed";
  }
  if (report?.calamity && wagonKinds.has(report.calamity))
    return titles[report.calamity];
  if (report?.calamity && !wagonKinds.has(report.calamity)) {
    const owner =
      report.owner ??
      game.state.hazards.find(
        (h) => h.kind === report.calamity && h.trailStep === c?.journeyStep,
      )?.owner;
    if (owner !== undefined)
      return timelineConditionTitle(report.calamity, owner);
  }
  return report?.title ?? (c ? label(c) : "Earlier trail");
}
function trailCaption(c: TrailCard) {
  return trailReportTitle(reportFor(c), c);
}
function lostSupplyEmblem(kind: Supply) {
  return `<span class="lost-supply">${supplyEmblem(kind)}</span>`;
}
function timelineSupplyEmblem(
  kind: Supply,
  change: "gain" | "loss",
  quantity = 1,
) {
  return `<span class="timeline-supply-change ${change}">${supplyEmblem(kind)}<span class="supply-change-bubble" aria-hidden="true">${change === "gain" ? "+" : "−"}${quantity}</span></span>`;
}
function trailOutcomes(reports: TrailReport[]) {
  const losses = reports.reduce(
    (n, report) =>
      n + Math.max(0, report.losses - (report.lostSupplies?.length ?? 0)),
    0,
  );
  const items: {
    icon: string;
    description: string;
    owner?: number;
  }[] = reports
    .flatMap((report) => report.deaths)
    .map(({ name, cause }) => ({
      owner: game.state.players.findIndex((p) => p.name === name),
      icon: `<img src="${art.tombstoneIcon}" alt="">`,
      description: `${name} ${cause.toLowerCase().startsWith("drowned") ? cause.toLowerCase().replace("drowned", "drowns") : `dies of ${cause.toLowerCase()}`}${game.state.players.find((p) => p.name === name)?.deathDate ? ` on ${calendarDate(game.state.players.find((p) => p.name === name)!.deathDate!)} (${game.state.players.find((p) => p.name === name)!.deathDay} days on the trail)` : ""}`,
    }));
  reports
    .flatMap((report) =>
      (report.remedies ?? [])
        .filter(
          (remedy) =>
            !report.wagonRemedies?.some(
              (spent) =>
                spent.kind ===
                (typeof remedy === "string" ? remedy : remedy.kind),
            ),
        )
        .map((remedy) =>
          typeof remedy === "string"
            ? { kind: remedy, owner: report.owner }
            : remedy,
        ),
    )
    .forEach(({ kind, owner }) =>
      items.push({
        owner,
        icon: `<img class="outcome-image" src="${calamityArt[kind]}" alt="">`,
        description: timelineRemedy(kind, owner),
      }),
    );
  reports
    .flatMap((report) => report.wagonRemedies ?? [])
    .forEach(({ kind, supply, player }) =>
      items.push({
        owner: player,
        icon: timelineSupplyEmblem(supply, "loss"),
        description: `${game.state.players[player].name} uses ${names[supply].toLowerCase()} to remedy ${titles[kind].toLowerCase()}.`,
      }),
    );
  reports
    .flatMap((report) =>
      (report.lostSupplies ?? []).map((kind, index) => ({
        kind,
        owner: report.lostSupplyOwners?.[index] ?? report.owner,
      })),
    )
    .forEach(({ kind, owner }) =>
      items.push({
        owner,
        icon: timelineSupplyEmblem(kind, "loss"),
        description:
          owner !== undefined
            ? `${game.state.players[owner].name} loses ${names[kind].toLowerCase()}`
            : `${names[kind]} lost`,
      }),
    );
  if (losses)
    items.push({
      icon: `<img class="outcome-image" src="${riverArt.loss}" alt="">`,
      description: `${losses} ${losses === 1 ? "supply" : "supplies"} lost`,
    });
  reports.forEach((report) =>
    (Object.entries(report.gains) as [Supply, number][]).forEach(
      ([kind, count]) =>
        items.push({
          owner: report.gainOwner ?? report.owner,
          icon: timelineSupplyEmblem(kind, "gain", count),
          description: `${report.gainOwner !== undefined ? game.state.players[report.gainOwner].name : "The party"} gains ${count} ${names[kind].toLowerCase()}`,
        }),
    ),
  );
  return items.length
    ? `<div class="trail-outcomes" role="group" aria-label="Trail outcomes" data-outcome-descriptions="${escape(JSON.stringify(items.map((item) => item.description)))}">${items.map((item) => `<button type="button" class="trail-outcome" ${item.owner !== undefined && item.owner >= 0 ? `data-outcome-owner="${item.owner}"` : ""} aria-label="${escape(item.description)}"><span class="outcome-symbol">${item.icon}</span></button>`).join("")}${
        items.length > 3
          ? `<button type="button" class="trail-outcome trail-outcome-more" aria-label="${escape(
              items
                .slice(3)
                .map((item) => item.description)
                .join(" · "),
            )}">+${items.length - 3}</button>`
          : ""
      }</div>`
    : "";
}
const outcomeTooltip = document.createElement("div");
outcomeTooltip.className = "trail-outcome-tooltip";
outcomeTooltip.id = "trail-outcome-tooltip";
outcomeTooltip.setAttribute("role", "tooltip");
outcomeTooltip.hidden = true;
document.body.append(outcomeTooltip);
let tooltipOwner: HTMLElement | null = null;
let tooltipPinned = false;
function hideOutcomeTooltip() {
  tooltipOwner?.removeAttribute("aria-describedby");
  tooltipOwner = null;
  tooltipPinned = false;
  gsap.killTweensOf(outcomeTooltip);
  outcomeTooltip.hidden = true;
}
function playerPreviewContent(row: HTMLElement) {
  if (row.hasAttribute("data-trail-finish")) {
    const s = game.state;
    const remaining = Math.max(0, 50 - s.count);
    const text =
      s.status === "won"
        ? `The wagon reaches Oregon on ${calendarDate(journeyDate(s.turn - 1, s.startDate))}, after ${s.turn - 1} days on the trail.`
        : s.status === "lost"
          ? `The journey ends ${remaining} trail card${remaining === 1 ? "" : "s"} short of Oregon. The valley waits beyond the trail.`
          : `${remaining} trail card${remaining === 1 ? "" : "s"} to go. Beyond the last bend, Oregon City and the Willamette Valley await.`;
    return `<img class="trail-summary-art" src="${art.victory}" alt="A welcoming Oregon homestead"><strong class="tooltip-title">${s.status === "won" ? "Arrived in Oregon" : "Oregon · Willamette Valley"}</strong><p>${escape(text)}</p>`;
  }
  if (row.hasAttribute("data-trail-summary")) {
    const s = game.state;
    const days = s.turn - 1;
    const conditions = s.hazards.filter((h) => wagonKinds.has(h.kind));
    const scene = journeyPreviewArtwork(s);
    return `<img class="trail-summary-art" src="${scene.src}" alt="${escape(scene.alt)}"><strong class="tooltip-title">The trail so far</strong><p>${calendarDate(journeyDate(days, s.startDate))}<br>${days} day${days === 1 ? "" : "s"} on the trail</p><div class="trail-summary-progress" aria-hidden="true"><span style="width:${s.count * 2}%"></span></div><p>${s.count} of 50 trail cards · ${Math.max(0, 50 - s.count)} to Oregon</p>${s.phase === "river" ? `<p>River crossing pending.</p>` : s.phase === "repair" && s.pending ? `<p>${escape(titles[s.pending])}: repair pending.</p>` : ""}${conditions.map((h) => `<div class="trail-summary-condition"><img src="${calamityArt[h.kind]}" alt=""><span>${escape(conditionDescription(h.kind, h.owner))}</span></div>`).join("")}`;
  }
  if (row.hasAttribute("data-wagon-preview")) {
    const hazard = game.state.hazards.find(
      (h) => h.id === Number(row.dataset.hazardId),
    );
    if (!hazard)
      return "<strong>This wagon condition has been resolved.</strong>";
    const requirements = (Object.entries(hazard.needs) as [Supply, number][])
      .filter(([, count]) => count > 0)
      .map(
        ([supply, count]) =>
          `${count} ${names[supply].toLowerCase()} card${count === 1 ? "" : "s"}`,
      )
      .join(" and ");
    return `<strong>${titles[hazard.kind]}</strong><div class="tooltip-condition"><img src="${calamityArt[hazard.kind]}" alt=""><p>${escape(conditionDescription(hazard.kind, hazard.owner))}</p><p>${requirements ? `Give ${escape(requirements)} from the current player’s turn to remedy this shared wagon condition.` : "Visit a town and choose to remove this wagon condition."}</p>${hazard.rounds !== null ? `<p><strong>Deadline: ${hazard.rounds} round${hazard.rounds === 1 ? "" : "s"} remaining.</strong></p>` : ""}</div>`;
  }
  const kind = row.dataset.playerPreview;
  if (!kind) return;
  const index = Number(row.dataset.playerIndex);
  const player = game.state.players[index];
  if (!player) return;
  if (kind === "summary") {
    const conditions = game.state.hazards.filter(
      (h) => h.owner === index && !wagonKinds.has(h.kind),
    );
    const supplies = (Object.keys(names) as Supply[]).flatMap((supply) => {
      const count = player.supplies.filter((k) => k === supply).length;
      return count ? [supplyEmblem(supply, count, true)] : [];
    });
    return `<strong class="tooltip-title">${portraitImage(player.portrait ?? index % 6)}<span>${escape(player.name)}${index === game.state.current && player.alive ? " · current turn" : ""}</span></strong>${player.birthday ? `<p>Born ${calendarDate(player.birthday)}</p>` : ""}${
      !player.alive
        ? `<div class="player-summary-death"><img src="${art.tombstoneIcon}" alt=""><p>Died ${player.deathDate ? calendarDate(player.deathDate) : "on the trail"}${player.deathCause ? `: ${escape(player.deathCause)}` : ""}.${player.deathDay !== undefined ? ` ${player.deathDay} days into the journey.` : ""}<br><em>${escape(player.epitaph)}</em></p></div>`
        : `<section class="player-summary-section"><h4>Trail cards · ${player.hand.length}</h4>${player.hand.length ? `<div class="player-hand-preview">${player.hand.map((c) => `<div>${card(c)}<span>${escape(label(c))}</span></div>`).join("")}</div>` : `<p>No trail cards in hand.</p>`}</section><section class="player-summary-section"><h4>Supplies · ${player.supplies.length}</h4><div class="player-supply-preview">${supplies.join("") || "No supplies left."}</div></section><section class="player-summary-section"><h4>Health</h4>${
            conditions.length
              ? conditions
                  .map(
                    (h) =>
                      `<div class="trail-summary-condition severity-${hazardSeverity(h)}"><img src="${calamityArt[h.kind]}" alt=""><div><strong>${titles[h.kind]}</strong><span class="condition-severity">${severityLabels[hazardSeverity(h)]}</span><p>${escape(remedyDescription(h))}</p>${conditionWarning(
                        h,
                      )
                        .map((n) => `<p>${escape(n.text)}</p>`)
                        .join("")}</div></div>`,
                  )
                  .join("")
              : `<p>In good health.</p>`
          }</section>`
    }`;
  }
  const condition =
    kind === "condition"
      ? game.state.hazards.find((h) => h.id === Number(row.dataset.hazardId))
      : undefined;
  const title =
    kind === "condition"
      ? condition
        ? conditionTitle(condition.kind, index)
        : `${player.name}’s condition has been resolved`
      : `${player.name}’s ${row.dataset.inventoryKind ? (kind === "trail" ? `${inventoryTrailNames[row.dataset.inventoryKind as TrailCard["type"]].toLowerCase()} cards` : names[row.dataset.inventoryKind as Supply].toLowerCase()) : kind === "trail" ? "trail cards" : "supplies"}`;
  const heading = `<strong class="tooltip-title">${portraitImage(player.portrait ?? index % 6)}<span>${escape(title)}</span></strong>`;
  if (kind === "trail") {
    const hand = player.hand.filter(
      (card) =>
        !row.dataset.inventoryKind || card.type === row.dataset.inventoryKind,
    );
    return `${heading}${hand.length ? `<div class="player-hand-preview">${hand.map((c) => `<div>${card(c)}<span>${escape(label(c))}</span></div>`).join("")}</div>` : '<p class="preview-empty">No trail cards in hand.</p>'}`;
  }
  if (kind === "supplies") {
    const quantities = new Map<Supply, number>();
    player.supplies
      .filter(
        (supply) =>
          !row.dataset.inventoryKind || supply === row.dataset.inventoryKind,
      )
      .forEach((supply) =>
        quantities.set(supply, (quantities.get(supply) ?? 0) + 1),
      );
    return `${heading}${quantities.size ? `<div class="player-supply-preview">${Array.from(quantities, ([supply, count]) => supplyEmblem(supply, count, true)).join("")}</div>` : '<p class="preview-empty">No supplies left.</p>'}`;
  }
  const hazard = game.state.hazards.find(
    (h) => h.id === Number(row.dataset.hazardId),
  );
  return hazard
    ? `${heading}<div class="tooltip-condition"><img src="${calamityArt[hazard.kind]}" alt=""><p>${escape(remedyDescription(hazard))}</p></div>`
    : heading;
}
function showOutcomeTooltip(row: HTMLElement) {
  if (
    document.body.classList.contains("timeline-compact") &&
    row.matches(".trail-outcome, .trail-afflicted")
  )
    row = row.closest<HTMLElement>(".trail-piece") ?? row;
  if (tooltipOwner !== row) tooltipPinned = false;
  const isIcon =
    row.classList.contains("trail-outcome") ||
    row.classList.contains("trail-afflicted");
  const isStart = row.classList.contains("trail-start");
  const isTile = isStart || row.classList.contains("trail-piece");
  const outcomes = isTile
    ? row.querySelector<HTMLElement>(".trail-outcomes")
    : row;
  const descriptions = isIcon
    ? [row.getAttribute("aria-label") ?? ""]
    : (JSON.parse(outcomes?.dataset.outcomeDescriptions ?? "[]") as string[]);
  const results = isTile
    ? (JSON.parse(row.dataset.trailResults ?? "[]") as string[]).slice(-1)
    : [];
  const title = isStart
    ? "Independence, Missouri"
    : (row.closest(".trail-piece")?.querySelector("small")?.textContent ??
      "Trail outcomes");
  tooltipOwner?.removeAttribute("aria-describedby");
  tooltipOwner = row;
  row.setAttribute("aria-describedby", outcomeTooltip.id);
  const icons = isIcon
    ? [row]
    : Array.from(
        outcomes?.querySelectorAll<HTMLElement>(".trail-outcome") ?? [],
      );
  const actor =
    row.dataset.trailPlayer !== undefined
      ? game.state.players[Number(row.dataset.trailPlayer)]
      : undefined;
  const turnContext =
    isTile && !isStart
      ? `<div class="timeline-turn-context">${actor ? `${portraitImage(actor.portrait ?? Number(row.dataset.trailPlayer) % 6)}<span>${escape(actor.name)}’s turn</span>` : "<span>Turn player not recorded</span>"}</div>`
      : "";
  outcomeTooltip.innerHTML =
    (row.dataset.headerTooltip
      ? `<span>${escape(row.dataset.headerTooltip)}</span>`
      : undefined) ??
    playerPreviewContent(row) ??
    `${isIcon ? "" : `${turnContext}<strong class="tooltip-title"><span>${escape(title)}</span></strong>`}${results.length ? `<div class="tooltip-results">${results.map((text) => `<p>${escape(text)}</p>`).join("")}</div>` : ""}<ul>${descriptions
      .map((text, index) => {
        const icon = icons[index];
        const owner = icon?.dataset.outcomeOwner;
        const player =
          owner !== undefined ? game.state.players[Number(owner)] : undefined;
        return `<li><span class="tooltip-outcome-icon" aria-hidden="true">${icon?.querySelector(".outcome-symbol")?.innerHTML ?? icon?.innerHTML ?? ""}</span>${player ? portraitImage(player.portrait ?? Number(owner) % 6) : ""}<span class="tooltip-outcome-text">${escape(text)}</span></li>`;
      })
      .join("")}</ul>`;
  gsap.killTweensOf(outcomeTooltip);
  outcomeTooltip.hidden = false;
  const rect = row.getBoundingClientRect();
  const width = Math.min(
    row.dataset.playerPreview === "summary" ? 360 : 280,
    innerWidth - 24,
  );
  outcomeTooltip.style.width = `${width}px`;
  outcomeTooltip.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
  const height = outcomeTooltip.getBoundingClientRect().height;
  outcomeTooltip.style.top = `${Math.max(8, rect.bottom + height + 8 > innerHeight ? rect.top - height - 8 : rect.bottom + 8)}px`;
  gsap.fromTo(
    outcomeTooltip,
    { autoAlpha: 0, y: 4 },
    {
      autoAlpha: 1,
      y: 0,
      duration: reducedMotion.matches ? 0 : 0.16,
      clearProps: "transform",
    },
  );
}
app.addEventListener("mouseover", (event) => {
  if (tooltipPinned) return;
  const row = (event.target as Element).closest<HTMLElement>(
    ".trail-outcome, .trail-afflicted, .trail-piece, .trail-start, [data-player-preview], [data-wagon-preview], [data-trail-summary], [data-trail-finish], [data-header-tooltip]",
  );
  if (row && row !== tooltipOwner) showOutcomeTooltip(row);
});
app.addEventListener("mouseout", (event) => {
  const next = event.relatedTarget as Node | null;
  if (
    !tooltipPinned &&
    tooltipOwner &&
    !tooltipOwner.contains(next) &&
    !outcomeTooltip.contains(next)
  )
    hideOutcomeTooltip();
});
outcomeTooltip.addEventListener("mouseleave", () => {
  if (!tooltipPinned) hideOutcomeTooltip();
});
app.addEventListener("focusin", (event) => {
  const row = (event.target as Element).closest<HTMLElement>(
    ".trail-outcome, .trail-afflicted, .trail-piece, .trail-start, [data-player-preview], [data-wagon-preview], [data-trail-summary], [data-trail-finish], [data-header-tooltip]",
  );
  if (row) showOutcomeTooltip(row);
  else hideOutcomeTooltip();
});
app.addEventListener("click", (event) => {
  const row = (event.target as Element).closest<HTMLElement>(
    ".trail-outcome, .trail-afflicted, .trail-piece, .trail-start, [data-player-preview], [data-wagon-preview], [data-trail-summary], [data-trail-finish], [data-header-tooltip]",
  );
  if (!row) {
    hideOutcomeTooltip();
    return;
  }
  if (row.hasAttribute("data-header-tooltip")) {
    hideOutcomeTooltip();
    return;
  }
  event.stopImmediatePropagation();
  if (tooltipPinned && tooltipOwner === row) hideOutcomeTooltip();
  else {
    showOutcomeTooltip(row);
    tooltipPinned = true;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideOutcomeTooltip();
});
document.addEventListener("pointerdown", (event) => {
  const target = event.target as Element;
  if (
    !target.closest(
      ".trail-outcome, .trail-afflicted, .trail-piece, .trail-start, [data-player-preview], [data-wagon-preview], [data-trail-summary], [data-trail-finish], [data-header-tooltip]",
    ) &&
    !outcomeTooltip.contains(target)
  )
    hideOutcomeTooltip();
});
window.addEventListener("resize", hideOutcomeTooltip);
window.addEventListener("scroll", hideOutcomeTooltip, true);
function recordTrailResult(
  d: DOMStringMap,
  before: Journey,
  played?: TrailCard,
) {
  const s = game.state;
  const automaticLoss =
    s.lastSupplyLoss?.sequence !== before.lastSupplyLoss?.sequence
      ? s.lastSupplyLoss
      : undefined;
  if (played) {
    played.journeyStep = s.count;
    // Seed visible older cards before storing the new visit; snapshots survive deck recycling.
    const reports = (s.trailReports ??= {});
    before.run.forEach((c, offset) => {
      const step =
        c.journeyStep ?? before.count - before.run.length + offset + 1;
      const report = (reports[step] ??= {
        title: label(c),
        losses: 0,
        gains: {},
        deaths: [],
      });
      report.card ??= { ...c, journeyStep: step };
    });
  }
  const previousTop = before.run.at(-1);
  if (!played && previousTop && !previousTop.journeyStep && before.count) {
    const currentTop = s.run.at(-1);
    // A resumed journey may predate trail reports; attach new outcomes to its exposed card.
    const actual = s.run.find((c) => c.id === previousTop.id) ?? currentTop;
    if (actual) actual.journeyStep = before.count;
    previousTop.journeyStep = before.count;
  }
  const remedy = before.hazards.find((h) => h.id === Number(d.cure ?? d.town));
  const step =
    remedy?.trailStep ?? played?.journeyStep ?? previousTop?.journeyStep;
  if (!step) return;
  const reports = (s.trailReports ??= {});
  const report = (reports[step] ??= {
    title: label(played ?? previousTop!),
    losses: 0,
    gains: {},
    deaths: [],
  });
  report.card ??= structuredClone(played ?? previousTop!);
  if (played) report.playedBy = before.current;
  if (played?.type === "river") {
    report.title = "River crossing";
    report.attempts = 0;
  }
  if (played?.type === "calamity" && revealedCalamity) {
    report.owner = wagonKinds.has(revealedCalamity)
      ? undefined
      : before.current;
    report.title = conditionTitle(revealedCalamity, before.current);
    report.calamity = revealedCalamity;
    s.hazards
      .filter((h) => !before.hazards.some((old) => old.id === h.id))
      .forEach((h) => (h.trailStep = step));
    if (
      revealedCalamity === "hunting" &&
      s.players[before.current].supplies.filter((k) => k === "food").length >
        before.players[before.current].supplies.filter((k) => k === "food")
          .length
    )
      report.gains.food = (report.gains.food ?? 0) + 1;
  }
  const riverRoll =
    d.action === "roll" ||
    (played?.type === "river" && pendingRolls.length > 0);
  const repairRoll =
    d.action === "repair" ||
    (played?.type === "calamity" && pendingRolls.length > 0);
  const repairKind = before.pending ?? revealedCalamity;
  if (riverRoll) {
    const n = pendingRolls.at(-1)!;
    report.attempts = (report.attempts ?? 0) + 1;
    report.title =
      n % 2 === 0
        ? `River crossing (${report.attempts} ${report.attempts === 1 ? "attempt" : "attempts"})`
        : "River crossing failed";
    report.scene =
      n % 2 === 0
        ? "success"
        : n === 1
          ? (played ?? previousTop)?.deadly
            ? "drowning"
            : "loss"
          : "attempt";
  }
  if (repairRoll) {
    const n = pendingRolls.at(-1)!;
    report.title = titles[repairKind!];
    report.calamity = repairKind ?? undefined;
    if (n >= 4) {
      report.scene = "restored";
    }
    s.hazards
      .filter((h) => !before.hazards.some((old) => old.id === h.id))
      .forEach((h) => (h.trailStep = step));
  }
  if (automaticLoss) {
    report.losses++;
    (report.lostSupplies ??= []).push(automaticLoss.supply);
    (report.lostSupplyOwners ??= []).push(automaticLoss.owner);
  } else if (d.discard !== undefined) {
    report.losses++;
    const lost = before.players[Number(d.owner)].supplies[Number(d.discard)];
    (report.lostSupplies ??= []).push(lost);
    (report.lostSupplyOwners ??= []).push(Number(d.owner));
  }
  if (d.take) {
    report.gainOwner = before.current;
    report.gains[d.take as Supply] = (report.gains[d.take as Supply] ?? 0) + 1;
  }
  if (remedy && d.cure && d.supply && wagonKinds.has(remedy.kind))
    (report.wagonRemedies ??= []).push({
      kind: remedy.kind,
      supply: d.supply as Supply,
      player: before.current,
    });
  if (remedy && report.calamity === remedy.kind && !wagonKinds.has(remedy.kind))
    report.owner ??= remedy.owner;
  if (remedy && !s.hazards.some((h) => h.id === remedy.id))
    (report.remedies ??= []).push({
      kind: remedy.kind,
      owner: wagonKinds.has(remedy.kind) ? undefined : remedy.owner,
    });
  s.players.forEach((player, i) => {
    if (before.players[i].alive && !player.alive) {
      const cause = player.deathCause ?? "a calamity";
      const source =
        !played && d.action !== "roll"
          ? before.hazards.find(
              (h) =>
                h.owner === i &&
                cause.toLowerCase().includes(titles[h.kind].toLowerCase()),
            )?.trailStep
          : undefined;
      const target = source && reports[source] ? reports[source] : report;
      target.deaths.push({ name: player.name, cause });
    }
  });
  const results = (report.results ??= []);
  if (riverRoll || repairRoll) {
    results.push(
      rollOutcomeText(pendingRolls.at(-1)!, {
        phase: repairRoll ? "repair" : "river",
        traveller: before.players[before.current].name,
        deadly: !!(played ?? previousTop)?.deadly,
        calamity: repairKind ? titles[repairKind] : "Wagon repair",
        calamityKind: repairKind ?? undefined,
        loss: automaticLoss,
      }),
    );
  } else if (played?.type === "calamity") {
    results.push(
      calamityResultText(
        revealedCalamity,
        s.note,
        before.current,
        automaticLoss,
      ),
    );
  } else if (d.discard !== undefined || d.take || d.cure || d.town) {
    const result = actionResult(
      d,
      before,
      { type: "timeline", args: { ...d } },
      played,
    );
    if (result) results.push(result.text);
  }
}
function trailPlayerBadge(report?: TrailReport) {
  if (
    !report?.calamity ||
    wagonKinds.has(report.calamity) ||
    report.owner === undefined
  )
    return "";
  const player = game.state.players[report.owner];
  if (!player) return "";
  const text = timelineConditionTitle(report.calamity, report.owner);
  return `<button type="button" class="trail-afflicted" aria-label="${escape(text)}">${portraitImage(player.portrait ?? report.owner % 6)}</button>`;
}
function trail() {
  const s = game.state;
  const top = game.top;
  const activeStep = top?.journeyStep ?? s.count;
  const entries = Array.from({ length: s.count }, (_, i) => {
    const step = i + 1;
    const report = s.trailReports?.[step];
    const fallback = s.run.find(
      (c, offset) =>
        (c.journeyStep ?? s.count - s.run.length + offset + 1) === step,
    );
    const c = report?.card ?? fallback;
    return `<div class="trail-piece ${step === activeStep && s.status === "travel" ? "active-connection" : ""}" data-ui-key="trail-step-${step}" tabindex="0" data-trail-results="${escape(JSON.stringify([timelineDescription(report, c)]))}" ${report?.playedBy !== undefined ? `data-trail-player="${report.playedBy}"` : ""} aria-label="Trail card ${step}${step === activeStep ? ", active connection" : ""}">${c ? card(c, reportArtwork(report, c), ["town", "fort"].includes(c.type) ? settlementStubs(timelineCardAt(step - 1), timelineCardAt(step + 1), step === 1) : "") : `<div class="earlier-trail"><img src="${art.trail}" alt="Earlier stretch of trail"></div>`}${trailPlayerBadge(report)}<small>${escape(trailReportTitle(report, c))}</small>${trailOutcomes(report ? [report] : [])}</div>`;
  }).join("");
  return `<section class="trail-area" aria-label="Journey trail"><div class="section-line"><h2>The trail so far</h2><button type="button" class="trail-compact-date" data-trail-summary aria-label="Trail summary for ${calendarDate(journeyDate(s.turn - 1, s.startDate))}"><time datetime="${journeyDate(s.turn - 1, s.startDate)}">${calendarDate(journeyDate(s.turn - 1, s.startDate))}</time></button><span class="journey-calendar">${calendarDate(journeyDate(s.turn - 1, s.startDate))} · ${s.turn - 1} day${s.turn === 2 ? "" : "s"} on the trail</span><button class="trail-return" data-action="trail-end" aria-label="Back to end of trail" title="Back to end of trail" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h12m-5-5 5 5-5 5M20 5v14"/></svg></button></div><div class="map-track" data-ui-static role="progressbar" aria-label="Journey progress" aria-valuemin="0" aria-valuemax="50" aria-valuenow="${s.count}"><span style="width:${s.count * 2}%"><button type="button" class="progress-wagon" data-trail-summary aria-label="Show trail summary"><img src="${art.progressWagon}" alt=""></button></span></div><div class="trail-body"><div class="trail-route"><div class="trail-strip"><div class="trail-start" data-ui-key="trail-start" tabindex="0" data-trail-results="${escape(JSON.stringify(["Your journey begins in Independence, Missouri. The wagon is packed, the kettle is rattling, and Oregon waits at the far end of fifty trail cards."]))}" aria-label="Journey starts in Independence, Missouri"><div class="start-art"><img src="${art.independence}" alt="A wagon departing the frontier town of Independence"><span class="start-badge">START</span></div><strong>Independence</strong><small>Missouri</small></div>${entries}<div class="trail-marker ${s.status === "won" ? "arrived" : ""}" data-ui-key="trail-finish" data-trail-finish tabindex="0" style="--finish-progress:${s.count / 50};--finish-dots:${Math.ceil((50 - s.count) / 5)}" aria-label="${s.status === "won" ? "Arrived in Oregon" : "Destination: Oregon"}"><div class="finish-destination"><div class="finish-art"><img src="${art.landscape}" alt="Quiet hills and a wagon at the journey’s destination"><span class="finish-badge"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 14V2m0 0h9l-2 3 2 3H3"/></svg>${s.status === "won" ? "ARRIVED" : "FINISH"}</span></div><strong>Oregon</strong><small>Willamette Valley</small></div></div></div></div>${wagonState()}</div><button type="button" class="top-expand-tab" data-action="expand-top" aria-label="Expand top section" title="Expand top section"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></section>`;
}
const outcomeNames: Record<Outcome, string> = {
  won: "Reached Oregon",
  lost: "Journey lost",
  abandoned: "Set aside",
  travel: "Underway",
};
function headerIcon(
  action: string,
  text: string,
  paths: string,
  selected = false,
) {
  return `<button class="header-icon" data-action="${action}" data-header-tooltip="${escape(text)}" aria-label="${escape(text)}" ${selected ? 'aria-pressed="true"' : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg></button>`;
}
function navigationIcons() {
  return `${headerIcon("journeys", "Choose a journey", '<path d="M3 7V4h6l2 3h10v13H3Z"/><path d="M7 12h10M7 16h7"/>', showJourneys)}${headerIcon("stats", "Journey statistics", '<path d="M4 20h17M7 16v-5M12 16V5M17 16V8"/>', showStatistics)}${headerIcon("new", "New journey", '<path d="M12 5v14M5 12h14"/>')}${headerIcon("clear-storage", "Clear local storage", '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>')}`;
}
function journeyProgressRing(value: number, total: number, label: string) {
  const progress =
    total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return `<span class="journey-progress-ring ${label === "Alive" ? "is-survival" : ""}"><svg viewBox="0 0 48 48" role="img" aria-label="${value} of ${total} ${label.toLowerCase()}"><title>${value} / ${total} ${label.toLowerCase()}</title><circle class="journey-ring-track" cx="24" cy="24" r="20"/><circle class="journey-ring-fill" cx="24" cy="24" r="20" pathLength="100" stroke-dasharray="${progress} 100" transform="rotate(-90 24 24)"/><text x="24" y="24" text-anchor="middle" dominant-baseline="central">${value}/${total}</text></svg><span>${label}</span></span>`;
}
function simulationScreen() {
  const s = game.state;
  const finished = s.status !== "travel";
  const won = s.status === "won";
  const living = s.players.filter((p) => p.alive).length;
  const title = simulationRunning
    ? "The oxen are doing the thinking."
    : finished
      ? won
        ? "Oregon. Against the odds."
        : "Well. The prairie won."
      : "The wagon is taking a breather.";
  return `<header><div><p class="eyebrow">The unattended expedition</p><h1>Journey <i>simulation</i></h1></div><div class="header-actions">${navigationIcons()}</div></header><main class="simulation-screen decision" data-simulation-status="${simulationRunning ? "running" : finished ? "complete" : "stopped"}"><img class="simulation-art" src="${finished ? (won ? art.victory : art.defeat) : art.landscape}" alt="${finished ? (won ? "The wagon has reached Oregon" : "The trail has fallen silent") : "A wagon setting out across the prairie"}"><div class="simulation-copy"><span class="journey-mode-tag">Simulated journey</span><h2 tabindex="-1">${title}</h2><p class="simulation-message" role="status">${escape(simulationRunning ? s.note : simulationError || s.note)}</p><div class="simulation-progress" role="progressbar" aria-label="Journey progress" aria-valuenow="${s.count}" aria-valuemin="0" aria-valuemax="50"><span style="width:${s.count * 2}%"></span></div><div class="simulation-totals"><span><strong>${s.count}/50</strong>trail cards</span><span><strong>${Math.max(0, s.turn - 1)}</strong>days on the trail</span><span><strong>${living}/${s.players.length}</strong>travellers alive</span></div>${!simulationRunning ? `<div class="simulation-party">${s.players.map((p, i) => `<div>${p.alive ? portraitImage(p.portrait ?? i) : `<img src="${art.tombstoneIcon}" alt="Gravestone">`}<span><strong>${escape(p.name)}</strong><small>${p.alive ? "Still standing" : escape(p.deathCause ?? "Lost on the trail")}</small></span></div>`).join("")}</div>${finished ? renderJourneyMapPreview(s) : `<button data-action="simulation-resume">Continue simulation →</button>`}<div class="simulation-actions">${button("journeys", "Your journeys")}${button("new", "Another journey →")}</div>` : `<small class="simulation-running-note">${s.simulationActions ?? 0} decisions · No steering required</small>`}</div></main>${siteCredit()}`;
}
async function startSimulation() {
  if (!setup || party.some((p) => !p.name.trim())) {
    app
      .querySelector<HTMLInputElement>(".player-name:invalid")
      ?.reportValidity();
    return;
  }
  const startDate = nextJourneyStartDate(
    history
      ? history.archive.games.map((record) => record.initial.startDate)
      : game.state.started
        ? [game.state.startDate]
        : [],
  );
  const simulated = new TrailGame(
    Math.random,
    undefined,
    (n) => pendingRolls.push(n),
    (kind) => {
      revealedCalamity = kind;
    },
  );
  if (
    !simulated.reset(
      party.map((p) => p.name),
      firstPlayer,
      party.map((p) => p.portrait),
    )
  )
    return;
  game = simulated;
  game.state.mode = "simulation";
  game.state.simulationActions = 0;
  game.state.startDate = startDate;
  game.state.players.forEach((p) => (p.controller = "computer"));
  pendingRolls.length = 0;
  revealedCalamity = undefined;
  setup = false;
  confirming = false;
  statisticsData = undefined;
  persist({ type: "start" });
  await runSimulation();
}
async function runSimulation() {
  if (
    simulationRunning ||
    game.state.mode !== "simulation" ||
    game.state.status !== "travel"
  )
    return;
  const runningGame = game;
  simulationRunning = true;
  simulationError = "";
  clearComputerCountdown();
  setBusy(true);
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
  let actions = 0;
  try {
    // Small batches paint progress and keep the browser responsive without turn UI.
    while (
      runningGame === game &&
      game.state.status === "travel" &&
      actions < 5000
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      for (
        let i = 0;
        i < 6 && game.state.status === "travel" && actions < 5000;
        i++
      ) {
        pendingRolls.length = 0;
        revealedCalamity = undefined;
        const step = advanceSimulation(game);
        if (!step) throw new Error("The simulation has no next action.");
        recordTrailResult(
          (step.action.args as DOMStringMap) ?? {},
          step.before,
          step.played,
        );
        persist(step.action);
        pendingRolls.length = 0;
        actions++;
      }
      if (game.state.status === "travel") render();
    }
    if (game.state.status === "travel")
      simulationError =
        "The safety limit paused this simulation. You can continue from here.";
  } catch (error) {
    simulationError =
      error instanceof Error
        ? error.message
        : "The simulation paused unexpectedly.";
  } finally {
    pendingRolls.length = 0;
    revealedCalamity = undefined;
    simulationRunning = false;
    statisticsData = undefined;
    render();
    if (!reducedMotion.matches)
      await playTimeline((tl) =>
        tl.fromTo(
          app.querySelectorAll(
            ".simulation-copy > h2, .simulation-party, .simulation-copy > .journey-map-preview",
          ),
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.05,
            clearProps: "opacity,transform",
          },
        ),
      );
    setBusy(false);
    app
      .querySelector<HTMLElement>(".simulation-copy h2")
      ?.focus({ preventScroll: true });
  }
}
function siteCredit() {
  return `<div class="site-credit">© ${new Date().getFullYear()} · Made with ❤️ and 🍌 by <a href="https://www.metamodernmonkey.com/" target="_blank" rel="noopener noreferrer">Meta Modern Monkey</a></div>`;
}
function welcomeScreen() {
  return `<section class="decision welcome-screen" aria-labelledby="welcome-heading"><div class="welcome-art"><img src="${art.landscape}" alt="A covered wagon waiting beneath wide prairie skies"><span class="welcome-ticket"><span>Westward—to Oregon or bust</span><small>Probably die</small></span></div><div class="welcome-copy"><p class="eyebrow">Independence, Missouri · Spring 1847</p><h2 id="welcome-heading">This wagon won’t<br>pack itself.</h2><p>The road is long. The company is yours.<br>The oxen have made no promises.</p>${button("new", "Gather your travellers →")}<small>Play solo or local co-op · 2–6 travellers, one rather hopeful wagon</small></div></section>`;
}
function journeyModeFilter(
  scope: "journeys" | "statistics",
  selected: JourneyModeFilter,
) {
  if (!loadStatisticsData().games.some((game) => game.simulated)) return "";
  return `<div class="journey-mode-filters" role="group" aria-label="${scope === "journeys" ? "Saved journey" : "Statistics"} game types">${(["all", "played", "simulated"] as const).map((mode) => `<button type="button" data-journey-mode="${mode}" data-mode-scope="${scope}" aria-pressed="${selected === mode}">${mode === "all" ? "All" : mode === "played" ? "Played" : "Simulated"}</button>`).join("")}</div>`;
}
function journeysScreen() {
  if (!history?.archive.games.length)
    return `<header><div><p class="eyebrow">A cooperative westward wander · 2–6 players</p><h1>Oregon Trail <i>Cards</i></h1></div></header><main class="journey-browser">${welcomeScreen()}</main>`;
  const data = loadStatisticsData(journeysMode);
  const records = data.games
    .map((record) => ({
      ...record,
      number:
        (history?.archive.games.findIndex((game) => game.id === record.id) ??
          -1) + 1,
    }))
    .reverse();
  return `<header><div><p class="eyebrow">Pick up a thread of trail</p><h1>Your <i>journeys</i></h1></div><div class="header-actions">${button("stats-back", setup ? "← Back to wagon" : "← Back to journey")}${navigationIcons()}</div></header><main class="journey-browser"><div class="journey-browser-heading"><h2 id="journey-browser-heading" tabindex="-1">${records.length} saved journey${records.length === 1 ? "" : "s"}</h2><p>Open a journey to continue its current turn or revisit its final result.</p></div>${journeyModeFilter("journeys", journeysMode)}${journeyOpenError ? `<p class="journey-open-error" role="alert">${escape(journeyOpenError)}</p>` : ""}${
    records.length
      ? `<div class="journey-list">${records
          .map((record) => {
            const raw = history?.archive.games.find(
              (game) => game.id === record.id,
            );
            const current = history?.archive.active === record.id;
            const stamp = new Date(record.startedAt);
            const date = Number.isFinite(stamp.getTime())
              ? stamp.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Saved journey";
            const state = raw ? replayGame(raw) : undefined;
            const scene = state
              ? journeyPreviewArtwork(state)
              : { src: art.landscape, alt: "A wagon on the prairie" };
            const turnName =
              state && !["won", "lost"].includes(record.outcome)
                ? (state.players[state.current]?.name ?? "")
                : "";
            return `<article class="journey-list-row" data-ui-key="journey-choice-${escape(record.id)}"><img class="journey-list-art" src="${scene.src}" alt="${escape(scene.alt)}" loading="lazy" width="160" height="112"><div class="journey-list-copy"><div class="journey-list-title"><h3>Journey ${record.number}</h3>${record.simulated ? '<span class="journey-mode-tag">Simulated</span>' : ""}<span class="stats-outcome-tag stats-tag-${record.outcome}">${outcomeNames[record.outcome]}</span>${current ? '<span class="journey-current-tag">Current</span>' : ""}</div><div class="journey-list-metrics">${journeyProgressRing(record.distance, 50, "Cards")}${journeyProgressRing(record.survivors, record.players.length, "Alive")}<span class="journey-list-date">${date}<small>${record.days} day${record.days === 1 ? "" : "s"} on the trail</small></span></div><div class="journey-list-party">${record.players.map((player, index) => `<span>${player.alive ? portraitImage(player.portrait ?? index % 6) : `<img class="stats-grave" src="${art.tombstoneIcon}" alt="">`}<span>${escape(player.name)}</span></span>`).join("")}</div></div><div class="journey-list-open">${turnName ? `<small>${escape(turnName)}’s turn</small>` : ""}<button data-open-journey="${escape(record.id)}" aria-label="Open Journey ${record.number}">${record.outcome === "won" || record.outcome === "lost" ? "View result" : "Open journey"} →</button></div></article>`;
          })
          .join("")}</div>`
      : `<section class="journey-filter-empty"><h3>No ${journeysMode === "all" ? "saved" : journeysMode} journeys yet.</h3><p>${journeysMode === "played" ? "Choose All or Simulated to see your computer expeditions." : "Try another filter to see the rest of your journeys."}</p></section>`
  }</main>`;
}
function loadStatisticsData(mode: JourneyModeFilter = "all") {
  if (!statisticsData) {
    statisticsSkipped = 0;
    const records = (history?.archive.games ?? []).flatMap((record) => {
      try {
        return [{ record, state: replayGame(record) }];
      } catch {
        statisticsSkipped++;
        return [];
      }
    });
    statisticsByMode.clear();
    for (const mode of ["all", "played", "simulated"] as const)
      statisticsByMode.set(mode, gameStatistics(records, mode));
    statisticsData = statisticsByMode.get("all")!;
  }
  return statisticsByMode.get(mode)!;
}
function renderJourneyMap(
  state: Journey,
  record = history?.archive.games.find((r) => r.id === history?.archive.active),
) {
  return journeyMap(
    state,
    {
      art,
      calamities: calamityArt,
      portraits: state.players.map((p, i) =>
        portraitImage(p.portrait ?? i % 6),
      ),
    },
    record,
  );
}
function renderJourneyMapPreview(state: Journey, finale = false) {
  if (!history?.archive.active) return "";
  return journeyMapPreview(
    state,
    { art, calamities: calamityArt, portraits: [] },
    finale
      ? "disabled"
      : `data-view-journey="${escape(history.archive.active)}"`,
    finale ? "finale-map" : "view-final-map",
  );
}
function journeyMapScreen() {
  const record = history?.archive.games.find(
    (r) => r.id === selectedJourneyMap,
  );
  if (!record) return statisticsScreen();
  const state = replayGame(record);
  const number = history!.archive.games.indexOf(record) + 1;
  return `<main class="journey-atlas-view" data-ui-key="atlas-${escape(record.id)}"><header class="atlas-toolbar"><button data-map-back>← ${mapReturnView === "journey" ? "Back to journey" : "Statistics"}</button><div><h1>Journey ${number}</h1>${record.simulated ? '<span class="journey-mode-tag">Simulated</span>' : ""}<span class="stats-outcome-tag stats-tag-${record.outcome}">${outcomeNames[record.outcome]}</span></div><span class="atlas-route-label">Independence → Oregon City</span><button data-open-journey="${escape(record.id)}">${state.status === "travel" ? "Continue journey" : "Final result"} →</button></header>${!record.completeFromStart ? '<p class="map-partial">Some earlier turn details were not recorded.</p>' : ""}${renderJourneyMap(state, record)}</main>`;
}
app.addEventListener("click", async (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    "[data-view-journey], [data-map-back]",
  );
  if (!target || busy) return;
  event.stopImmediatePropagation();
  const id = target.dataset.viewJourney;
  if (id && !history?.archive.games.some((r) => r.id === id)) return;
  if (id) mapReturnView = showStatistics ? "stats" : "journey";
  selectedJourneyMap = id;
  showStatistics = !!id || mapReturnView === "stats";
  showJourneys = false;
  setBusy(true);
  try {
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    if (!reducedMotion.matches)
      await playTimeline((tl) =>
        tl.fromTo(
          app.querySelector("main"),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.3, clearProps: "opacity,transform" },
        ),
      );
    app.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  } finally {
    setBusy(false);
  }
});
function batchLab() {
  const progress = batchProgress;
  const hasBatch = batchRunning || !!batchDataset || !!batchProgress;
  const playerOptions = (selected: number) =>
    [2, 3, 4, 5, 6]
      .map(
        (n) =>
          `<option value="${n}" ${selected === n ? "selected" : ""}>${n}</option>`,
      )
      .join("");
  return `<section class="batch-lab" aria-labelledby="batch-heading"><button type="button" class="stats-panel-heading batch-lab-toggle" data-batch-toggle aria-expanded="${batchExpanded}" aria-controls="batch-content"><span class="batch-lab-title" id="batch-heading">Simulation lab</span><span class="batch-lab-caption">${batchRunning && progress ? `${progress.attempted.toLocaleString()} / ${progress.requested.toLocaleString()} runs` : "Temporary · never saved"}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></span></button><div class="batch-lab-fold ${batchExpanded ? "is-expanded" : ""}"><div class="batch-lab-content" id="batch-content" ${batchExpanded ? "" : "inert"}><form id="batch-form"><div class="batch-config"><label>Runs<input id="batch-count" type="number" min="1" max="10000" step="1" required value="${batchConfig.count}" ${batchRunning ? "disabled" : ""}></label><div class="batch-player-range"><label>Min players<select id="batch-min-players" ${batchRunning ? "disabled" : ""}>${playerOptions(batchConfig.minPlayers)}</select></label><span aria-hidden="true">–</span><label>Max players<select id="batch-max-players" ${batchRunning ? "disabled" : ""}>${playerOptions(batchConfig.maxPlayers)}</select></label></div><button type="button" data-batch-run ${batchRunning ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${computerIcon}</svg>Run simulations</button>${batchRunning ? `<button type="button" data-batch-cancel ${batchStopping ? "disabled" : ""}>${batchStopping ? "Stopping…" : "Stop batch"}</button>` : hasBatch ? '<button type="button" data-batch-clear>Clear dataset</button>' : ""}</div></form><p class="batch-explanation">Player count is picked randomly within your range. Every run shuffles starting hands, supplies and decks, then rolls its own fate.</p>${batchError ? `<p class="batch-error" role="alert">${escape(batchError)}</p>` : ""}${progress ? `<div class="batch-progress" role="progressbar" aria-label="Simulation batch progress" aria-valuemin="0" aria-valuemax="${progress.requested}" aria-valuenow="${progress.attempted}"><span style="width:${(progress.attempted / progress.requested) * 100}%"></span></div><div class="batch-progress-summary" role="status"><strong>${batchRunning ? (batchStopping ? "Stopping" : "Running") : batchDataset ? (batchDataset.cancelled ? "Stopped" : "Complete") : batchError ? "Paused" : "Complete"} · ${progress.attempted.toLocaleString()} / ${progress.requested.toLocaleString()}</strong><span>${progress.wins.toLocaleString()} reached Oregon · ${progress.losses.toLocaleString()} lost${progress.skipped ? ` · ${progress.skipped} action-limit runs excluded` : ""}</span></div>` : ""}</div></div></section>${hasBatch ? `<div class="statistics-source" role="group" aria-label="Statistics dataset"><button type="button" data-statistics-source="saved" aria-pressed="${statisticsSource === "saved"}">Saved journeys</button><button type="button" data-statistics-source="batch" aria-pressed="${statisticsSource === "batch"}">Temporary batch${batchDataset ? ` · ${batchDataset.games.length.toLocaleString()}` : ""}</button></div>` : ""}`;
}
function batchPlayerComparison() {
  if (!batchDataset?.games.length) return "";
  const groups = [2, 3, 4, 5, 6]
    .map((players) => ({
      players,
      games: batchDataset!.games.filter((g) => g.players.length === players),
    }))
    .filter((g) => g.games.length);
  return `<section class="stats-panel batch-comparison"><div class="stats-panel-heading"><h3>By wagon size</h3><span>Completed runs only</span></div><table><thead><tr><th scope="col">Players</th><th scope="col">Runs</th><th scope="col">Reached Oregon</th><th scope="col">Win rate</th></tr></thead><tbody>${groups
    .map(({ players, games }) => {
      const wins = games.filter((g) => g.outcome === "won").length;
      return `<tr><th scope="row">${players}</th><td>${games.length.toLocaleString()}</td><td>${wins.toLocaleString()}</td><td>${((wins / games.length) * 100).toFixed(1)}%</td></tr>`;
    })
    .join("")}</tbody></table></section>`;
}
function refreshBatchView() {
  if (showStatistics && !showJourneys && !selectedJourneyMap) render();
}
function startBatch() {
  const form = app.querySelector<HTMLFormElement>("#batch-form");
  if (!form || batchRunning || !form.reportValidity()) return;
  batchConfig = {
    count: Number(app.querySelector<HTMLInputElement>("#batch-count")!.value),
    minPlayers: Number(
      app.querySelector<HTMLSelectElement>("#batch-min-players")!.value,
    ),
    maxPlayers: Number(
      app.querySelector<HTMLSelectElement>("#batch-max-players")!.value,
    ),
  };
  const options: BatchOptions = {
    ...batchConfig,
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
  };
  try {
    validateBatchOptions(options);
  } catch (error) {
    batchError =
      error instanceof Error ? error.message : "Check the batch settings.";
    refreshBatchView();
    return;
  }
  batchError = "";
  batchDataset = undefined;
  batchStatistics = undefined;
  batchRunning = true;
  batchStopping = false;
  batchProgress = {
    attempted: 0,
    requested: options.count,
    wins: 0,
    losses: 0,
    skipped: 0,
  };
  statisticsSource = "batch";
  statisticsFilter = "all";
  ledgerPage = 0;
  try {
    const worker = new Worker(new URL("./BatchWorker.ts", import.meta.url), {
      type: "module",
    });
    batchWorker = worker;
    const fail = (message: string) => {
      if (batchWorker !== worker) return;
      batchError = message;
      batchRunning = false;
      batchStopping = false;
      worker.terminate();
      batchWorker = undefined;
      refreshBatchView();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(event.message || "The simulation worker stopped unexpectedly.");
    };
    worker.onmessage = (event: MessageEvent<BatchMessage>) => {
      if (batchWorker !== worker) return;
      const message = event.data;
      if (message.type === "progress") batchProgress = message.progress;
      else if (message.type === "error") {
        fail(message.message);
        return;
      } else {
        batchDataset = message.dataset;
        batchProgress = message.dataset.progress;
        batchStatistics = summarizeJourneys(message.dataset.games);
        batchRunning = false;
        batchStopping = false;
        worker.terminate();
        batchWorker = undefined;
      }
      refreshBatchView();
    };
    worker.postMessage({ type: "start", options });
  } catch (error) {
    batchError =
      error instanceof Error
        ? error.message
        : "Could not start the simulation worker.";
    batchRunning = false;
    batchStopping = false;
    batchWorker?.terminate();
    batchWorker = undefined;
  }
  refreshBatchView();
}
app.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "batch-count") batchConfig.count = Number(target.value);
  if (target.id === "batch-min-players")
    batchConfig.minPlayers = Number(target.value);
  if (target.id === "batch-max-players")
    batchConfig.maxPlayers = Number(target.value);
});
app.addEventListener("submit", (event) => {
  if ((event.target as Element).id === "batch-form") {
    event.preventDefault();
    startBatch();
  }
});
app.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    "[data-batch-toggle], [data-batch-run], [data-batch-cancel], [data-batch-clear], [data-statistics-source]",
  );
  if (!target || target.disabled) return;
  event.stopImmediatePropagation();
  if (target.hasAttribute("data-batch-toggle")) {
    batchExpanded = !batchExpanded;
    refreshBatchView();
  } else if (target.hasAttribute("data-batch-run")) startBatch();
  else if (target.hasAttribute("data-batch-cancel")) {
    batchStopping = true;
    batchWorker?.postMessage({ type: "cancel" });
    refreshBatchView();
  } else if (target.hasAttribute("data-batch-clear")) {
    batchDataset = undefined;
    batchStatistics = undefined;
    batchProgress = undefined;
    batchError = "";
    statisticsSource = "saved";
    statisticsFilter = "all";
    ledgerPage = 0;
    refreshBatchView();
  } else {
    statisticsSource =
      target.dataset.statisticsSource === "batch" ? "batch" : "saved";
    statisticsFilter = "all";
    ledgerPage = 0;
    refreshBatchView();
  }
});
if (import.meta.hot) import.meta.hot.dispose(() => batchWorker?.terminate());
app.addEventListener("click", async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "[data-flow-mode]",
  );
  if (!button || busy) return;
  event.stopImmediatePropagation();
  const mode = button.dataset.flowMode as FlowMode;
  if (!["journeys", "players", "days"].includes(mode) || mode === flowMode)
    return;
  flowMode = mode;
  setBusy(true);
  try {
    render();
    if (!reducedMotion.matches)
      await playTimeline((tl) =>
        tl.fromTo(
          app.querySelector(".flow-scroll"),
          { opacity: 0, y: 4 },
          { opacity: 1, y: 0, duration: 0.25, clearProps: "opacity,transform" },
        ),
      );
    app
      .querySelector<HTMLButtonElement>(`[data-flow-mode="${mode}"]`)
      ?.focus({ preventScroll: true });
  } finally {
    setBusy(false);
  }
});
function statisticsScreen() {
  const temporary = statisticsSource === "batch";
  const data = temporary
    ? (batchStatistics ?? summarizeJourneys([]))
    : loadStatisticsData(statisticsMode);
  const total = data.games.length;
  const percent = (rate: number | null) =>
    rate === null ? "—" : `${Math.round(rate * 100)}%`;
  const labels = Object.keys(outcomeNames) as Outcome[];
  const circumference = 2 * Math.PI * 48;
  const visible = data.games
    .map((record, index) => ({
      ...record,
      number: temporary
        ? index + 1
        : (history?.archive.games.findIndex((game) => game.id === record.id) ??
            -1) + 1,
    }))
    .filter(
      (record) =>
        statisticsFilter === "all" || record.outcome === statisticsFilter,
    )
    .reverse();
  const ledgerPages = Math.max(1, Math.ceil(visible.length / ledgerPageSize));
  ledgerPage = Math.min(ledgerPage, ledgerPages - 1);
  const ledgerStart = ledgerPage * ledgerPageSize;
  const displayed = visible.slice(ledgerStart, ledgerStart + ledgerPageSize);
  const pagination =
    ledgerPages > 1
      ? `<nav class="ledger-pagination" aria-label="Ledger pages"><button type="button" data-ledger-page="${ledgerPage - 1}" ${ledgerPage === 0 ? "disabled" : ""}>← Previous</button><span aria-live="polite">Page ${ledgerPage + 1} of ${ledgerPages.toLocaleString()}</span><button type="button" data-ledger-page="${ledgerPage + 1}" ${ledgerPage === ledgerPages - 1 ? "disabled" : ""}>Next →</button></nav>`
      : "";
  const maxDistance = Math.max(1, ...data.distances.map((bin) => bin.count));
  const maxDeaths = Math.max(1, ...data.deaths.map((cause) => cause.count));
  const date = (iso: string) => {
    const value = new Date(iso);
    return Number.isFinite(value.getTime())
      ? value.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Date unavailable";
  };
  return `<header><div><p class="eyebrow">The wagon’s ledger</p><h1>Journey <i>statistics</i></h1></div><div class="header-actions">${button("stats-back", setup ? "← Back to wagon" : "← Back to journey")}${navigationIcons()}</div></header><main class="stats-screen"><div class="stats-intro"><h2 id="stats-heading" tabindex="-1">Every road leaves a story.</h2><p>${temporary ? "Temporary batch analysis. These runs stay in memory and disappear when you reload or close this page." : `${statisticsMode === "all" ? "All" : statisticsMode === "played" ? "Played" : "Simulated"} journeys saved on this device.${statisticsSkipped ? ` ${statisticsSkipped} unreadable record${statisticsSkipped === 1 ? " is" : "s are"} excluded.` : ""}`}</p></div>${batchLab()}${temporary ? "" : journeyModeFilter("statistics", statisticsMode)}${
    temporary && !total
      ? `<section class="batch-waiting"><p>${batchRunning ? "The clankers are gathering evidence…" : "No completed runs in this dataset. Start a batch above."}</p></section>`
      : !total
        ? `<section class="stats-empty"><img src="${art.progressWagon}" alt=""><h3>${statisticsMode === "all" ? "A blank page, for now." : `No ${statisticsMode} journeys yet.`}</h3><p>${statisticsMode === "all" ? "Start a journey and its story will appear here—even before you reach the end." : "Choose another filter to explore the journeys saved here."}</p>${button("stats-back", "Back to the wagon →")}</section>`
        : `${temporary ? batchPlayerComparison() : ""}${journeyFlow(data.games, statisticsFilter, flowMode)}<section class="stats-metrics" aria-label="Completed journey averages"><div><strong>${percent(data.survivalRate)}</strong><span>Traveller survival</span><small>${data.survivors} of ${data.travellers} travellers in completed games</small></div><div><strong>${data.averageDistance === null ? "—" : Math.round(data.averageDistance)}</strong><span>Average trail cards</span><small>Out of 50 · completed games</small></div><div><strong>${data.averageDays === null ? "—" : Math.round(data.averageDays)}</strong><span>Average days on the trail</span><small>Completed games</small></div></section><div class="stats-charts"><section class="stats-panel"><div class="stats-panel-heading"><h3>How far the wagon gets</h3></div><p class="stats-chart-note">Trail cards reached · ${temporary ? "temporary batch" : statisticsMode === "all" ? "all saved games" : `${statisticsMode} games`}</p><div class="stats-distance-chart" role="img" aria-label="${data.distances.map((bin) => `${bin.label}: ${bin.count} games`).join(", ")}">${data.distances.map((bin, index) => `<div><strong>${bin.count}</strong><div class="stats-bin-track"><span class="${index === 5 ? "stats-tone-won" : "stats-tone-travel"}" style="height:${(bin.count / maxDistance) * 100}%"></span></div><small>${bin.label}</small></div>`).join("")}</div></section><section class="stats-panel"><div class="stats-panel-heading"><h3>What the trail takes</h3></div><p class="stats-chart-note">Traveller deaths · ${temporary ? "temporary batch" : statisticsMode === "all" ? "all saved games" : `${statisticsMode} games`}</p>${
            data.deaths.length
              ? `<div class="stats-death-chart">${data.deaths
                  .map(({ cause, count }) => {
                    const kind = (Object.keys(titles) as Calamity[]).find(
                      (kind) => titles[kind] === cause,
                    );
                    const image = kind
                      ? calamityArt[kind]
                      : cause === "Drowning"
                        ? riverArt.drowning
                        : art.tombstoneIcon;
                    return `<div class="stats-death-row"><img src="${image}" alt=""><div><div class="stats-death-label"><span>${escape(cause)}</span><strong>${count}</strong></div><div class="stats-death-track"><span style="width:${(count / maxDeaths) * 100}%"></span></div></div></div>`;
                  })
                  .join("")}</div>`
              : '<div class="stats-no-deaths"><img src="' +
                art.progressWagon +
                '" alt=""><p>No travellers lost so far.</p></div>'
          }</section></div><section class="stats-history" id="stats-ledger" tabindex="-1"><div class="stats-panel-heading"><h3>${temporary ? "Batch runs" : "The journey ledger"}</h3>${visible.length ? `<span>${(ledgerStart + 1).toLocaleString()}–${(ledgerStart + displayed.length).toLocaleString()} of ${visible.length.toLocaleString()}</span>` : ""}</div><div class="stats-filters" role="group" aria-label="${temporary ? "Filter batch outcomes" : "Filter saved journeys"}">${(["all", ...labels] as const).map((outcome) => `<button data-stats-filter="${outcome}" aria-pressed="${statisticsFilter === outcome}">${outcome === "all" ? (temporary ? "All runs" : "All journeys") : outcomeNames[outcome]} <span>${outcome === "all" ? total : data.outcomes[outcome]}</span></button>`).join("")}</div><div class="stats-records">${displayed.length ? displayed.map((record) => `<article class="stats-record" data-ui-key="stats-record-${escape(record.id)}"><div class="stats-record-title"><h4>${temporary ? "Run" : "Journey"} ${record.number}</h4>${record.simulated ? '<span class="journey-mode-tag">Simulated</span>' : ""}<span class="stats-outcome-tag stats-tag-${record.outcome}">${outcomeNames[record.outcome]}</span></div><div class="stats-record-date">${date(record.startedAt)}${record.partial ? " · Partial turn history" : ""}</div><div class="stats-record-progress"><span style="width:${record.distance * 2}%" class="stats-tone-${record.outcome}"></span></div><div class="stats-record-totals"><span>${record.distance} / 50 cards</span><span>${record.days} day${record.days === 1 ? "" : "s"}</span><span>${record.survivors} / ${record.players.length} alive</span></div><div class="stats-record-party">${record.players.map((player, index) => `<span title="${escape(player.name)}${!player.alive ? ` — ${escape(player.deathCause ?? "Died on the trail")}` : ""}" aria-label="${escape(player.name)}${!player.alive ? ", deceased" : ""}">${player.alive ? portraitImage(player.portrait ?? index % 6) : `<img class="stats-grave" src="${art.tombstoneIcon}" alt="">`}</span>`).join("")}</div>${temporary ? "" : `<button class="stats-map-button" data-view-journey="${escape(record.id)}">View trail map →</button>`}</article>`).join("") : '<p class="stats-no-records">No journeys in this group yet.</p>'}</div>${pagination}</section>`
  }</main>`;
}
app.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    "[data-ledger-page]",
  );
  if (!target || target.disabled || busy || !showStatistics) return;
  const page = Number(target.dataset.ledgerPage);
  if (!Number.isInteger(page) || page < 0) return;
  event.stopImmediatePropagation();
  ledgerPage = page;
  render();
  const ledger = app.querySelector<HTMLElement>("#stats-ledger");
  ledger?.focus({ preventScroll: true });
  ledger?.scrollIntoView({
    behavior: reducedMotion.matches ? "instant" : "smooth",
    block: "start",
  });
});
app.addEventListener("click", async (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    '[data-action="stats"], [data-action="stats-back"], [data-action="journeys"], [data-stats-filter], [data-journey-mode], [data-open-journey], [data-action="new"]',
  );
  if (!target || target.disabled) return;
  if (busy) {
    if (target.dataset.action === "new") {
      pendingNewJourney = true;
      event.stopImmediatePropagation();
    }
    return;
  }
  event.stopImmediatePropagation();
  const creating = target.dataset.action === "new";
  const modeFiltering = target.dataset.journeyMode !== undefined;
  const filtering = target.dataset.statsFilter !== undefined || modeFiltering;
  const opening = target.dataset.openJourney;
  setBusy(true);
  try {
    if (opening) {
      try {
        const record = history?.archive.games.find(
          (record) => record.id === opening,
        );
        if (!record) throw new Error("This journey is unavailable.");
        const state = readSave(JSON.stringify(replayGame(record)));
        if (!state)
          throw new Error("This journey’s saved state cannot be opened.");
        history!.select(opening);
        game = new TrailGame(
          Math.random,
          state,
          (n) => pendingRolls.push(n),
          (kind) => {
            revealedCalamity = kind;
          },
        );
        pendingRolls.length = 0;
        revealedCalamity = undefined;
        setup = false;
        confirming = false;
        shopOpen = false;
        showStatistics = false;
        showJourneys = false;
        willDraftOwner = -1;
        willDraft.clear();
        selectedWillSupply = null;
        renderedProgress = -1;
        statisticsData = undefined;
        restoreTimelineOwners();
        persist({ type: "open-journey" });
      } catch (error) {
        journeyOpenError =
          error instanceof Error
            ? error.message
            : "This journey cannot be opened.";
        render();
        return;
      }
    } else if (modeFiltering) {
      const mode = target.dataset.journeyMode as JourneyModeFilter;
      if (!["all", "played", "simulated"].includes(mode)) return;
      if (target.dataset.modeScope === "journeys") journeysMode = mode;
      else statisticsMode = mode;
      ledgerPage = 0;
    } else if (filtering) {
      statisticsFilter = target.dataset.statsFilter as Outcome | "all";
      ledgerPage = 0;
    } else if (
      target.dataset.action === "stats" ||
      target.dataset.action === "journeys"
    ) {
      if (!showStatistics && !showJourneys) journeyScroll = window.scrollY;
      statisticsData = undefined;
      statisticsFilter = "all";
      ledgerPage = 0;
      selectedJourneyMap = undefined;
      journeyOpenError = "";
      showStatistics = target.dataset.action === "stats";
      showJourneys = target.dataset.action === "journeys";
    } else {
      showStatistics = false;
      showJourneys = false;
      if (creating) {
        welcomeDismissed = true;
        confirming = !setup;
        if (game.state.mode === "simulation") {
          setup = true;
          confirming = false;
        }
      }
    }
    render();
    if (!filtering)
      window.scrollTo({
        top:
          showStatistics || showJourneys || opening || creating
            ? 0
            : journeyScroll,
        behavior: "instant",
      });
    if (!reducedMotion.matches)
      await playTimeline((tl) =>
        tl.fromTo(
          app.querySelector(
            filtering
              ? showJourneys
                ? ".journey-list, .journey-filter-empty"
                : ".stats-records, .stats-empty"
              : showStatistics
                ? ".stats-screen"
                : showJourneys
                  ? ".journey-browser"
                  : ".decision",
          ),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.25, clearProps: "opacity,transform" },
        ),
      );
    if (opening && game.state.mode !== "simulation") {
      if (game.state.status !== "travel") await revealJourneyEnd();
      else if (game.state.phase === "legacy") {
        await revealWills();
        render();
      }
    }
    const focus = creating
      ? setup
        ? ".player-name"
        : '[data-action="confirm-new"]'
      : showStatistics
        ? "#stats-heading"
        : showJourneys
          ? "#journey-browser-heading"
          : '[data-action="journeys"]';
    if (modeFiltering)
      app
        .querySelector<HTMLButtonElement>(
          `[data-mode-scope="${showJourneys ? "journeys" : "statistics"}"][data-journey-mode="${showJourneys ? journeysMode : statisticsMode}"]`,
        )
        ?.focus({ preventScroll: true });
    else if (filtering)
      app
        .querySelector<HTMLButtonElement>(
          `[data-stats-filter="${statisticsFilter}"]`,
        )
        ?.focus({ preventScroll: true });
    else app.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  } finally {
    setBusy(false);
  }
});
function trading() {
  const s = game.state;
  return `<section class="shop passive-shop ${shopOpen ? "is-open" : ""}"><button data-action="shop" class="shop-toggle" aria-expanded="${shopOpen}" aria-controls="supply-shop-content"><img src="${art.shop}" alt=""><span><span class="eyebrow">Give 2 → Get 1</span><strong>Supply exchange</strong><small>Any two supplies for one you need · no turn used</small></span><span class="shop-chevron" aria-hidden="true">⌄</span></button><div id="supply-shop-content" class="shop-content" ${!shopOpen ? "hidden" : ""}><div class="exchange-columns"><section class="exchange-give"><div class="exchange-heading"><h3>Give 2</h3><span class="trade-give-count" role="status">0 / 2 selected</span></div><p>Pick any two supplies. One traveller can pay both, or two can share.</p><div class="exchange-bags">${game.living
    .map((i) => {
      const p = s.players[i];
      return `<div class="exchange-bag" data-ui-key="exchange-bag-${i}"><div class="exchange-owner">${portrait(i)}<strong>${escape(p.name)}</strong></div><div class="trade-picks">${p.supplies.map((kind, index) => `<label data-ui-key="payment-${i}-${index}"><input type="checkbox" name="payment" value="${i}:${index}" aria-label="Give ${names[kind]} from ${escape(p.name)}, card ${index + 1}">${supplyEmblem(kind)}</label>`).join("") || '<small class="exchange-empty">No supplies to give.</small>'}</div></div>`;
    })
    .join(
      "",
    )}</div></section><section class="exchange-get"><div class="exchange-heading"><h3>Get 1</h3><span>From the shop</span></div><p>Choose the supply you want in return.</p><div class="exchange-stock">${(Object.keys(names) as Supply[]).map((kind) => `<button class="exchange-stock-choice" data-shop-supply="${kind}" data-ui-key="shop-choice-${kind}" aria-label="Receive ${names[kind]}, ${s.shop[kind]} available" aria-pressed="false" ${!s.shop[kind] ? "disabled" : ""}>${supplyEmblem(kind)}<small>${s.shop[kind] ? `${s.shop[kind]} available` : "Out of stock"}</small></button>`).join("")}</div><select id="trade-kind" hidden aria-label="Supply to receive"><option value="">Choose a supply</option>${(Object.keys(names) as Supply[]).map((kind) => `<option value="${kind}" ${!s.shop[kind] ? "disabled" : ""}>${names[kind]}</option>`).join("")}</select></section></div><div class="trade-footer exchange-footer"><div class="exchange-recipient"><span id="exchange-recipient-label">Deliver to</span><div class="leader-icons" role="group" aria-labelledby="exchange-recipient-label">${game.living.map((i) => `<button class="leader-icon ${i === s.current ? "selected" : ""}" data-exchange-recipient="${i}" data-ui-key="exchange-recipient-${i}" aria-label="Deliver to ${escape(s.players[i].name)}" aria-pressed="${i === s.current}">${portrait(i)}</button>`).join("")}</div><strong class="exchange-recipient-name">${escape(s.players[s.current].name)}</strong><select id="trade-recipient" hidden aria-label="Supply recipient">${game.living.map((i) => `<option value="${i}" ${i === s.current ? "selected" : ""}>${escape(s.players[i].name)}</option>`).join("")}</select></div><div class="exchange-receipt" aria-live="polite"></div><button data-action="trade" disabled>Exchange supplies →</button></div><p id="trade-error" role="status"></p></div></section>`;
}
function updateExchange() {
  const shop = app.querySelector(".shop");
  if (!shop) return;
  const inputs = Array.from(
    shop.querySelectorAll<HTMLInputElement>('input[name="payment"]'),
  );
  const selected = inputs.filter((input) => input.checked);
  inputs.forEach((input) => {
    input.disabled = selected.length >= 2 && !input.checked;
  });
  shop.querySelector(".trade-give-count")!.textContent =
    `${selected.length} / 2 selected`;
  const kind = shop.querySelector<HTMLSelectElement>("#trade-kind")!
    .value as Supply;
  const recipient = Number(
    shop.querySelector<HTMLSelectElement>("#trade-recipient")!.value,
  );
  shop
    .querySelectorAll<HTMLButtonElement>("[data-shop-supply]")
    .forEach((choice) =>
      choice.setAttribute(
        "aria-pressed",
        String(choice.dataset.shopSupply === kind),
      ),
    );
  shop
    .querySelectorAll<HTMLButtonElement>("[data-exchange-recipient]")
    .forEach((choice) => {
      const chosen = Number(choice.dataset.exchangeRecipient) === recipient;
      choice.setAttribute("aria-pressed", String(chosen));
      choice.classList.toggle("selected", chosen);
    });
  shop.querySelector(".exchange-recipient-name")!.textContent =
    game.state.players[recipient].name;
  const valid =
    selected.length === 2 &&
    !!game.state.shop[kind] &&
    game.state.status === "travel" &&
    !["legacy", "discard"].includes(game.state.phase);
  shop.querySelector<HTMLButtonElement>('[data-action="trade"]')!.disabled =
    !valid;
  const give = selected.map((input) => {
    const [owner, index] = input.value.split(":").map(Number);
    const supply = game.state.players[owner].supplies[index];
    return supply
      ? `<span class="receipt-supply">${supplyEmblem(supply)}<small>${escape(game.state.players[owner].name)}</small></span>`
      : "";
  });
  while (give.length < 2)
    give.push(
      '<span class="receipt-placeholder" aria-label="Choose a supply to give">?</span>',
    );
  shop.querySelector(".exchange-receipt")!.innerHTML =
    `<div class="receipt-give">${give.join('<span class="receipt-plus" aria-hidden="true">+</span>')}</div><span class="receipt-arrow" aria-hidden="true">→</span><div class="receipt-get">${kind && names[kind] ? `<span class="receipt-supply">${supplyEmblem(kind)}<small>for ${escape(game.state.players[recipient].name)}</small></span>` : '<span class="receipt-placeholder" aria-label="Choose a supply to receive">?</span>'}</div>`;
}
app.addEventListener("click", (event) => {
  const choice = (event.target as Element).closest<HTMLButtonElement>(
    "[data-shop-supply], [data-exchange-recipient]",
  );
  if (!choice || busy || choice.disabled) return;
  event.stopImmediatePropagation();
  if (choice.dataset.exchangeRecipient !== undefined)
    app.querySelector<HTMLSelectElement>("#trade-recipient")!.value =
      choice.dataset.exchangeRecipient;
  else
    app.querySelector<HTMLSelectElement>("#trade-kind")!.value =
      choice.dataset.shopSupply!;
  app.querySelector("#trade-error")!.textContent = "";
  updateExchange();
});
function render() {
  hideOutcomeTooltip();
  document.body.classList.toggle(
    "is-map-view",
    showStatistics && !showJourneys && !!selectedJourneyMap,
  );
  if (showStatistics || showJourneys) {
    const page = document.createElement("template");
    page.innerHTML = showJourneys
      ? journeysScreen()
      : selectedJourneyMap
        ? journeyMapScreen()
        : statisticsScreen();
    const credit = document.createElement("template");
    credit.innerHTML = selectedJourneyMap ? "" : siteCredit();
    page.content.append(credit.content);
    const changed = reconcile(app, page.content);
    initializeJourneyMapViewport();
    scheduleStickyPanels();
    return changed;
  }
  if (!setup && game.state.mode === "simulation") {
    const page = document.createElement("template");
    page.innerHTML = simulationScreen();
    const changed = reconcile(app, page.content);
    initializeJourneyMapViewport();
    scheduleStickyPanels();
    return changed;
  }
  initializeJourneyMapViewport();
  const s = game.state;
  const scene = journeyArtwork();
  const markup = `<header><div><p class="eyebrow">A cooperative westward wander · 2–6 players</p><h1>Oregon Trail <i>Cards</i></h1></div><div class="header-actions">${navigationIcons()}${setup ? (s.started ? button("resume", "Back to journey") : "") : ""}</div></header>${confirming ? `<aside class="restart-confirm"><span>Leave this journey behind?</span><div class="restart-actions">${button("cancel", "Stay here")}${button("confirm-new", "Start afresh")}</div></aside>` : ""}${
    setup
      ? !welcomeDismissed && !s.started && !history?.archive.games.length
        ? welcomeScreen()
        : setupScreen()
      : `<section class="journey"><img class="banner ${scene.src === art.landscape ? "" : "is-event"} ${[art.river, riverArt.moderate, riverArt.raging].includes(scene.src) ? "is-river" : ""}" src="${scene.src}" alt="${escape(scene.alt)}"></section><section class="players" aria-label="Travellers">${s.players.map((_, i) => playerCard(i)).join("")}</section>${trail()}${decision()}${
          s.status === "travel"
            ? `${s.phase !== "legacy" && s.phase !== "discard" ? trading() : ""}`
            : ""
        }`
  }
<footer><details><summary>Rules of the road</summary><div class="help-content"><p>Play one connected trail card OR spend a turn supplying remedies. There is no automatic replacement draw. If no trail fits, draw one and end your turn. Supplies can be traded two for one at any time. Rivers pass between players until an even roll succeeds.</p><p>Calamity deadlines end after the affected player’s next turn (or second turn for two rounds), giving everyone a chance to help. Broken wagon parts and dead oxen stop trail play. Dead players may will two supplies. The remaining travellers carry on.</p><p>Each road connects to the last card played. Earlier cards recycle automatically when the draw pile runs out, while their visits remain on the trail. Fifty cards means Oregon.</p><p>Based on the <a href="https://www.buffalolib.org/sites/default/files/gaming-unplugged/inst/The%20Oregon%20Trail%20Card%20Game%20Instructions.pdf" target="_blank" rel="noreferrer">2017 Pressman rules</a>. See the repository’s rules notes for card text and edition differences. Your journey saves on this device.</p></div></details><span>${storageAvailable ? "Saved here" : "Couldn’t save locally"}</span></footer>${siteCredit()}`;
  const template = document.createElement("template");
  template.innerHTML = markup;
  // Keep valid user selections and their companion emblems in sync before diffing.
  template.content
    .querySelectorAll<HTMLSelectElement>("select[id]")
    .forEach((select) => {
      const previous = app.querySelector<HTMLSelectElement>(`#${select.id}`);
      if (
        !previous ||
        !Array.from(select.options).some(
          (option) => option.value === previous.value && !option.disabled,
        )
      )
        return;
      select.value = previous.value;
      const companion = select.previousElementSibling;
      if (companion?.classList.contains("portrait")) {
        const image = document.createElement("template");
        image.innerHTML = portrait(Number(select.value));
        companion.replaceWith(image.content);
      } else if (companion?.classList.contains("supply-select-preview"))
        companion.innerHTML = supplyEmblem(select.value as Supply);
    });
  const changed = reconcile(app, template.content);
  initializeJourneyMapViewport();
  updateTrailReturnButton();
  const fill = app.querySelector<HTMLElement>(".map-track > span");
  if (fill && renderedProgress !== s.count) {
    if (reducedMotion.matches) fill.style.width = `${s.count * 2}%`;
    else
      gsap.to(fill, {
        width: `${s.count * 2}%`,
        duration: 0.5 / animationRate,
        ease: "power2.inOut",
      });
  }
  renderedProgress = s.count;
  updateExchange();
  scheduleStickyPanels();
  return changed;
}
// The six real faces share a cube; the model's roll determines the landing face.
const dieAngles: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};
const diePips: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
type RollContext = {
  phase: string;
  traveller: string;
  player?: number;
  deadly: boolean;
  calamity: string;
  calamityKind?: Calamity;
  loss?: SupplyLoss;
};
function deathJourneyText(player: (typeof game.state.players)[number]) {
  return player.deathDate && player.deathDay !== undefined
    ? ` on ${calendarDate(player.deathDate)}, after ${player.deathDay} day${player.deathDay === 1 ? "" : "s"} on the trail`
    : "";
}
function crossingSuccessText(attempts: number) {
  if (attempts <= 1) return "The crossing succeeds. You reached the far bank.";
  if (attempts === 2)
    return "There we go. The wagon reaches the far bank, and a few held breaths escape.";
  if (attempts === 3)
    return "At last! Three tries, one stubborn river, and solid ground beneath the wheels.";
  if (attempts <= 5)
    return `Finally. After ${attempts} attempts, the wagon reaches the far bank. A long, grateful sigh drifts across the water.`;
  if (attempts <= 9)
    return `Dry land. Glorious dry land. After ${attempts} attempts, nobody is in a hurry to look back at that river.`;
  return `At long, long last. ${attempts} attempts later, the wheels find solid ground. There may never have been a sweeter patch of dirt. Put the kettle on.`;
}
function rollOutcomeText(
  result: number,
  context: RollContext,
  attempts = game.top ? (reportFor(game.top)?.attempts ?? 1) : 1,
  phase = game.state.phase,
) {
  return context.phase === "repair"
    ? result >= 4
      ? `${context.calamity}: a lucky repair. The wagon can carry on.`
      : `${context.calamity}: the repair failed. Supply one spare part within one round or the journey ends.`
    : result % 2 === 0
      ? crossingSuccessText(attempts)
      : result === 1
        ? context.deadly
          ? `${context.traveller} drowned crossing the river${deathJourneyText(game.state.players.find((p) => p.name === context.traveller)!)}.`
          : context.loss
            ? `${game.state.players[context.loss.owner].name} lost ${names[context.loss.supply].toLowerCase()} in the river. The next traveller must try to cross.`
            : "No supplies left to lose. Pass the attempt to the next traveller."
        : "The crossing fails. The next traveller must try their luck.";
}
function createInterstitial(label: string) {
  hideOutcomeTooltip();
  const shell = document.createElement("div");
  shell.className = "result-interstitial";
  const panel = document.createElement("section");
  panel.className = "interstitial-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", label);
  panel.tabIndex = -1;
  shell.append(panel);
  document.body.append(shell);
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  app.inert = true;
  gsap.set(shell, { opacity: 0 });
  const trap = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const targets = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, textarea, select, [tabindex="0"]',
      ),
    );
    if (!targets.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = targets[0],
      last = targets.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panel)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === panel)
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  shell.addEventListener("keydown", trap);
  return {
    panel,
    async show() {
      if (
        computerSequenceOwner !== undefined ||
        (game.state.phase === "legacy" &&
          game.state.players[game.state.deaths[0]]?.controller === "computer")
      )
        panel.insertAdjacentHTML(
          "afterbegin",
          `<div class="interstitial-computer-control">${computerControl()}</div>`,
        );
      if (reducedMotion.matches) gsap.set(shell, { opacity: 1 });
      else
        await playTimeline((tl) => {
          tl.to(shell, { opacity: 1, duration: 0.18 }, 0);
          tl.fromTo(
            panel,
            { y: 16, scale: 0.98 },
            {
              y: 0,
              scale: 1,
              duration: 0.22,
              ease: "power2.out",
              clearProps: "transform",
            },
            0,
          );
        });
      panel.focus({ preventScroll: true });
    },
    async close() {
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.to(shell, { opacity: 0, duration: 0.16 }),
        );
      shell.remove();
      app.inert = false;
      document.body.style.overflow = overflow;
    },
  };
}
async function tumbleDie(result: number, context: RollContext) {
  const overlay = createInterstitial("River crossing or wagon repair result");
  const panel = overlay.panel;
  const roll = document.createElement("div");
  roll.className = "dice-roll";
  roll.setAttribute("aria-labelledby", "dice-result");
  roll.tabIndex = -1;
  const requirement =
    context.phase === "repair"
      ? "Roll 4, 5 or 6 to repair"
      : "Roll 2, 4 or 6 to ford";
  const stakes =
    context.phase === "repair"
      ? "On 1–3, the wagon needs one spare part within one round."
      : `3 or 5 passes the crossing to the next traveller. A 1 ${context.deadly ? "drowns the player" : "loses one supply"}.`;
  roll.setAttribute("aria-describedby", "dice-requirements");
  const playerIndex =
    context.player ??
    game.state.players.findIndex((p) => p.name === context.traveller);
  const encounterArtwork =
    context.phase === "repair"
      ? context.calamityKind
        ? calamityArt[context.calamityKind]
        : art.calamity
      : context.deadly
        ? riverArt.raging
        : riverArt.moderate;
  roll.innerHTML = `<div class="dice-encounter"><img src="${encounterArtwork}" alt="${escape(context.phase === "repair" ? context.calamity : "River crossing")}">${context.phase === "repair" ? `<h3>${escape(context.calamity)}</h3>` : ""}</div>${context.phase === "river" && playerIndex >= 0 ? `<div class="interstitial-person">${portraitImage(game.state.players[playerIndex].portrait ?? playerIndex % 6)}<span>${escape(context.traveller)}</span></div>` : ""}<div class="dice-requirements" id="dice-requirements"><strong>${requirement}</strong><p>${stakes}</p></div><div class="dice-stage" aria-hidden="true"><div class="dice-shadow"></div><div class="dice-hop"><div class="dice-cube">${[1, 2, 3, 4, 5, 6].map((face) => `<div class="dice-face face-${face}">${Array.from({ length: 9 }, (_, i) => `<span class="${diePips[face].includes(i + 1) ? "pip" : ""}"></span>`).join("")}</div>`).join("")}</div></div></div><span class="dice-caption" id="dice-result" role="status">A little tumble of fate…</span>`;
  panel.append(roll);
  await overlay.show();
  roll.focus({ preventScroll: true });
  roll.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      (roll.querySelector<HTMLButtonElement>(".dice-continue") ?? roll).focus({
        preventScroll: true,
      });
    }
  });
  const cube = roll.querySelector<HTMLElement>(".dice-cube")!;
  const [rotationX, rotationY] = dieAngles[result];
  try {
    if (reducedMotion.matches) gsap.set(cube, { rotationX, rotationY });
    else
      await playTimeline((tl) => {
        tl.fromTo(roll, { opacity: 0 }, { opacity: 1, duration: 0.18 }, 0);
        tl.fromTo(
          cube,
          { rotationX: -35, rotationY: 25, rotationZ: -18 },
          {
            rotationX: 720 + rotationX,
            rotationY: 1080 + rotationY,
            rotationZ: 0,
            duration: 1.15,
            ease: "power3.out",
          },
          0,
        );
        tl.fromTo(
          roll.querySelector(".dice-hop"),
          { y: 0 },
          { y: -28, duration: 0.26, ease: "power2.out" },
          0,
        );
        tl.to(
          roll.querySelector(".dice-hop"),
          { y: 0, duration: 0.38, ease: "power2.in" },
          0.26,
        );
        tl.to(
          roll.querySelector(".dice-hop"),
          { y: -7, duration: 0.16, ease: "power2.out" },
          0.64,
        );
        tl.to(
          roll.querySelector(".dice-hop"),
          { y: 0, duration: 0.2, ease: "power2.in" },
          0.8,
        );
        tl.fromTo(
          roll.querySelector(".dice-shadow"),
          { scale: 1, opacity: 0.22 },
          {
            scale: 0.7,
            opacity: 0.1,
            duration: 0.26,
            yoyo: true,
            repeat: 1,
            ease: "power2.inOut",
          },
          0,
        );
      });
    // Normalize full rotations so the settled transform is easy to inspect.
    gsap.set(cube, { rotationX, rotationY, rotationZ: 0 });
    roll.querySelector(".dice-caption")!.textContent = `Rolled ${result}`;
    const outcome = rollOutcomeText(result, context);
    const resultHeading = document.createElement("h3");
    resultHeading.className = "dice-result-heading";
    resultHeading.textContent =
      context.phase === "repair"
        ? result >= 4
          ? "Repair succeeded"
          : "Repair failed"
        : result % 2 === 0
          ? "River crossed"
          : result === 1
            ? context.deadly
              ? `${context.traveller} drowned`
              : "Supply lost"
            : "Crossing failed";
    if (context.phase === "river" || context.phase === "repair") {
      const succeeded =
        context.phase === "repair" ? result >= 4 : result % 2 === 0;
      roll.classList.add(succeeded ? "crossing-success" : "crossing-setback");
      const icon = document.createElement("span");
      icon.className = "crossing-result-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML =
        context.phase === "river" && result === 1 && context.deadly
          ? `<img src="${art.tombstoneIcon}" alt="">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${succeeded ? '<path d="m5 12 4 4L19 6"/>' : '<path d="m7 7 10 10M17 7 7 17"/>'}</svg>`;
      resultHeading.prepend(icon);
    }
    const explanation = document.createElement("p");
    explanation.className = "dice-outcome";
    explanation.textContent = outcome;
    const proceed = document.createElement("button");
    proceed.className = "dice-continue";
    proceed.textContent = "Continue →";
    proceed.disabled = true;
    const image = document.createElement("img");
    image.className = "river-result-art";
    image.src =
      context.phase === "repair"
        ? result >= 4
          ? art.landscape
          : context.calamityKind
            ? calamityArt[context.calamityKind]
            : art.calamity
        : result % 2 === 0
          ? riverArt.success
          : result === 1
            ? context.deadly
              ? riverArt.drowning
              : riverArt.loss
            : art.river;
    image.alt = resultHeading.textContent;
    const stage = roll.querySelector<HTMLElement>(".dice-stage")!;
    const encounter = roll.querySelector<HTMLElement>(".dice-encounter")!;
    const previousHeight = roll.getBoundingClientRect().height;
    if (!reducedMotion.matches)
      await playTimeline((tl) => {
        tl.to(
          [stage, encounter],
          { opacity: 0, y: -8, duration: 0.22, ease: "power2.in" },
          0.25,
        );
      });
    stage.hidden = true;
    encounter.hidden = true;
    stage.after(image);
    roll.append(resultHeading, explanation, proceed);
    const incoming: HTMLElement[] = [image, resultHeading, explanation];
    if (context.loss) {
      const lost = document.createElement("div");
      lost.className = "result-supply";
      lost.innerHTML = lostSupplyEmblem(context.loss.supply);
      explanation.after(lost);
      incoming.push(lost);
    }
    incoming.push(proceed);
    if (!reducedMotion.matches) {
      gsap.set(incoming, { opacity: 0, y: 10 });
      const resultHeight = roll.getBoundingClientRect().height;
      gsap.set(roll, { height: previousHeight, overflow: "hidden" });
      await playTimeline((tl) => {
        tl.to(
          roll,
          {
            height: resultHeight,
            duration: 0.45,
            ease: "power2.inOut",
            clearProps: "height,overflow",
          },
          0,
        );
        tl.to(
          incoming,
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            stagger: 0.08,
            ease: "power2.out",
            clearProps: "opacity,transform",
          },
          0.08,
        );
      });
    }
    proceed.disabled = false;
    await new Promise<void>((resolve) => {
      proceed.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          proceed.disabled = true;
          resolve();
        },
        { once: true },
      );
      proceed.focus({ preventScroll: true });
    });
    if (!reducedMotion.matches)
      await playTimeline((tl) => {
        tl.to(roll, { opacity: 0, duration: 0.22 });
      });
  } finally {
    roll.remove();
    await overlay.close();
  }
}
type ActionResult = {
  owner?: number;
  title: string;
  text: string;
  visual?: string;
  image?: string;
  drawn?: TrailCard;
  death?: boolean;
  encounter?: boolean;
  continueLabel?: string;
};
function actionResult(
  d: DOMStringMap,
  before: Journey,
  action: GameAction,
  played?: TrailCard,
): ActionResult | undefined {
  const actor = before.players[before.current];
  if (d.action === "draw") {
    const drawn = game.state.players[before.current].hand.find(
      (c) => !actor.hand.some((old) => old.id === c.id),
    );
    return {
      owner: before.current,
      title: drawn ? "Your new card" : "No cards left",
      text: drawn
        ? "Added to your hand. It can be played on a later turn."
        : "The trail deck is empty. Your turn is over.",
      drawn,
    };
  }
  if (d.take)
    return {
      title: "Supply packed",
      text: `${names[d.take as Supply]} added to ${actor.name}’s supplies.`,
      visual: supplyEmblem(d.take as Supply),
    };
  if (d.cure || d.town) {
    const h = before.hazards.find((h) => h.id === Number(d.cure ?? d.town));
    if (!h) return;
    const remaining = game.state.hazards.find((x) => x.id === h.id);
    if (d.town && h.kind === "grass")
      return {
        title: "Fresh grazing for the oxen",
        image: art.town,
        text: "The town has pasture to spare. The oxen fill their bellies, and one Inadequate Grass condition is removed from the wagon.",
      };
    return {
      image: d.town ? calamityArt[h.kind] : undefined,
      owner: wagonKinds.has(h.kind) ? undefined : h.owner,
      title: remaining
        ? wagonKinds.has(h.kind)
          ? "Remedy supplied"
          : `Remedy supplied for ${game.state.players[h.owner].name}’s ${titles[h.kind].toLowerCase()}`
        : remedyTitle(h.kind, h.owner),
      text: remaining
        ? `${wagonKinds.has(h.kind) ? "The wagon" : game.state.players[h.owner].name} still needs more supplies to resolve ${titles[h.kind].toLowerCase()}.`
        : wagonKinds.has(h.kind)
          ? "This wagon condition is no longer active."
          : `${game.state.players[h.owner].name} no longer has ${titles[h.kind].toLowerCase()}.`,
      visual: d.supply ? supplyEmblem(d.supply as Supply) : undefined,
    };
  }
  if (d.action === "trade") {
    const kind = action.args?.["trade-kind"] as Supply;
    const recipient = Number(action.args?.["trade-recipient"]);
    return {
      owner: recipient,
      title: "Trade complete",
      text: `Two supplies exchanged for ${names[kind].toLowerCase()}, packed for ${before.players[recipient].name}.`,
      visual: supplyEmblem(kind),
    };
  }
  if (d.discard !== undefined) {
    const kind = before.players[Number(d.owner)].supplies[Number(d.discard)];
    return {
      title: "Supply lost",
      text: `${before.players[Number(d.owner)].name} lost ${names[kind].toLowerCase()}.`,
      image: before.pending === "thief" ? calamityArt.thief : riverArt.loss,
      visual: lostSupplyEmblem(kind),
    };
  }
  // Actions that only enter the next prompt or finish a chosen step don't need
  // another acknowledgement. Actual reveals and inventory results above do.
}
function deathResult(owner: number, before: Journey): ActionResult {
  const player = game.state.players[owner];
  const cause = player.deathCause || "unknown causes";
  const kind = (Object.keys(titles) as Calamity[]).find(
    (key) => titles[key].toLowerCase() === cause.toLowerCase(),
  );
  const expired = before.hazards.find(
    (hazard) => hazard.owner === owner && hazard.kind === kind,
  );
  const explanation = expired
    ? `${titles[expired.kind]} went unremedied before time ran out.`
    : "The trail took a life the wagon could not save.";
  return {
    owner,
    death: true,
    title: `${player.name} died of ${cause.toLowerCase()}`,
    image: kind
      ? calamityArt[kind]
      : /drown/i.test(cause)
        ? riverArt.drowning
        : art.legacy,
    text: `${player.name} died${deathJourneyText(player)}. ${explanation} ${game.state.players.some((p) => p.alive) ? "The wagon falls quiet. Their remaining supplies can be willed to the companions carrying on." : "No travellers remain. Here, the journey ends; the prairie remembers them."}`,
  };
}
async function revealActionResult(result: ActionResult) {
  const overlay = createInterstitial(result.title);
  const state = overlay.panel;
  try {
    const content = document.createElement("template");
    content.innerHTML = `<div class="action-result ${result.death ? "death-result" : result.encounter ? "encounter-reveal" : ""}"><h3 class="result-heading">${result.owner !== undefined ? portraitImage(game.state.players[result.owner].portrait ?? result.owner % 6) : ""}${result.death ? `<img class="result-death-icon" src="${art.tombstoneIcon}" alt="Gravestone">` : ""}<span>${escape(result.title)}</span></h3>${result.image ? `<img class="result-artwork" src="${result.image}" alt="${escape(result.title)}">` : ""}${result.drawn ? `<div class="revealed-card is-face-down"><div class="drawn-card-rotor"><div class="drawn-card-back" aria-hidden="true"><span><img src="${art.progressWagon}" alt=""></span><small>Click to reveal</small></div><div class="drawn-card-front" aria-hidden="true">${card(result.drawn)}<strong>${label(result.drawn)}</strong>${result.drawn.type === "river" ? riverFailureTag(!!result.drawn.deadly) : `<p>${description(result.drawn)}</p>`}</div></div></div>` : result.visual ? `<div class="result-supply">${result.visual}</div>` : ""}<p class="result-message">${escape(result.text)}</p><button class="result-continue" disabled>${escape(result.continueLabel ?? "Continue →")}</button></div>`;
    reconcile(state, content.content);
    const drawn = state.querySelector<HTMLElement>(".revealed-card");
    const message = state.querySelector<HTMLElement>(".result-message")!;
    if (drawn) {
      message.hidden = true;
      drawn.setAttribute("role", "button");
      drawn.setAttribute("aria-label", "Flip your new card");
      drawn.tabIndex = 0;
    }
    await overlay.show();
    if (drawn) {
      drawn.focus({ preventScroll: true });
      await new Promise<void>((resolve) => {
        const flip = (event: Event) => {
          if (
            event instanceof KeyboardEvent &&
            !["Enter", " "].includes(event.key)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          drawn.removeEventListener("click", flip);
          drawn.removeEventListener("keydown", flip);
          resolve();
        };
        drawn.addEventListener("click", flip);
        drawn.addEventListener("keydown", flip);
      });
      drawn.removeAttribute("role");
      drawn.removeAttribute("aria-label");
      drawn.removeAttribute("tabindex");
      const rotor = drawn.querySelector<HTMLElement>(".drawn-card-rotor")!;
      if (reducedMotion.matches) gsap.set(rotor, { rotationY: 180 });
      else
        await playTimeline((tl) => {
          tl.fromTo(
            rotor,
            { rotationY: 0 },
            {
              rotationY: 180,
              duration: 0.55,
              ease: "power2.inOut",
            },
          );
        });
      drawn.classList.remove("is-face-down");
      drawn.querySelector(".drawn-card-front")!.removeAttribute("aria-hidden");
      message.hidden = false;
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.fromTo(
            message,
            { opacity: 0, y: 4 },
            {
              opacity: 1,
              y: 0,
              duration: 0.16,
              clearProps: "opacity,transform",
            },
          ),
        );
    }
    const proceed = state.querySelector<HTMLButtonElement>(".result-continue")!;
    proceed.disabled = false;
    proceed.focus({ preventScroll: true });
    await new Promise<void>((resolve) =>
      proceed.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          proceed.disabled = true;
          resolve();
        },
        { once: true },
      ),
    );
  } finally {
    await overlay.close();
  }
}
async function revealWills() {
  while (game.state.phase === "legacy" && game.state.deaths.length) {
    const owner = game.state.deaths[0];
    const dead = game.state.players[owner];
    const overlay = createInterstitial(`Farewell, ${dead.name}`);
    willPanel = overlay.panel;
    willPanel.classList.add("farewell-interstitial");
    willPanel.innerHTML = `<h2>Farewell, ${escape(dead.name)}.</h2><p>Leave up to two supplies to your companions. The rest return to the shop.</p><div class="legacy-layout">${memorial(owner)}${willEditor()}</div>`;
    try {
      await overlay.show();
      await new Promise<void>((resolve) => {
        overlay.panel.addEventListener("click", (event) => {
          const commit = (event.target as Element).closest<HTMLButtonElement>(
            '[data-action="will-supplies"]',
          );
          if (!commit) return;
          event.stopPropagation();
          if (
            willDraft.size > 2 - game.state.legacyCount ||
            [...willDraft].some(
              ([index, recipient]) =>
                !dead.supplies[index] || !game.living.includes(recipient),
            )
          )
            return;
          commit.disabled = true;
          dead.epitaph =
            overlay.panel.querySelector<HTMLTextAreaElement>("#epitaph")!.value;
          for (const [index, recipient] of [...willDraft].sort(
            (a, b) => b[0] - a[0],
          ))
            game.will(index, recipient);
          game.closeWill();
          persist({
            type: "will-supplies",
            args: {
              epitaph: dead.epitaph,
              recipients: [...willDraft].map(
                ([index, recipient]) => `${index}:${recipient}`,
              ),
            },
          });
          willDraftOwner = -1;
          willDraft.clear();
          selectedWillSupply = null;
          resolve();
        });
      });
    } finally {
      willPanel = undefined;
      await overlay.close();
    }
  }
}
async function revealJourneyEnd() {
  const s = game.state;
  const won = s.status === "won";
  const title = won ? "Oregon. At long last." : "The trail falls silent.";
  const survivors = s.players.filter((p) => p.alive);
  const days = s.turn - 1;
  const description = won
    ? "The wheels can rest. You made it to the Willamette Valley—put the kettle on, and let tomorrow wait. One survivor brings a victory home for everyone."
    : survivors.length
      ? "The wagon can go no farther. Oregon is still beyond the horizon, but every mile travelled belongs to your story."
      : "No one remains to guide the wagon. The prairie keeps their names, and the trail remembers every mile.";
  const overlay = createInterstitial(title);
  overlay.panel.classList.add(
    "journey-finale",
    won ? "journey-victory" : "journey-defeat",
  );
  overlay.panel.innerHTML = `<div class="finale-art"><img src="${won ? art.victory : art.defeat}" alt="${won ? "A wagon arrives at a welcoming Oregon homestead" : "An abandoned wagon and grave markers on the quiet prairie"}"></div><div class="finale-copy"><span class="finale-eyebrow">${won ? "Journey complete" : "Journey’s end"}</span><h2>${title}</h2><p>${escape(description)}</p>${!won && survivors.length ? `<p class="finale-cause">${escape(s.note)}</p>` : ""}<div class="finale-stats"><span><strong>${days}</strong>day${days === 1 ? "" : "s"} on the trail</span><span><strong>${s.count} / 50</strong>trail cards</span><span><strong>${survivors.length} / ${s.players.length}</strong>travellers remaining</span></div><div class="finale-party">${s.players.map((p, index) => `<div class="finale-traveller ${p.alive ? "" : "fallen"}">${p.alive ? portraitImage(p.portrait ?? index % 6) : `<img class="finale-grave" src="${art.tombstoneIcon}" alt="">`}<span>${escape(p.name)}</span>${!p.alive ? `<small>${escape(p.deathCause ?? "Lost on the trail")}</small>` : ""}</div>`).join("")}</div>${renderJourneyMapPreview(s, true)}<button class="finale-continue" disabled>View journey →</button></div>`;
  const artwork = overlay.panel.querySelector(".finale-art img")!;
  const copy = overlay.panel.querySelector(".finale-copy")!;
  if (!reducedMotion.matches) {
    gsap.set(artwork, { scale: 1.08 });
    gsap.set(copy, { opacity: 0, y: 14 });
  }
  let openMap = false;
  try {
    await overlay.show();
    if (!reducedMotion.matches)
      await playTimeline((tl) => {
        tl.to(artwork, { scale: 1, duration: 1.1, ease: "power2.out" }, 0);
        tl.to(
          copy,
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "power2.out",
            clearProps: "opacity,transform",
          },
          0.15,
        );
      });
    const proceed =
      overlay.panel.querySelector<HTMLButtonElement>(".finale-continue")!;
    proceed.disabled = false;
    const mapButton =
      overlay.panel.querySelector<HTMLButtonElement>(".finale-map");
    if (mapButton) mapButton.disabled = false;
    proceed.focus({ preventScroll: true });
    await new Promise<void>((resolve) => {
      const finish = (event: Event) => {
        event.stopPropagation();
        openMap = event.currentTarget === mapButton;
        proceed.disabled = true;
        if (mapButton) mapButton.disabled = true;
        resolve();
      };
      proceed.addEventListener("click", finish, { once: true });
      mapButton?.addEventListener("click", finish, { once: true });
    });
  } finally {
    await overlay.close();
  }
  if (openMap && history?.archive.active) {
    selectedJourneyMap = history.archive.active;
    mapReturnView = "journey";
    showStatistics = true;
    showJourneys = false;
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
function calamityResultText(
  kind: Calamity | undefined,
  note: string,
  owner: number,
  loss?: SupplyLoss,
) {
  return kind === "snake" || kind === "dysentery"
    ? `${game.state.players[owner].name} died of ${titles[kind]}${deathJourneyText(game.state.players[owner])}. Their remaining supplies may be willed to companions.`
    : kind === "hunting"
      ? note
      : kind === "thief"
        ? loss
          ? `A thief struck while ${game.state.players[owner].name} was minding the wagon. ${game.state.players[loss.owner].name} lost ${names[loss.supply].toLowerCase()}.`
          : note
        : kind && ["axle", "tongue", "wheel"].includes(kind)
          ? "The wagon needs a repair. Try your luck after continuing."
          : kind
            ? conditionDescription(kind, owner) || note
            : note;
}
async function revealCalamity(
  kind: Calamity | undefined,
  note: string,
  casualties: string[],
  owner: number,
  loss?: SupplyLoss,
) {
  const overlay = createInterstitial(
    kind ? conditionTitle(kind, owner) : "Calamity result",
  );
  const state = overlay.panel;
  try {
    const details = calamityResultText(kind, note, owner, loss);
    const death = casualties.includes(game.state.players[owner].name);
    const additionalCasualties = casualties.filter(
      (name) => !details.includes(`${name} died`),
    );
    const image = kind ? calamityArt[kind] : undefined;
    const content = document.createElement("template");
    content.innerHTML = `<div class="calamity-result"><div class="action-summary">${image ? `<img class="action-artwork" src="${image}" alt="${titles[kind!]}">` : ""}<div class="action-copy"><h3 class="result-heading">${kind && !wagonKinds.has(kind) ? portraitImage(game.state.players[owner].portrait ?? owner % 6) : ""}${death ? `<img class="result-death-icon" src="${art.tombstoneIcon}" alt="" aria-hidden="true">` : ""}<span>${escape(kind ? conditionTitle(kind, owner) : "No calamity")}</span></h3><p class="result-message">${escape(details)}</p>${loss ? `<div class="result-supply">${lostSupplyEmblem(loss.supply)}</div>` : ""}${additionalCasualties.length ? `<p class="calamity-casualties">${additionalCasualties.map(escape).join(", ")} ${additionalCasualties.length === 1 ? "has" : "have"} died.</p>` : ""}</div></div><button class="calamity-continue">Continue →</button></div>`;
    reconcile(state, content.content);
    await overlay.show();
    const proceed =
      state.querySelector<HTMLButtonElement>(".calamity-continue")!;
    proceed.focus({ preventScroll: true });
    await new Promise<void>((resolve) =>
      proceed.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          proceed.disabled = true;
          resolve();
        },
        { once: true },
      ),
    );
  } finally {
    await overlay.close();
  }
}
app.addEventListener("click", async (event) => {
  const summary = (event.target as HTMLElement).closest("summary");
  if (summary) {
    event.preventDefault();
    if (busy) return;
    const details = summary.closest("details")!;
    const content = details.querySelector<HTMLElement>(".help-content")!;
    const opening = !details.open;
    gsap.killTweensOf(content);
    if (reducedMotion.matches) {
      details.open = opening;
      return;
    }
    if (opening) {
      details.open = true;
      gsap.fromTo(
        content,
        { height: 0, opacity: 0 },
        {
          height: "auto",
          opacity: 1,
          duration: 0.4 / animationRate,
          clearProps: "all",
        },
      );
    } else
      gsap.to(content, {
        height: 0,
        opacity: 0,
        duration: 0.25 / animationRate,
        onComplete: () => {
          details.open = false;
          gsap.set(content, { clearProps: "all" });
        },
      });
    return;
  }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  );
  if (!button || button.disabled) return;
  if (button.dataset.action === "expand-top") {
    document.documentElement.style.setProperty(
      "--top-toggle-min-height",
      `${window.scrollY + innerHeight}px`,
    );
    topExpandedManually = !topExpandedManually;
    document.body.classList.toggle(
      "top-expanded-manually",
      topExpandedManually,
    );
    updateHeaderSize();
    scheduleStickyPanels();
    return;
  }
  if (busy) return;
  if (button.dataset.action === "trail-end") {
    const strip = app.querySelector<HTMLElement>(".trail-strip");
    if (strip) {
      gsap.killTweensOf(strip);
      const end = strip.scrollWidth - strip.clientWidth;
      if (reducedMotion.matches) {
        strip.scrollLeft = end;
        updateTrailReturnButton();
      } else
        gsap.to(strip, {
          scrollLeft: end,
          duration: 0.35,
          ease: "power2.out",
          onComplete: updateTrailReturnButton,
        });
    }
    return;
  }
  if (button.dataset.action === "simulation-resume") {
    await runSimulation();
    return;
  }
  if (button.dataset.controllerPlayer !== undefined) {
    if (!setup) return;
    const index = Number(button.dataset.controllerPlayer);
    const controller = button.dataset.controllerValue;
    if (!party[index] || !["human", "computer"].includes(controller ?? ""))
      return;
    party[index].controller = controller as "human" | "computer";
    const picker = button.closest(".controller-picker")!;
    picker.querySelector(".controller-picker-label")!.textContent =
      controller === "computer" ? "Computer" : "Human";
    picker
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((choice) =>
        choice.setAttribute(
          "aria-pressed",
          String(choice.dataset.controllerValue === controller),
        ),
      );
    return;
  }
  if (
    !setup &&
    game.state.players[game.state.current].controller === "computer"
  )
    computerSequenceOwner = game.state.current;
  const previousState = `${game.state.phase}:${game.state.pending}:${game.state.status}:${game.state.used}`;
  const beforeResult = structuredClone(game.state);
  const previousTurn = game.state.turn;
  const previousPlayer = game.state.current;
  const wasSetup = setup;
  const rollContext: RollContext = {
    phase: game.state.phase,
    traveller: game.player.name,
    player: game.state.current,
    deadly: !!game.top?.deadly,
    calamity: game.state.pending ? titles[game.state.pending] : "Wagon repair",
    calamityKind: game.state.pending ?? undefined,
  };
  const d = button.dataset;
  const playedCard =
    d.play !== undefined ? game.player.hand[Number(d.play)] : undefined;
  const playingCalamity =
    d.play !== undefined &&
    game.player.hand[Number(d.play)]?.type === "calamity";
  const previousSurvivors = game.state.players.map((p) => p.alive);
  revealedCalamity = undefined;
  const pickupSource =
    d.play !== undefined
      ? button.querySelector(".card-art")
      : d.take
        ? button.querySelector(".supply-stack")
        : d.cure && d.supply
          ? app.querySelector(
              `.turn-header [data-supply-kind="${d.supply}"] .supply-stack`,
            )
          : null;
  const remedyHazard = d.cure
    ? beforeResult.hazards.find((h) => h.id === Number(d.cure))
    : undefined;
  const remedyDestination = remedyHazard
    ? wagonKinds.has(remedyHazard.kind)
      ? app.querySelector(
          `[data-ui-key="wagon-condition-${remedyHazard.id}"] img`,
        )
      : app.querySelector(
          `.players [data-ui-key="condition-${remedyHazard.id}"]`,
        )
    : undefined;
  if (d.action === "clear-storage") {
    if (
      window.confirm(
        "Clear all local storage for this site? This removes saved journeys and game history.",
      )
    ) {
      try {
        localStorage.clear();
        window.location.reload();
      } catch {
        window.alert("Local storage could not be cleared.");
      }
    }
    return;
  }
  const action: GameAction = {
    type:
      d.action ??
      Object.keys(d).find(
        (key) => !["player", "owner", "supply"].includes(key),
      ) ??
      "unknown",
    args: { ...d },
  };
  // Capture choices before the DOM or game state changes (trades, wills, epitaphs).
  app.querySelectorAll<HTMLSelectElement>("select[id]").forEach((select) => {
    action.args![select.id] = select.value;
  });
  action.args!.payments = Array.from(
    app.querySelectorAll<HTMLInputElement>('input[name="payment"]:checked'),
  ).map((input) => input.value);
  const epitaph = app.querySelector<HTMLInputElement>("#epitaph");
  if (epitaph) action.args!.epitaph = epitaph.value;
  if (d.action === "will-supplies")
    action.args!.bequests = [...willDraft].map(
      ([index, recipient]) => `${index}:${recipient}`,
    );
  let changed = false;
  if (setup)
    party = Array.from(
      app.querySelectorAll<HTMLInputElement>(".player-name"),
    ).map((e, i) => ({ ...party[i], name: e.value }));
  if (d.action === "simulate") {
    await startSimulation();
    return;
  }
  if (d.action === "trade") {
    const payments = Array.from(
      app.querySelectorAll<HTMLInputElement>("[name=payment]:checked"),
    ).map((e) => {
      const [player, index] = e.value.split(":").map(Number);
      return { player, index };
    });
    changed = game.trade(
      payments,
      (app.querySelector("#trade-kind") as HTMLSelectElement).value as Supply,
      Number(
        (app.querySelector("#trade-recipient") as HTMLSelectElement).value,
      ),
    );
    if (!changed) {
      app.querySelector("#trade-error")!.textContent =
        "Choose exactly two available supplies and an available shop card.";
      return;
    }
    app
      .querySelectorAll<HTMLInputElement>('[name="payment"]:checked')
      .forEach((input) => (input.checked = false));
    app.querySelector<HTMLSelectElement>("#trade-kind")!.value = "";
  } else if (d.action === "cancel") {
    confirming = false;
    changed = true;
  } else if (d.action === "confirm-new") {
    setup = true;
    confirming = false;
    party = randomParty(game.state.players.length);
    partyKeys = party.map(() => crypto.randomUUID());
    firstPlayer = 0;
    portraitPicker = null;
    changed = true;
  } else if (d.action === "add") {
    if (!setup || party.length === 6) return;
    const available = portraitSlots.filter(
      (slot) => !party.some((p) => p.portrait === slot),
    );
    const selectedPortrait =
      available[Math.floor(Math.random() * available.length)];
    partyKeys.push(crypto.randomUUID());
    party.push({
      name: randomName(
        party.map((p) => p.name),
        Math.random,
        selectedPortrait,
      ),
      portrait: selectedPortrait,
    });
    setBusy(true);
    try {
      const grid = app.querySelector(".traveller-grid")!;
      grid.insertAdjacentHTML(
        "beforeend",
        travellerCard(party[party.length - 1], party.length - 1),
      );
      const added = grid.lastElementChild!;
      app.querySelector(".setup-toolbar > span")!.textContent =
        `${party.length} travellers aboard`;
      button.disabled = party.length === 6;
      app
        .querySelectorAll<HTMLButtonElement>("[data-remove-traveller]")
        .forEach((remove) => {
          remove.disabled = false;
          remove.title = "Remove traveller";
        });
      updateLeader();
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.fromTo(
            added,
            { opacity: 0, y: 10 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              clearProps: "opacity,transform",
            },
          ),
        );
      if (button.disabled)
        added
          .querySelector<HTMLInputElement>(".player-name")
          ?.focus({ preventScroll: true });
      else button.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.removeTraveller !== undefined) {
    const index = Number(d.removeTraveller);
    if (!setup || party.length <= 2 || !party[index]) return;
    setBusy(true);
    try {
      const card = app.querySelector(`[data-traveller="${index}"]`)!;
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.to(card, { opacity: 0, scale: 0.96, duration: 0.2 }),
        );
      party.splice(index, 1);
      partyKeys.splice(index, 1);
      if (firstPlayer > index) firstPlayer--;
      else if (firstPlayer === index)
        firstPlayer = Math.min(index, party.length - 1);
      portraitPicker = null;
      const grid = app.querySelector(".traveller-grid")!;
      const remainingCards = document.createElement("template");
      remainingCards.innerHTML = party.map(travellerCard).join("");
      reconcile(grid, remainingCards.content);
      app.querySelector(".setup-toolbar > span")!.textContent =
        `${party.length} travellers aboard`;
      app.querySelector<HTMLButtonElement>('[data-action="add"]')!.disabled =
        false;
      updateLeader();
      app
        .querySelector<HTMLButtonElement>(
          `[data-remove-traveller="${Math.min(index, party.length - 1)}"]:not(:disabled), [data-action="add"]`,
        )
        ?.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.action === "start") {
    const startDate = nextJourneyStartDate(
      history
        ? history.archive.games.map((record) => record.initial.startDate)
        : game.state.started
          ? [game.state.startDate]
          : [],
    );
    changed = game.reset(
      party.map((p) => p.name),
      firstPlayer,
      party.map((p) => p.portrait),
    );
    if (changed) {
      game.state.players.forEach(
        (player, i) => (player.controller = party[i].controller ?? "human"),
      );
      computerPaused = false;
      game.state.startDate = startDate;
      setup = false;
    } else {
      Array.from(app.querySelectorAll<HTMLInputElement>(".player-name"))
        .find((input) => !input.checkValidity())
        ?.reportValidity();
      return;
    }
  } else if (d.leader !== undefined) {
    firstPlayer = Number(d.leader);
    app.querySelectorAll<HTMLButtonElement>("[data-leader]").forEach((icon) => {
      const selected = Number(icon.dataset.leader) === firstPlayer;
      icon.setAttribute("aria-pressed", String(selected));
      icon.classList.toggle("selected", selected);
    });
    app.querySelector(".leader-name")!.textContent = party[firstPlayer].name;
    return;
  } else if (d.action === "randomize") {
    party = randomParty(party.length, party).map((p, i) => ({
      ...p,
      controller: party[i].controller ?? "human",
    }));
    portraitPicker = null;
    setBusy(true);
    try {
      const grid = app.querySelector(".traveller-grid")!;
      const people = document.createElement("template");
      people.innerHTML = party.map(travellerCard).join("");
      const updates = reconcile(grid, people.content);
      updateLeader();
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.fromTo(
            updates,
            { opacity: 0, y: 10 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              stagger: 0.035,
              clearProps: "opacity,transform",
            },
          ),
        );
      button.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.picker !== undefined || d.portrait !== undefined) {
    const previous = portraitPicker;
    const index = Number(d.picker ?? d.player);
    if (d.portrait !== undefined) {
      party[index].portrait = Number(d.portrait);
      portraitPicker = null;
    } else portraitPicker = portraitPicker === index ? null : index;
    setBusy(true);
    try {
      for (const i of new Set(
        [previous, index].filter((n): n is number => n !== null),
      )) {
        const old = app.querySelector(`[data-traveller="${i}"]`);
        const template = document.createElement("template");
        template.innerHTML = travellerCard(party[i], i);
        if (old) reconcile(old, template.content.firstElementChild!);
      }
      updateLeader();
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.fromTo(
            app.querySelector(
              `[data-traveller="${index}"] ${portraitPicker === index ? ".portrait-picker" : ".portrait-choice .portrait"}`,
            ),
            { opacity: 0, y: 4 },
            {
              opacity: 1,
              y: 0,
              duration: 0.25,
              clearProps: "opacity,transform",
            },
          ),
        );
      app
        .querySelector<HTMLButtonElement>(
          portraitPicker === index
            ? `[data-player="${index}"][data-portrait]`
            : `[data-picker="${index}"]`,
        )
        ?.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.action === "resume") {
    setup = false;
    changed = true;
  } else if (d.action === "shop") {
    setBusy(true);
    shopOpen = !shopOpen;
    const panel = button.closest(".shop")!;
    const content = panel.querySelector<HTMLElement>(".shop-content")!;
    button.setAttribute("aria-expanded", String(shopOpen));
    panel.classList.toggle("is-open", shopOpen);
    try {
      if (shopOpen) content.hidden = false;
      if (!reducedMotion.matches)
        await playTimeline((tl) => {
          if (shopOpen)
            tl.fromTo(
              content,
              { height: 0, opacity: 0 },
              {
                height: "auto",
                opacity: 1,
                duration: 0.45,
                ease: "power2.inOut",
              },
            );
          else
            tl.to(content, {
              height: 0,
              opacity: 0,
              duration: 0.3,
              ease: "power2.inOut",
            });
        });
      content.hidden = !shopOpen;
      gsap.set(content, { clearProps: "height,opacity" });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.play !== undefined) changed = game.play(Number(d.play));
  else if (d.rotate !== undefined) {
    const index = Number(d.rotate);
    if (!game.rotate(index)) return;
    setBusy(true);
    persist(action);
    try {
      const old = button.closest(".hand-card")!;
      const road = old.querySelector(".road-rotation");
      if (!reducedMotion.matches && road)
        await playTimeline((tl) =>
          tl.fromTo(
            road,
            { rotation: 0, transformOrigin: "50% 50%" },
            { rotation: 180, duration: 0.45, ease: "power2.inOut" },
          ),
        );
      // The new path encodes its rotated orientation; discard the tween transform
      // and invalidate GSAP's cached angle before this same road wrapper is used again.
      if (road) gsap.set(road, { clearProps: "all" });
      const template = document.createElement("template");
      template.innerHTML = handCard(game.player.hand[index], index);
      const updated = template.content.firstElementChild!;
      old.className = updated.className;
      reconcile(old, updated);
      const choices = app.querySelector(".turn-state");
      if (choices) {
        const prompt = document.createElement("template");
        prompt.innerHTML = decision();
        reconcile(choices, prompt.content.querySelector(".turn-state")!);
      }
      app
        .querySelector<HTMLButtonElement>(`[data-rotate="${index}"]`)
        ?.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.cure) changed = game.cure(Number(d.cure), d.supply as Supply);
  else if (d.take) changed = game.takeSupply(d.take as Supply);
  else if (d.town) changed = game.townCure(Number(d.town));
  else if (d.discard !== undefined)
    changed = game.discardSupply(Number(d.owner), Number(d.discard));
  else if (d.action === "will-supplies") {
    if (
      game.state.phase !== "legacy" ||
      willDraft.size > 2 - game.state.legacyCount ||
      [...willDraft].some(
        ([index, recipient]) =>
          !game.state.players[game.state.deaths[0]].supplies[index] ||
          !game.living.includes(recipient),
      )
    )
      return;
    game.state.players[game.state.deaths[0]].epitaph = (
      app.querySelector("#epitaph") as HTMLTextAreaElement
    ).value;
    for (const [index, recipient] of [...willDraft].sort((a, b) => b[0] - a[0]))
      game.will(index, recipient);
    changed = game.closeWill();
    willDraftOwner = -1;
    willDraft.clear();
    selectedWillSupply = null;
  } else if (d.action === "roll") changed = game.cross();
  else if (d.action === "repair") changed = game.repair();
  else if (d.action === "draw") changed = game.draw();
  else if (d.action === "skip") changed = game.skip();
  else if (d.action === "end") changed = game.endSupplies();
  else if (d.action === "leave") changed = game.leaveShop();
  if (!changed) {
    setBusy(false);
    return;
  }
  setBusy(true);
  // Newly encountered crossings and repairs resolve in the same reveal sequence.
  if (playedCard?.type === "river" && game.state.phase === "river") {
    rollContext.phase = "river";
    rollContext.deadly = !!playedCard.deadly;
  } else if (playingCalamity && game.state.phase === "repair") {
    rollContext.phase = "repair";
    rollContext.calamityKind = game.state.pending ?? undefined;
    rollContext.calamity = titles[game.state.pending!];
  }
  const automaticLoss =
    game.state.lastSupplyLoss?.sequence !==
    beforeResult.lastSupplyLoss?.sequence
      ? game.state.lastSupplyLoss
      : undefined;
  rollContext.loss = automaticLoss;
  recordTrailResult(d, beforeResult, playedCard);
  const grassKilledOxen =
    playingCalamity &&
    revealedCalamity === "grass" &&
    game.state.hazards.some(
      (h) =>
        h.kind === "oxen" &&
        h.virtual &&
        !beforeResult.hazards.some((old) => old.id === h.id),
    );
  const deadOxenResult =
    "The oxen have run out of grass—and road. A second inadequate-grass calamity has killed them. The wagon is stopped: give one Oxen supply within one round, or the journey ends.";
  if (grassKilledOxen && playedCard?.journeyStep) {
    game.state.trailReports?.[playedCard.journeyStep]?.results?.push(
      deadOxenResult,
    );
  }
  const shouldScrollTrail = d.play !== undefined;
  persist(action);
  if (!d.cure) refreshPlayerSummaries(previousPlayer);
  const pendingTile = playedCard
    ? reservePlayedTrailTile(
        playedCard,
        !!pickupSource && !reducedMotion.matches,
      )
    : undefined;
  try {
    const affectedCondition =
      remedyHazard ??
      (d.town
        ? beforeResult.hazards.find((h) => h.id === Number(d.town))
        : undefined);
    const globalDestination =
      playedCard || d.action === "roll"
        ? app.querySelector(".trail-area")
        : affectedCondition
          ? wagonKinds.has(affectedCondition.kind)
            ? app.querySelector(".wagon-state")
            : app.querySelector(
                `[data-ui-key="player-${affectedCondition.owner}"]`,
              )
          : d.action === "repair"
            ? (app.querySelector(".wagon-state") ??
              app.querySelector(".trail-area"))
            : null;
    await scrollUpToState(globalDestination);
    if (
      shouldScrollTrail &&
      (d.play === undefined || !pickupSource || reducedMotion.matches)
    )
      await scrollTrailToEnd();
    if (pickupSource && !reducedMotion.matches) {
      let destination: Element | null = null;
      if (d.play !== undefined && pendingTile) {
        await scrollTrailToEnd();
        destination = pendingTile.firstElementChild;
      } else if (d.cure && remedyDestination) {
        destination = remedyDestination;
      } else if (d.take) {
        const bag = app.querySelector(".supply-hand > div");
        if (bag) {
          destination = bag.querySelector(
            `[data-supply-kind="${d.take}"] .supply-stack`,
          );
          if (!destination) {
            const item = document.createElement("template");
            item.innerHTML = supplyEmblem(d.take as Supply);
            bag.append(item.content);
            destination = bag.querySelector(
              `[data-supply-kind="${d.take}"] .supply-stack`,
            );
          }
        }
      }
      if (destination)
        await flyPickup(
          pickupSource,
          destination,
          playedCard
            ? (button.closest<HTMLElement>(".hand-card") ?? undefined)
            : undefined,
          (d.take ?? d.supply) as Supply | undefined,
        );
    }
    if (d.cure) refreshPlayerSummaries(previousPlayer);
    const supplies = app.querySelector(".turn-header .supply-hand");
    if (supplies) {
      const inventory = document.createElement("template");
      inventory.innerHTML = playerSupplies(previousPlayer);
      reconcile(supplies, inventory.content.firstElementChild!);
    }
    if (playedCard?.type === "river" && game.state.phase === "river") {
      await revealActionResult({
        owner: previousPlayer,
        encounter: true,
        title: "River crossing",
        image: playedCard.deadly ? riverArt.raging : riverArt.moderate,
        text: playedCard.deadly
          ? "A raging river blocks the trail. Brave the current to bring the wagon across. Risk: drowning."
          : "The wagon reaches a river. Find a way through the current to the far bank. Risk: losing a supply.",
        continueLabel: "Roll to ford",
      });
      const beforeCrossing = structuredClone(game.state);
      game.cross();
      rollContext.loss =
        game.state.lastSupplyLoss?.sequence !==
        beforeCrossing.lastSupplyLoss?.sequence
          ? game.state.lastSupplyLoss
          : undefined;
      recordTrailResult({ action: "roll" }, beforeCrossing);
      persist({ type: "roll" });
      refreshPlayerSummaries(previousPlayer);
    }
    if (
      playingCalamity &&
      game.state.phase === "repair" &&
      game.state.pending
    ) {
      const kind = game.state.pending;
      await revealActionResult({
        encounter: true,
        title: titles[kind],
        image: calamityArt[kind],
        text: "The wagon has broken down. Try a repair to get the wheels turning again.",
        continueLabel: "Roll to repair",
      });
      const beforeRepair = structuredClone(game.state);
      game.repair();
      recordTrailResult({ action: "repair" }, beforeRepair);
      persist({ type: "repair" });
      refreshPlayerSummaries(previousPlayer);
    }
    if (
      playingCalamity &&
      pendingRolls.length === 0 &&
      (revealedCalamity === "thief" ||
        !["repair", "discard"].includes(game.state.phase))
    )
      await revealCalamity(
        revealedCalamity,
        game.state.note,
        game.state.players
          .filter((p, i) => previousSurvivors[i] && !p.alive)
          .map((p) => p.name),
        previousPlayer,
        automaticLoss,
      );
    if (grassKilledOxen)
      await revealActionResult({
        encounter: true,
        title: "Dead oxen",
        image: calamityArt.oxen,
        text: deadOxenResult,
      });
    const hadDiceResult = pendingRolls.length > 0;
    for (const n of pendingRolls.splice(0)) await tumbleDie(n, rollContext);
    if (!playingCalamity && !hadDiceResult) {
      const result = d.take
        ? undefined
        : actionResult(d, beforeResult, action, playedCard);
      const casualties = game.state.players.flatMap((p, i) =>
        beforeResult.players[i].alive && !p.alive ? [i] : [],
      );
      if (result) await revealActionResult(result);
      for (const owner of casualties)
        await revealActionResult(deathResult(owner, beforeResult));
    }
    if (game.state.mode !== "simulation" && game.state.phase === "legacy")
      await revealWills();
    if (
      !wasSetup &&
      beforeResult.status === "travel" &&
      game.state.status !== "travel"
    )
      await revealJourneyEnd();
    const turnChanged =
      !wasSetup &&
      (game.state.turn !== previousTurn ||
        game.state.current !== previousPlayer);
    const stateChanged =
      !wasSetup &&
      !turnChanged &&
      previousState !==
        `${game.state.phase}:${game.state.pending}:${game.state.status}:${game.state.used}`;
    const stateSelector = ".turn-state";
    const turnSelector = ".decision";
    if (turnChanged && !reducedMotion.matches) {
      const outgoing = Array.from(
        app.querySelectorAll<HTMLElement>(turnSelector),
      );
      await playTimeline((tl) =>
        tl.to(outgoing, {
          x: -24,
          opacity: 0,
          duration: 0.24,
          stagger: 0.025,
          ease: "power2.in",
        }),
      );
    }
    if (stateChanged && !reducedMotion.matches) {
      const outgoingState = app.querySelector(stateSelector);
      if (outgoingState)
        await playTimeline((tl) =>
          tl.to(outgoingState, {
            y: -28,
            opacity: 0,
            duration: 0.24,
            ease: "power2.in",
          }),
        );
    }
    const changedSections = render();
    if (shouldScrollTrail) await scrollTrailToEnd();
    if (turnChanged && game.state.status === "travel") await scrollUpToTurn();
    const stateIncoming = stateChanged
      ? app.querySelector(stateSelector)
      : null;
    const incoming = turnChanged
      ? Array.from(app.querySelectorAll<HTMLElement>(turnSelector))
      : [];
    const otherChanges = changedSections.filter(
      (node) =>
        !incoming.some(
          (section) => section === node || section.contains(node),
        ) &&
        !(
          stateIncoming &&
          (stateIncoming === node || stateIncoming.contains(node))
        ),
    );
    if (
      !reducedMotion.matches &&
      (incoming.length || stateIncoming || otherChanges.length)
    )
      await playTimeline((tl) => {
        if (stateIncoming)
          tl.fromTo(
            stateIncoming,
            { y: 28, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.42,
              ease: "power3.out",
              clearProps: "opacity,transform",
            },
            0,
          );
        if (incoming.length)
          tl.fromTo(
            incoming,
            { opacity: 0, x: 24 },
            {
              opacity: 1,
              x: 0,
              duration: 0.42,
              stagger: 0.035,
              ease: "power3.out",
              clearProps: "opacity,transform",
            },
            0,
          );
        if (otherChanges.length)
          tl.fromTo(
            otherChanges,
            { opacity: 0, y: 7 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              stagger: 0.025,
              clearProps: "opacity,transform",
            },
            0,
          );
      });
  } finally {
    setBusy(false);
    const focus = setup
      ? d.portrait !== undefined
        ? `[data-picker="${d.player}"]`
        : d.picker !== undefined && portraitPicker !== null
          ? `[data-portrait][data-player="${portraitPicker}"]`
          : `[data-action="${d.action}"]:not(:disabled)`
      : ".decision button:not(:disabled)";
    app.querySelector<HTMLButtonElement>(focus)?.focus({ preventScroll: true });
  }
});
app.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (setup && input.classList.contains("player-name")) {
    const index = Number(input.dataset.player);
    party[index].name = input.value;
    const icon = app.querySelector<HTMLButtonElement>(
      `[data-leader="${index}"]`,
    );
    icon?.setAttribute("aria-label", `Lead with ${input.value}`);
    if (index === firstPlayer)
      app.querySelector(".leader-name")!.textContent = input.value;
  }
});
app.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  if (
    select.id === "trade-kind" ||
    select.id === "trade-recipient" ||
    select.name === "payment"
  ) {
    app.querySelector("#trade-error")!.textContent = "";
    updateExchange();
  }
  if (select.id.startsWith("heir-")) {
    const avatar = select.previousElementSibling!;
    const template = document.createElement("template");
    template.innerHTML = portrait(Number(select.value));
    avatar.replaceWith(template.content);
  }
});
document.addEventListener("click", (event) => {
  const control = (event.target as Element).closest("[data-computer-pause]");
  if (!control) return;
  computerPaused = !computerPaused;
  clearComputerCountdown();
  document
    .querySelectorAll<HTMLButtonElement>("[data-computer-pause]")
    .forEach((button) => {
      button.textContent = computerPaused
        ? "▶ Resume computer"
        : "Ⅱ Pause computer";
      button.title = `${computerPaused ? "Resume" : "Pause"} computer play`;
      button.setAttribute("aria-pressed", String(computerPaused));
    });
});
function computerButton(move: ComputerMove): HTMLElement | null {
  if (move.type === "trade") {
    const select = app.querySelector<HTMLSelectElement>("#trade-kind");
    if (!select) return null;
    app
      .querySelectorAll<HTMLInputElement>('input[name="payment"]')
      .forEach(
        (input) =>
          (input.checked = move.payments.some(
            (p) => input.value === `${p.player}:${p.index}`,
          )),
      );
    select.value = move.supply;
    app.querySelector<HTMLSelectElement>("#trade-recipient")!.value = String(
      move.recipient,
    );
    updateExchange();
    return app.querySelector('[data-action="trade"]');
  }
  const selector =
    move.type === "play"
      ? `[data-play="${move.index}"]`
      : move.type === "rotate"
        ? `[data-rotate="${move.index}"]`
        : move.type === "cure"
          ? `[data-cure="${move.hazard}"][data-supply="${move.supply}"]`
          : move.type === "town"
            ? `[data-town="${move.hazard}"]`
            : move.type === "take"
              ? `[data-take="${move.supply}"]`
              : `[data-action="${move.type}"]`;
  return app.querySelector(selector);
}
let humanTradeDeclined: { state: Journey; turn: number } | undefined;
async function approveComputerTrade(
  move: Extract<ComputerMove, { type: "trade" }>,
) {
  const state = game.state;
  const snapshot = JSON.stringify(state);
  const overlay = createInterstitial("Permission to use your supplies");
  setBusy(true);
  const humanPayments = move.payments.filter(
    (payment) => state.players[payment.player].controller !== "computer",
  );
  const owners = [...new Set(humanPayments.map((payment) => payment.player))];
  overlay.panel.innerHTML = `<div class="computer-trade-request"><p class="eyebrow">A favour for the wagon</p><h3>May ${escape(game.player.name)} use your supplies?</h3><p>${escape(move.reason)} This exchange gives ${escape(state.players[move.recipient].name)} ${names[move.supply].toLowerCase()}.</p><div class="computer-trade-payments">${move.payments.map((payment) => `<div>${portrait(payment.player)}<span><strong>${escape(state.players[payment.player].name)}</strong>${supplyEmblem(state.players[payment.player].supplies[payment.index])}${state.players[payment.player].controller !== "computer" ? "<small>Your permission needed</small>" : ""}</span></div>`).join("")}</div><div class="computer-trade-receive">Get ${supplyEmblem(move.supply)}</div><p>${owners.map((owner) => escape(state.players[owner].name)).join(" and ")}: approve this exchange, or keep your supplies.</p><div class="computer-trade-buttons"><button data-trade-permission="no">Keep my supplies</button><button data-trade-permission="yes">Allow this exchange →</button></div></div>`;
  let approved = false;
  try {
    await overlay.show();
    approved = await new Promise<boolean>((resolve) => {
      overlay.panel
        .querySelectorAll<HTMLButtonElement>("[data-trade-permission]")
        .forEach((button) =>
          button.addEventListener(
            "click",
            () => resolve(button.dataset.tradePermission === "yes"),
            { once: true },
          ),
        );
      overlay.panel
        .querySelector<HTMLButtonElement>('[data-trade-permission="no"]')!
        .focus({ preventScroll: true });
    });
  } finally {
    await overlay.close();
    setBusy(false);
  }
  if (game.state !== state || JSON.stringify(game.state) !== snapshot) return;
  if (!approved) {
    humanTradeDeclined = { state, turn: state.turn };
    return;
  }
  // Consent is for this exact displayed trade, not later AI decisions.
  computerButton(move)?.click();
}
let computerCountdownTarget: HTMLElement | undefined;
let computerCountdown: HTMLElement | undefined;
function clearComputerCountdown() {
  computerCountdownTarget?.removeAttribute("data-computer-waiting");
  computerCountdown?.remove();
  computerCountdownTarget = undefined;
  computerCountdown = undefined;
}
function showComputerCountdown(target: HTMLElement, duration: number) {
  clearComputerCountdown();
  computerCountdownTarget = target;
  target.setAttribute("data-computer-waiting", "");
  computerCountdown = document.createElement("span");
  computerCountdown.className = "computer-countdown";
  computerCountdown.setAttribute("aria-hidden", "true");
  computerCountdown.style.setProperty(
    "--computer-delay",
    `${Math.ceil(duration / 200) * 200}ms`,
  );
  computerCountdown.innerHTML =
    '<svg viewBox="0 0 20 20"><circle class="computer-countdown-track" cx="10" cy="10" r="7"/><circle class="computer-countdown-ring" cx="10" cy="10" r="7" pathLength="1"/></svg>';
  target.append(computerCountdown);
}
// A single scheduler waits for a stable, ready control; it never queues stale moves.
let computerReadyKey = "",
  computerReadyAt = 0;
function computerTick() {
  if (
    document.hidden ||
    game.state.mode === "simulation" ||
    computerPaused ||
    setup ||
    confirming ||
    showStatistics ||
    showJourneys ||
    active
  ) {
    computerReadyKey = "";
    clearComputerCountdown();
    return;
  }
  const dialog = document.querySelector<HTMLElement>(
    ".result-interstitial .interstitial-panel",
  );
  let target: HTMLElement | null = null;
  let move: ComputerMove | undefined;
  const legacyComputer =
    game.state.phase === "legacy" &&
    game.state.players[game.state.deaths[0]]?.controller === "computer";
  if (dialog) {
    if (dialog.classList.contains("farewell-interstitial")) {
      if (!legacyComputer) {
        computerReadyKey = "";
        clearComputerCountdown();
        return;
      }
      target = dialog.querySelector('[data-action="will-supplies"]');
    } else if (computerSequenceOwner !== undefined) {
      target = dialog.querySelector(
        '.revealed-card.is-face-down[role="button"], .result-continue:not(:disabled), .calamity-continue:not(:disabled), .dice-continue:not(:disabled)',
      );
    }
  } else if (
    !busy &&
    game.state.players[game.state.current].controller === "computer"
  ) {
    move = chooseComputerMove(game, {
      requestHumanSupplies: !(
        humanTradeDeclined?.state === game.state &&
        humanTradeDeclined.turn === game.state.turn
      ),
    });
    if (move) target = computerButton(move);
  }
  if (!target || target.matches(":disabled") || !target.isConnected) {
    computerReadyKey = "";
    clearComputerCountdown();
    return;
  }
  const key = `${game.state.turn}:${game.state.phase}:${game.state.used}:${game.state.count}:${JSON.stringify(move)}:${target.className}:${target.getAttribute("data-action")}`;
  const delay = dialog ? 1700 : 1100;
  if (
    key !== computerReadyKey ||
    computerCountdownTarget !== target ||
    !computerCountdown?.isConnected
  ) {
    computerReadyKey = key;
    computerReadyAt = performance.now();
    showComputerCountdown(target, delay);
    return;
  }
  if (performance.now() - computerReadyAt < delay) return;
  computerReadyKey = "";
  clearComputerCountdown();
  if (legacyComputer && dialog?.classList.contains("farewell-interstitial")) {
    willDraft.clear();
    for (const gift of chooseBequests(game))
      willDraft.set(gift.index, gift.recipient);
  }
  if (
    move?.type === "trade" &&
    move.payments.some(
      (payment) => game.state.players[payment.player].controller !== "computer",
    )
  ) {
    void approveComputerTrade(move);
    return;
  }
  target.click();
}
const computerTimer = window.setInterval(computerTick, 200);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearInterval(computerTimer);
    clearComputerCountdown();
  });
restoreTimelineOwners();
if (game.state.phase === "discard") {
  const before = structuredClone(game.state);
  if (game.autoDiscardSupply())
    recordTrailResult({ action: "auto-loss" }, before);
}
if (saved) persist();
setBusy(false);
render();
void (async () => {
  setBusy(true);
  try {
    if (!reducedMotion.matches)
      await playTimeline((tl) =>
        tl.fromTo(
          app.children,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, clearProps: "all" },
        ),
      );
    if (
      !setup &&
      game.state.mode !== "simulation" &&
      game.state.phase === "legacy"
    ) {
      await revealWills();
      render();
    }
  } finally {
    setBusy(false);
  }
  if (
    !setup &&
    game.state.mode === "simulation" &&
    game.state.status === "travel"
  )
    await runSimulation();
})();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    active?.progress(1);
    gsap.killTweensOf(app.querySelectorAll("*"));
  });
