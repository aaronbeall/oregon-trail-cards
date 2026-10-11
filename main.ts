/// <reference types="vite/client" />
import {
  TrailGame,
  readSave,
  names,
  titles,
  ends,
  label,
  description,
  type TrailCard,
  type Supply,
} from "./TrailCard";
import "./style.css";
import { randomName, randomParty, portraitSlots } from "./Party";
import { gsap } from "gsap";
import { GameHistory, type GameAction } from "./History";
const key = "oregon-trail-cards.official.v2";
let saved;
try {
  saved = readSave(localStorage.getItem(key));
} catch {}
const pendingRolls: number[] = [];
const game = new TrailGame(Math.random, saved, (n) => pendingRolls.push(n));
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
  town: new URL("./assets/town.webp", import.meta.url).href,
  fort: new URL("./assets/fort.webp", import.meta.url).href,
  shop: new URL("./assets/shop.webp", import.meta.url).href,
  legacy: new URL("./assets/legacy.webp", import.meta.url).href,
  landscape: new URL("./assets/landscape.webp", import.meta.url).href,
  trail: new URL("./assets/trail.webp", import.meta.url).href,
  river: new URL("./assets/river-ford.webp", import.meta.url).href,
  calamity: new URL("./assets/calamity.webp", import.meta.url).href,
};
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
let party = randomParty(3);
let firstPlayer = 0;
let portraitPicker: number | null = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let busy = false,
  active: gsap.core.Timeline | null = null;
