import { names, type Supply } from "./TrailCard";

const emblems: Record<Supply, { color: string; icon: string }> = {
  food: {
    color: "#b38a42",
    icon: '<path d="M12 20V5m0 6C7 11 6 8 6 6c4 0 6 2 6 5Zm0 5c-5 0-6-3-6-5 4 0 6 2 6 5Zm0-7c5 0 6-3 6-5-4 0-6 2-6 5Zm0 5c5 0 6-3 6-5-4 0-6 2-6 5Z"/>',
  },
  water: {
    color: "#517f91",
    icon: '<path d="M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12Z"/><path d="M8 15c0 2 1 3 3 3"/>',
  },
  medicine: {
    color: "#82739b",
    icon: '<path d="M9 3h6v4l3 3v10H6V10l3-3Z"/><path d="M9 3h6M9 14h6m-3-3v6"/>',
  },
  parts: {
    color: "#b56e4b",
    icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6m0 4v6M4 12h6m4 0h6M6 6l4 4m4 4 4 4M6 18l4-4m4-4 4-4"/>',
  },
  oxen: {
    color: "#97616a",
    icon: '<path d="M8 8C4 8 3 5 3 3m13 5c4 0 5-3 5-5M6 10l3-3h6l3 3-2 9-4 2-4-2Z"/><path d="M9 12h.1m5.8 0h.1M10 17h4"/>',
  },
  clothes: {
    color: "#68825c",
    icon: '<path d="m8 4-5 3-2 5 5 2 1-3v10h10V11l1 3 5-2-2-5-5-3c0 5-8 5-8 0Z"/>',
  },
  bullets: {
    color: "#6b727b",
    icon: '<path d="M6 20V9c0-3 2-5 3-6 1 1 3 3 3 6v11Zm7 0V11c0-3 2-5 3-6 1 1 3 3 3 6v9ZM6 16h6m1 0h6"/>',
  },
};

/** Small stacks suggest multiples; the badge always gives the exact quantity. */
export function supplyEmblem(kind: Supply, quantity = 1, count = false) {
  const { color, icon } = emblems[kind];
  const layers = Math.min(3, Math.max(1, quantity));
  return `<span class="supply-token ${quantity === 0 ? "supply-empty" : ""}" data-ui-key="supply-${kind}" data-supply-kind="${kind}" style="--supply-color:${color}"><span class="supply-stack" style="--supply-layers:${layers}" aria-hidden="true">${Array.from({ length: layers }, (_, i) => `<span class="supply-seal" style="--layer:${layers - i - 1}">${i === layers - 1 ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>` : ""}</span>`).join("")}${count || quantity !== 1 ? `<b class="supply-count">${quantity}</b>` : ""}</span><span class="supply-label">${names[kind]}${count || quantity !== 1 ? `<span class="sr-only">: ${quantity}</span>` : ""}</span></span>`;
}

export function hiddenSupply(label: string) {
  return `<span class="supply-token supply-hidden"><span class="supply-stack" aria-hidden="true"><span class="supply-seal">?</span></span><span class="supply-label">${label}</span></span>`;
}
