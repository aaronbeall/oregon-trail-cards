import { TrailGame, readSave, names, stops, type TrailCard, type Supply } from './TrailCard';
import './style.css';
const key = 'oregon-trail-cards.journey.v1';
let saved;
try { saved = readSave(localStorage.getItem(key)); } catch { /* A private window is welcome, too. */ }
const game = new TrailGame(Math.random, saved);
const app = document.querySelector<HTMLElement>('#app')!;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icons: Record<Supply | 'health', string> = { food: '◒', water: '◈', medicine: '✚', parts: '⚙', health: '♡' };
const art = {
  landscape: new URL('./assets/landscape.webp', import.meta.url).href,
  trail: new URL('./assets/trail.webp', import.meta.url).href,
  river: new URL('./assets/river.webp', import.meta.url).href,
  calamity: new URL('./assets/calamity.webp', import.meta.url).href,
};
function landscape() {
  const s = game.state;
  return `<div class="landscape"><img class="landscape-art" src="${art.landscape}" alt="A weathered prairie print: a covered wagon, quiet hills, and a river beyond." fetchpriority="high" width="1536" height="512"><div class="map" aria-label="Wagon journey: ${s.miles} of 16 trail cards travelled"><div class="map-track"><span style="width:${s.miles / 16 * 100}%"></span><b style="left:${s.miles / 16 * 100}%" aria-hidden="true">◆</b></div><div class="map-stops">${stops.map((name,i)=>`<span class="${s.miles>=i*4?'reached':''}">${name.replace('Fort ', 'Ft. ')}</span>`).join('')}</div></div></div>`;
}
function cardArt(c: TrailCard) {
  return `<img src="${art[c.type]}" alt="" width="768" height="512" draggable="false"><div class="card-route" aria-hidden="true"><span>${['Upper','Middle','Lower'][c.left]}</span><span class="route-arrow">→</span><span>${['Upper','Middle','Lower'][c.right]}</span></div>`;
}
let confirming = false;
function render() {
  const s=game.state, e=s.event;
  const finished=s.status!=='travel';
  app.innerHTML = `<header><div><p class="eyebrow">A pocket-sized westward wander</p><h1>Oregon Trail <i>Cards</i></h1></div><button class="quiet" data-action="restart">${confirming?'Keep this journey':'New journey'}</button></header>
    ${confirming?'<aside class="restart-confirm">Leave this wagon behind and start afresh? <button data-action="confirm">Yes, a fresh start</button></aside>':''}
    <section class="journey" aria-label="Journey progress"><div class="journey-line"><span>${finished ? s.status==='won'?'The kettle is on':'A well-earned rest' : `Day ${s.day} · ${stops[Math.min(3,Math.floor(s.miles/4))]} → ${stops[Math.min(4,Math.floor(s.miles/4)+1)]}`}</span><span>${s.miles} / 16 <span class="muted">trail cards</span></span></div>${landscape()}</section>
    <section class="supplies" aria-label="Wagon supplies"><div class="health" aria-label="Party spirit ${s.health} out of 6"><span class="resource-label">Party spirit</span><span class="hearts">${Array.from({length:6},(_,i)=>`<span class="${i<s.health?'':'empty'}">♥</span>`).join('')}</span></div>${(Object.keys(names) as Supply[]).map(k=>`<div class="resource ${s.supplies[k]===0?'low':''}"><span class="resource-label">${icons[k]} ${names[k]}</span><strong>${s.supplies[k]}</strong></div>`).join('')}</section>
    <section class="decision ${e?'has-event':''}" aria-live="polite" aria-atomic="true">
    ${finished ? `<p class="eyebrow">${s.status==='won'?'A most satisfactory arrival':'Every trail teaches something'}</p><h2>${s.status==='won'?'Hello, Oregon.':'Let’s put our feet up.'}</h2><p>${escape(s.note)}</p><button class="primary" data-action="confirm">Another little adventure</button>` : e ? `<p class="eyebrow">${e.kind==='town'?'A porch along the way':e.kind==='river'?'A crossing to consider':'A wrinkle in the itinerary'}</p><h2>${escape(e.title)}</h2><p>${escape(e.text)}</p><div class="choices">${e.kind==='town' ? (['health','water','medicine','parts','food'] as const).map(k=>`<button data-rest="${k}" ${k==='health'&&s.health===6?'disabled':''}>${icons[k]} ${k==='health'?'+2 spirit':`+2 ${names[k].toLowerCase()}`}</button>`).join('') : `<button class="primary" data-resolve="safe" ${s.supplies[e.supply!] < e.cost?'disabled':''}>Use ${e.cost} ${names[e.supply!].toLowerCase()}</button><button data-resolve="risk">Try our luck <span class="button-detail">${e.threshold}–6 succeeds · lose ${e.damage} spirit otherwise</span></button>`}</div>` : `<p class="travel-note">${s.die?`<span class="die" aria-label="Rolled ${s.die}">${['','⚀','⚁','⚂','⚃','⚄','⚅'][s.die]}</span>`:''}${escape(s.note)}</p><div class="hand-heading"><h2>Choose a little road.</h2><span class="connection">Join the <strong>${['upper','middle','lower'][s.position]}</strong> trail ●</span></div>`}
    </section>
    ${!finished ? `<section class="hand" aria-label="Your trail cards">${s.hand.map((c,i)=>{const match=c.left===s.position;return `<button class="trail-card ${c.type} ${match?'matches':''}" data-card="${i}" ${!match||e?'disabled':''} aria-label="${escape(c.name)}. ${c.type==='trail'?'Quiet trail':c.type==='river'?'River crossing':'Mishap'}. ${match?'Matches your trail':'Does not match your trail'}. ${['Upper','Middle','Lower'][c.left]} to ${['upper','middle','lower'][c.right]}."><div class="card-art">${cardArt(c)}</div><div class="card-title">${escape(c.name)}</div><div class="card-caption">${c.type==='trail'?'Quiet trail':c.type==='river'?'River crossing':'A possible pickle'} <span>${match?'↗':'—'}</span></div></button>`;}).join('')}</section>`:''}
    <footer><details><summary>How to wander</summary><p>Pick a card whose starting position matches your wagon’s <b>upper, middle, or lower</b> trail. Each card costs one provision; an empty pantry costs one spirit instead. Reach Oregon in 16 cards before all six spirit hearts are gone.</p><p>Rivers and mishaps can be settled with supplies or a six-sided die. Every four cards, a fort offers four provisions and one extra kindness. A matching road always finds its way into your hand.</p><p>Your journey saves itself on this device. No hurry. The prairie is very patient.</p></details><span class="save-label">${storageAvailable?'Journey saved here':'For this visit only'}</span></footer>`;
}
let storageAvailable=true;
function persist() { try { localStorage.setItem(key,JSON.stringify(game.state)); } catch { storageAvailable=false; } }
app.addEventListener('click', event => {
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  const focused=button.dataset.card!==undefined?'card':button.dataset.action==='restart'?'restart':'decision';
  if (button.dataset.card!==undefined) game.play(Number(button.dataset.card));
  else if (button.dataset.resolve) game.resolve(button.dataset.resolve==='safe');
  else if (button.dataset.rest) game.rest(button.dataset.rest as Supply|'health');
  else if (button.dataset.action==='restart') confirming=!confirming;
  else if (button.dataset.action==='confirm') { game.reset(); confirming=false; }
  persist(); render();
  const next = app.querySelector<HTMLButtonElement>(confirming?'[data-action="confirm"]':focused==='restart'?'[data-action="restart"]':'.choices button:not(:disabled), .trail-card:not(:disabled), .decision button');
  next?.focus({preventScroll:true});
});
persist(); render();