function setBusy(b: boolean) {
  busy = b;
  app.setAttribute("aria-busy", String(b));
}
function playTimeline(build: (tl: gsap.core.Timeline) => void) {
  return new Promise<void>((resolve) => {
    active = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: () => {
        active = null;
        resolve();
      },
    });
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
function route(c: TrailCard) {
  const [a, b] = ends(c);
  const universal = c.type === "town" || c.type === "fort";
  if (universal) return `<span class="any-road">ANY ROAD</span>`;
  return `<svg class="road" viewBox="0 0 120 72" role="img" aria-label="${universal ? "Connects any road" : `Road enters ${["top", "middle", "bottom"][a]} edge and leaves ${["top", "middle", "bottom"][b]} edge`}"><path class="road-shadow" d="M0 ${12 + a * 24} C55 ${12 + a * 24},65 ${12 + b * 24},120 ${12 + b * 24}"/><path d="M0 ${12 + a * 24} C55 ${12 + a * 24},65 ${12 + b * 24},120 ${12 + b * 24}"/>${universal ? '<text x="60" y="40" text-anchor="middle">ANY ROAD</text>' : ""}</svg>`;
}
function card(c: TrailCard) {
  return `<div class="card-art" title="${escape(label(c))}: ${escape(description(c))}"><img src="${art[c.type]}" alt="" width="768" height="512" draggable="false">${route(c)}</div>`;
}
const button = (action: string, text: string, disabled = false) =>
  `<button data-action="${action}" ${disabled ? "disabled" : ""}>${text}</button>`;
const hazardText: Record<string, string> = {
  axle: "Wagon stopped; repair before the round ends or everyone loses.",
  tongue: "Wagon stopped; repair before the round ends or everyone loses.",
  wheel: "Wagon stopped; repair before the round ends or everyone loses.",
  oxen: "Wagon stopped; replace the oxen before the round ends or everyone loses.",
  water: "Clean water cures this. A second bad-water card kills the oxen.",
  grass: "Only a town removes this. A second grass card kills the oxen.",
  cholera:
    "Two medicine cards cure this. A second cholera card kills the afflicted player.",
  measles:
    "Miss one turn. Medicine cures this; a second measles card kills the afflicted player.",
  arm: "Miss two turns, then recover.",
  cold: "Clothes before the round ends, or this player dies.",
  typhoid: "Water AND medicine before the round ends, or this player dies.",
  starvation: "Food within two rounds, or this player dies.",
};
function portraitImage(slot: number, large = false) {
  const local = slot % 6;
  return `<span class="portrait portrait-sheet-${Math.floor(slot / 6)} ${large ? "large" : ""}" style="--portrait-x:${(local % 3) * 50}%;--portrait-y:${Math.floor(local / 3) * 100}%" aria-hidden="true"></span>`;
}
function portrait(index: number, large = false) {
  return portraitImage(game.state.players[index]?.portrait ?? index % 6, large);
}
function travellerCard(p: { name: string; portrait: number }, i: number) {
  const choosing = portraitPicker === i;
  return `<article class="traveller-card" data-traveller="${i}"><span class="eyebrow">Traveller ${i + 1}</span><button class="traveller-remove" data-remove-traveller="${i}" aria-label="Remove ${escape(p.name)} from the wagon" title="${party.length === 2 ? "At least two travellers are needed" : "Remove traveller"}" ${party.length === 2 ? "disabled" : ""}><span aria-hidden="true">×</span></button><div class="traveller-portrait"><div class="portrait-picker" id="portrait-picker-${i}" ${!choosing ? "hidden" : ""} role="group" aria-label="Portraits for traveller ${i + 1}">${portraitSlots.map((slot) => `<button data-portrait="${slot}" data-player="${i}" aria-label="Portrait ${slot + 1} for traveller ${i + 1}" aria-pressed="${p.portrait === slot}" class="${p.portrait === slot ? "selected" : ""}">${portraitImage(slot)}</button>`).join("")}</div><button class="${choosing ? "portrait-picker-close" : "portrait-choice"}" data-picker="${i}" aria-expanded="${choosing}" aria-controls="portrait-picker-${i}" aria-label="${choosing ? "Close portrait selection" : "Choose portrait"} for traveller ${i + 1}">${choosing ? "Done" : `${portraitImage(p.portrait, true)}<span>Choose portrait</span>`}</button></div><label class="traveller-name">Name<input class="player-name" data-player="${i}" value="${escape(p.name)}" maxlength="30" required autocomplete="off"></label></article>`;
}
function leaderPicker() {
  return `<div class="leader-choice field"><span id="leader-label">Who leads the way?</span><div class="leader-icons" role="group" aria-labelledby="leader-label">${party.map((p, i) => `<button data-leader="${i}" aria-label="Lead with ${escape(p.name)}" aria-pressed="${i === firstPlayer}" class="leader-icon ${i === firstPlayer ? "selected" : ""}">${portraitImage(p.portrait)}</button>`).join("")}</div><strong class="leader-name" aria-live="polite">${escape(party[firstPlayer].name)}</strong><small>The player born nearest Willamette Valley starts.</small></div>`;
}
function updateLeader() {
  const current = app.querySelector(".leader-choice");
  if (!current) return;
  const template = document.createElement("template");
  template.innerHTML = leaderPicker();
  current.replaceWith(template.content);
}
function setupScreen() {
  return `<section class="decision setup"><img class="setup-banner" src="${art.landscape}" alt="A covered wagon beneath quiet prairie hills"><div class="setup-body"><p class="eyebrow">A good journey starts with good company</p><h2>Who’s in the wagon?</h2><p>Room for two to six. Pick your companions, pack the kettle, and keep at least one traveller breathing all the way to Oregon.</p><div class="setup-toolbar"><span>${party.length} travellers aboard</span>${button("randomize", "↻ Randomize everyone")}</div><div class="traveller-grid">${party.map(travellerCard).join("")}</div><div class="party-size">${button("add", "+ Traveller", party.length === 6)}</div><div class="setup-departure">${leaderPicker()}${button("start", "Pack up and start your trek →")}</div></div></section>`;
}
function playerTag(index: number) {
  return `<span class="player-tag">${portrait(index)}<span>${escape(game.state.players[index].name)}</span></span>`;
}
function handCard(c: TrailCard, i: number) {
  return `<article class="hand-card ${game.canPlay(c) ? "matches" : ""}" data-hand-index="${i}"><button class="trail-card" data-play="${i}" ${!game.canPlay(c) ? "disabled" : ""} aria-label="Play ${label(c)}">${card(c)}<div class="card-title">${label(c)}</div><div class="card-description">${description(c)}</div><div class="card-caption">${c.type === "town" || c.type === "fort" ? "Connects any road" : game.matches(c) ? "Road connects" : game.matches({ ...c, rotated: !c.rotated }) ? "Rotate to connect" : "Edges do not meet"}</div></button><button class="rotate" data-rotate="${i}" ${game.state.phase !== "turn" ? "disabled" : ""} aria-label="Rotate ${label(c)} 180 degrees">↻ Rotate 180°</button></article>`;
}
function hazards() {
  return game.state.hazards
    .map(
      (h) =>
        `<article class="hazard"><strong>${titles[h.kind]}</strong><p>${hazardText[h.kind] ?? ""}</p><span>${playerTag(h.owner)} · ${h.rounds === null ? "until cured" : `${h.rounds} round${h.rounds === 1 ? "" : "s"} left`}${h.skip ? ` · rests ${h.skip} turn${h.skip === 1 ? "" : "s"}` : ""}</span><div class="choices">${(
          Object.keys(h.needs) as Supply[]
        )
          .filter((k) => h.needs[k]! > 0)
          .map(
            (k) =>
              `<button data-cure="${h.id}" data-supply="${k}" ${game.state.phase !== "turn" || game.skips || !game.player.supplies.includes(k) || game.state.used >= (game.living.length === 2 ? 2 : 1) ? "disabled" : ""}>Give ${names[k]} (${h.needs[k]} needed)</button>`,
          )
          .join(
            "",
          )}${!Object.keys(h.needs).length ? "<small>Town can remove this card.</small>" : ""}</div></article>`,
    )
    .join("");
}
function decision() {
  const s = game.state,
    p = game.player;
  let heading = "",
    text = "",
    choices = "";
  if (s.status !== "travel") {
    heading =
      s.status === "won" ? "Hello, Oregon." : "The prairie keeps your story.";
    text = s.note;
    choices = button("new", "Another journey");
  } else if (s.phase === "river") {
    heading = "A river, being a river.";
    text = `${p.name} must attempt this crossing. Roll 2, 4 or 6 to ford; 3 or 5 passes the attempt to the next player. A 1 ${game.top?.deadly ? "drowns the player" : "loses one supply"}. No more road until you reach the far bank.`;
    choices = game.skips
      ? button("skip", "Rest this turn")
      : button("roll", "Roll to ford");
    if (game.skips)
      text += " This player must sit out; pass the attempt without rolling.";
  } else if (s.phase === "repair") {
    heading = titles[s.pending!];
    text =
      "Roll 4–6 for a lucky repair. Otherwise the wagon stops: one spare part must be played within one round, or the whole party loses.";
    choices = button("repair", "Roll to repair");
  } else if (s.phase === "stack") {
    heading = "Your first little bundle of road.";
    text =
      "Five cards become one stack. For this first stack only, choose the first or fifth card as the top. Its right edge is where the next road must connect.";
    choices = [0, 4]
      .map(
        (i) =>
          `<button data-stack="${i}">${card(s.run[i])}<span>${i === 0 ? "First" : "Fifth"} card on top</span></button>`,
      )
      .join("");
  } else if (s.phase === "town" || s.phase === "fort") {
    heading =
      s.phase === "town"
        ? "A town with a kindly porch."
        : "A fort along the road.";
    text =
      s.phase === "town"
        ? "Take one supply from the shop OR remove one active calamity."
        : "Take two available supplies from the shop.";
    choices = (Object.keys(names) as Supply[])
      .map(
        (k) =>
          `<button data-take="${k}" ${!s.shop[k] ? "disabled" : ""}>${names[k]} · ${s.shop[k]}</button>`,
      )
      .join("");
    if (s.phase === "town")
      choices += s.hazards
        .map(
          (h) =>
            `<button data-town="${h.id}">Remove ${titles[h.kind]}</button>`,
        )
        .join("");
    choices += button(
      "leave",
      s.phase === "fort" && s.take < 2
        ? "Leave with what you have"
        : "Leave without supplies",
    );
    text += ` ${s.take} pick${s.take === 1 ? "" : "s"} remaining.`;
  } else if (s.phase === "discard") {
    heading = "One supply must go.";
    text = p.supplies.length
      ? "Choose one of your supplies to return to the shop."
      : "Your hand is empty. Choose a hidden supply from another living player, without discussing its contents.";
    choices = s.players
      .flatMap((q, i) =>
        q.alive && (!p.supplies.length || i === s.current)
          ? q.supplies.map(
              (k, j) =>
                `<button data-discard="${j}" data-owner="${i}">${portrait(i)}${i === s.current ? names[k] : `${escape(q.name)} · mystery supply ${j + 1}`}</button>`,
            )
          : [],
      )
      .join("");
  } else if (s.phase === "legacy") {
    const dead = s.players[s.deaths[0]];
    heading = `Farewell, ${escape(dead.name)}.`;
    text =
      "Will up to two supplies to living companions. Everything else goes back to the shop; their trail hand returns to the bottom of the deck.";
    choices =
      `<label class="field">Epitaph <input id="epitaph" maxlength="160" value="${escape(dead.epitaph)}"></label>` +
      dead.supplies
        .map(
          (k, i) =>
            `<label class="will">${portrait(s.deaths[0])}${names[k]} <span class="recipient-select">${portrait(game.living[0])}<select id="heir-${i}">${game.living.map((j) => `<option value="${j}">${escape(s.players[j].name)}</option>`).join("")}</select></span><button data-will="${i}" ${s.legacyCount >= 2 ? "disabled" : ""}>Will this</button></label>`,
        )
        .join("") +
      button("will-done", `Close the little book (${s.legacyCount}/2 willed)`);
  } else {
    heading = `${escape(p.name)}’s turn`;
    text = s.note;
    choices = game.skips
      ? button("skip", "Rest this turn")
      : s.used
        ? button("end", "Finish supply turn")
        : button("draw", "Draw one card & end turn", game.hasTrail);
    text += game.skips
      ? " You must sit out this turn."
      : game.blocked
        ? " The wagon is blocked. Play a remedy or draw and pass."
        : s.used
          ? " You chose supplies this turn; no trail card may be played."
          : " Lay one matching road, or play a supply to remedy a calamity. Rotate a card to try its other orientation.";
  }
  return `<section class="decision" aria-live="polite"><p class="eyebrow">${s.status === "travel" ? `Turn ${s.turn} · shared wagon` : "Journey’s end"}</p><div class="decision-heading">${portrait(s.phase === "legacy" ? s.deaths[0] : s.current, true)}<h2>${heading}</h2></div>${s.phase === "legacy" ? `<img class="farewell-art" src="${art.legacy}" alt="A quiet prairie gravestone with wildflowers">` : s.phase === "town" || s.phase === "fort" ? `<img class="stop-art" src="${art[s.phase]}" alt="A welcoming frontier ${s.phase}">` : ""}<p>${s.die ? `<span class="die" aria-label="Last roll ${s.die}">${["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][s.die]}</span>` : ""}${escape(text)}</p><div class="choices">${choices}</div></section>`;
}
function trail() {
  const s = game.state;
  return `<section class="trail-area" aria-label="Connected trail and five-card stacks"><div class="section-line"><h2>The trail so far</h2><span>${s.stacks.length} / 10 stacks · ${s.count} / 50 cards</span></div><div class="trail-strip"><span class="trail-marker">Independence<br>START</span>${s.stacks.map((stack, i) => `<div class="trail-stack" title="Stack ${i + 1}: ${stack.length} physical cards; five trail cards travelled">${card(stack[0])}<small>Stack ${i + 1} · ${stack.length === 1 ? "top kept; others recycled" : "5 cards"}</small></div>`).join("")}${s.run.map((c) => `<div class="trail-piece">${card(c)}<small>${label(c)}</small></div>`).join("")}<span class="trail-marker">${s.status === "won" ? "Oregon<br>FINISH" : `${s.run.length}/5<br>current set`}</span></div><p class="trail-explanation">Roads meet at the card edges. A town or fort accepts any road. Every five cards become a stack; continue from its exposed top card. Ten stacks reach Oregon.</p></section>`;
}
function trading() {
  const s = game.state;
  return `<section class="shop ${shopOpen ? "is-open" : ""}"><button data-action="shop" class="shop-toggle" aria-expanded="${shopOpen}" aria-controls="supply-shop-content"><img src="${art.shop}" alt=""><span><span class="eyebrow">A little something for the road</span><strong>Supply shop</strong><small>Trade two for one · no turn used</small></span><span class="shop-chevron" aria-hidden="true">⌄</span></button><div id="supply-shop-content" class="shop-content" ${!shopOpen ? "hidden" : ""}><div class="shop-stock">${(Object.keys(names) as Supply[]).map((k) => `<span class="${!s.shop[k] ? "sold-out" : ""}">${names[k]} <b>${s.shop[k]}</b></span>`).join("")}</div><p>Two supplies buy one small kindness. Choose your own pair, or one each from two consenting companions.</p><div class="trade-picks">${s.players.flatMap((p, i) => (p.alive ? p.supplies.map((k, j) => `<label><input type="checkbox" name="payment" value="${i}:${j}">${portrait(i)}<span>${escape(p.name)}<small>${i === s.current ? names[k] : `Hidden supply ${j + 1}`}</small></span></label>`) : [])).join("")}</div><div class="trade-footer"><label>Take from the shelf<select id="trade-kind">${(Object.keys(names) as Supply[]).map((k) => `<option value="${k}" ${!s.shop[k] ? "disabled" : ""}>${names[k]} (${s.shop[k]})</option>`).join("")}</select></label><label>For this traveller<div class="recipient-select">${portrait(s.current)}<select id="trade-recipient">${game.living.map((i) => `<option value="${i}" ${i === s.current ? "selected" : ""}>${escape(s.players[i].name)}</option>`).join("")}</select></div></label>${button("trade", "Exchange two supplies")}</div><p id="trade-error" role="status"></p></div></section>`;
}
function render() {
  const s = game.state;
  const markup = `<header><div><p class="eyebrow">A cooperative westward wander · 2–6 players</p><h1>Oregon Trail <i>Cards</i></h1></div><div class="header-actions">${setup ? (s.started ? button("resume", "Back to journey") : "") : button("new", "New journey")}${button("clear-storage", "Clear local storage")}</div></header>${confirming ? `<aside class="restart-confirm"><span>Leave this journey behind?</span><div class="restart-actions">${button("cancel", "Stay here")}${button("confirm-new", "Start afresh")}</div></aside>` : ""}${
    setup
      ? setupScreen()
      : `<section class="journey"><img class="banner" src="${art.landscape}" alt="A weathered print of a wagon beneath quiet prairie hills"><div class="map-track"><span style="width:${s.count * 2}%"></span></div></section><section class="players" aria-label="Travellers">${s.players.map((p, i) => `<div class="player ${i === s.current ? "current" : ""} ${!p.alive ? "dead" : ""}">${portrait(i)}<div><strong>${escape(p.name)} ${!p.alive ? "†" : i === s.current ? "←" : ""}</strong><small>${p.alive ? `${p.hand.length} trail · ${p.supplies.length} supplies` : escape(p.epitaph)}</small></div></div>`).join("")}</section>${trail()}${decision()}${
          s.status === "travel"
            ? `<section class="hazards" aria-label="Active calamities">${hazards()}</section>${
                s.phase !== "legacy" && s.phase !== "discard"
                  ? `<section class="supply-hand" aria-label="Current player supplies"><span class="resource-label">${playerTag(s.current)}’s supplies · ${game.living.length === 2 ? "up to two" : "one"} per turn to remedy calamities</span><div>${
                      (Object.keys(names) as Supply[])
                        .map((k) => {
                          const n = game.player.supplies.filter(
                            (x) => x === k,
                          ).length;
                          return n
                            ? `<span>${names[k]} <b>×${n}</b></span>`
                            : "";
                        })
                        .join("") || "<span>A very light bag.</span>"
                    }</div></section>`
                  : ""
              }<section class="hand" aria-label="Current player trail cards">${game.player.hand.map(handCard).join("")}</section>${s.phase !== "legacy" && s.phase !== "discard" ? trading() : ""}`
            : ""
        }`
  }
<footer><details><summary>Rules of the road</summary><div class="help-content"><p>Play one connected trail card OR spend a turn supplying remedies. There is no automatic replacement draw. If no trail fits, draw one and end your turn. Supplies can be traded two for one at any time. Rivers pass between players until an even roll succeeds.</p><p>Calamity deadlines end after the drawer’s next turn (or second turn for two rounds), giving everyone a chance to help. Broken wagon parts and dead oxen stop trail play. Dead players may will two supplies. The remaining travellers carry on.</p><p>Five trail cards become one stack, first card on top. Only the very first stack can use the fifth instead. Keep connecting the exposed top; recycle the four buried cards in each stack when the draw pile is empty. Fifty cards means Oregon.</p><p>Based on the <a href="https://www.buffalolib.org/sites/default/files/gaming-unplugged/inst/The%20Oregon%20Trail%20Card%20Game%20Instructions.pdf" target="_blank" rel="noreferrer">2017 Pressman rules</a>. See the repository’s rules notes for card text and edition differences. Your journey saves on this device.</p></div></details><span>${storageAvailable ? "Saved here" : "Couldn’t save locally"}</span></footer>`;
  const template = document.createElement("template");
  template.innerHTML = markup;
  const sectionKey = (el: Element) => `${el.tagName}:${el.classList[0] ?? ""}`;
  const existing = new Map(
    Array.from(app.children).map((el) => [sectionKey(el), el]),
  );
  const signature = (el: Element) => {
    const clone = el.cloneNode(true) as Element;
    for (const node of [
      clone,
      ...Array.from(clone.querySelectorAll("[style]")),
    ])
      if (!node.getAttribute("style")?.trim()) node.removeAttribute("style");
    return clone.outerHTML;
  };
  const changed: Element[] = [];
  for (const next of Array.from(template.content.children)) {
    const old = existing.get(sectionKey(next));
    if (old && next.classList.contains("journey")) {
      const fill = old.querySelector(".map-track>span");
      if (fill) {
        if (reducedMotion.matches)
          (fill as HTMLElement).style.width = `${game.state.count * 2}%`;
        else
          gsap.to(fill, {
            width: `${game.state.count * 2}%`,
            duration: 0.5,
            ease: "power2.inOut",
          });
      }
      app.append(old);
      existing.delete(sectionKey(next));
      continue;
    }
    if (
      old &&
      (signature(old) === signature(next) || next.tagName === "FOOTER")
    )
      app.append(old);
    else {
      old?.replaceWith(next);
      app.append(next);
      changed.push(next);
    }
    existing.delete(sectionKey(next));
  }
  existing.forEach((el) => el.remove());
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
async function tumbleDie(result: number) {
  const panel = app.querySelector<HTMLElement>(".decision")!;
  const roll = document.createElement("div");
  roll.className = "dice-roll";
  roll.setAttribute("role", "status");
  roll.setAttribute("aria-label", "Rolling the die");
  roll.innerHTML = `<div class="dice-stage" aria-hidden="true"><div class="dice-shadow"></div><div class="dice-hop"><div class="dice-cube">${[1, 2, 3, 4, 5, 6].map((face) => `<div class="dice-face face-${face}">${Array.from({ length: 9 }, (_, i) => `<span class="${diePips[face].includes(i + 1) ? "pip" : ""}"></span>`).join("")}</div>`).join("")}</div></div></div><span class="dice-caption">A little tumble of fate…</span>`;
  panel.append(roll);
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
    roll.setAttribute("aria-label", `Rolled ${result}`);
    roll.querySelector(".dice-caption")!.textContent = `Rolled ${result}`;
    if (!reducedMotion.matches)
      await playTimeline((tl) => {
        tl.to(roll, { opacity: 0, duration: 0.22 }, 0.4);
      });
  } finally {
    roll.remove();
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
        { height: "auto", opacity: 1, duration: 0.4, clearProps: "all" },
      );
    } else
      gsap.to(content, {
        height: 0,
        opacity: 0,
        duration: 0.25,
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
  if (!button || button.disabled || busy) return;
  const d = button.dataset;
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
  let changed = false;
  if (setup)
    party = Array.from(
      app.querySelectorAll<HTMLInputElement>(".player-name"),
    ).map((e, i) => ({ ...party[i], name: e.value }));
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
  } else if (d.action === "new") {
    if (setup) return;
    confirming = true;
    changed = true;
  } else if (d.action === "cancel") {
    confirming = false;
    changed = true;
  } else if (d.action === "confirm-new") {
    setup = true;
    confirming = false;
    party = randomParty(game.state.players.length);
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
      if (firstPlayer > index) firstPlayer--;
      else if (firstPlayer === index)
        firstPlayer = Math.min(index, party.length - 1);
      portraitPicker = null;
      const grid = app.querySelector(".traveller-grid")!;
      grid.innerHTML = party.map(travellerCard).join("");
      app.querySelector(".setup-toolbar > span")!.textContent =
        `${party.length} travellers aboard`;
      app.querySelector<HTMLButtonElement>('[data-action="add"]')!.disabled =
        false;
      updateLeader();
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.fromTo(
            grid.children,
            { opacity: 0.7, y: 4 },
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
          `[data-remove-traveller="${Math.min(index, party.length - 1)}"]:not(:disabled), [data-action="add"]`,
        )
        ?.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.action === "start") {
    changed = game.reset(
      party.map((p) => p.name),
      firstPlayer,
      party.map((p) => p.portrait),
    );
    if (changed) setup = false;
    else {
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
    party = randomParty(party.length, party);
    portraitPicker = null;
    setBusy(true);
    try {
      const grid = app.querySelector(".traveller-grid")!;
      grid.innerHTML = party.map(travellerCard).join("");
      updateLeader();
      if (!reducedMotion.matches)
        await playTimeline((tl) =>
          tl.fromTo(
            grid.children,
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
        old?.replaceWith(template.content);
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
      if (!reducedMotion.matches && old.querySelector(".road"))
        await playTimeline((tl) =>
          tl.to(old.querySelector(".road"), {
            rotation: 180,
            duration: 0.45,
            ease: "power2.inOut",
          }),
        );
      const template = document.createElement("template");
      template.innerHTML = handCard(game.player.hand[index], index);
      old.replaceWith(template.content);
      const draw = app.querySelector<HTMLButtonElement>('[data-action="draw"]');
      if (draw) draw.disabled = game.hasTrail;
      app
        .querySelector<HTMLButtonElement>(`[data-rotate="${index}"]`)
        ?.focus({ preventScroll: true });
    } finally {
      setBusy(false);
    }
    return;
  } else if (d.stack !== undefined) changed = game.stack(Number(d.stack));
  else if (d.cure) changed = game.cure(Number(d.cure), d.supply as Supply);
  else if (d.take) changed = game.takeSupply(d.take as Supply);
  else if (d.town) changed = game.townCure(Number(d.town));
  else if (d.discard !== undefined)
    changed = game.discardSupply(Number(d.owner), Number(d.discard));
  else if (d.will !== undefined)
    changed = game.will(
      Number(d.will),
      Number((app.querySelector(`#heir-${d.will}`) as HTMLSelectElement).value),
    );
  else if (d.action === "will-done") {
    game.state.players[game.state.deaths[0]].epitaph = (
      app.querySelector("#epitaph") as HTMLInputElement
    ).value;
    changed = game.closeWill();
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
  persist(action);
  try {
    for (const n of pendingRolls.splice(0)) await tumbleDie(n);
    const changedSections = render();
    if (!reducedMotion.matches && changedSections.length)
      await playTimeline((tl) => {
        tl.fromTo(
          changedSections,
          { opacity: 0, y: 7 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            stagger: 0.025,
            clearProps: "all",
          },
        );
        const hand = changedSections.find((el) =>
          el.classList.contains("hand"),
        );
        if (hand)
          tl.fromTo(
            hand.children,
            { y: 10, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.4,
              stagger: 0.035,
              clearProps: "all",
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
  if (select.id === "trade-recipient" || select.id.startsWith("heir-")) {
    const avatar = select.previousElementSibling!;
    const template = document.createElement("template");
    template.innerHTML = portrait(Number(select.value));
    avatar.replaceWith(template.content);
  }
});
if (saved) persist();
setBusy(false);
render();
if (!reducedMotion.matches) {
  setBusy(true);
  playTimeline((tl) =>
    tl.fromTo(
      app.children,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, clearProps: "all" },
    ),
  ).finally(() => setBusy(false));
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    active?.progress(1);
    gsap.killTweensOf(app.querySelectorAll("*"));
  });
