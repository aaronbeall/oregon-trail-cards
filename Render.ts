/** Reconcile the DOM by identity, reporting only new or visibly changed content. */
export function reconcile(parent: Element, next: ParentNode): Element[] {
  const changed = new Set<Element>();
  const key = (node: Node): string | undefined => {
    if (!(node instanceof Element)) return undefined;
    const explicit = node.getAttribute("data-ui-key") ?? node.id;
    if (explicit) return `${node.tagName}:${explicit}`;
    for (const attribute of [
      "data-action",
      "data-take",
      "data-portrait",
      "data-leader",
      "data-town",
      "data-stack",
    ])
      if (node.hasAttribute(attribute))
        return `${node.tagName}:${attribute}:${node.getAttribute(attribute)}`;
    if (node.hasAttribute("data-cure"))
      return `cure:${node.getAttribute("data-cure")}:${node.getAttribute("data-supply")}`;
    return undefined;
  };
  const compatible = (a: Node, b: Node) =>
    a.nodeType === b.nodeType &&
    (!(a instanceof Element) ||
      (b instanceof Element &&
        a.tagName === b.tagName &&
        a.classList[0] === b.classList[0]));
  const mark = (element: Element | null) => {
    if (
      element &&
      !element.closest("[hidden]") &&
      !element.matches("input, select, option, details, summary")
    )
      changed.add(element);
  };
  const patch = (old: Node, desired: Node) => {
    if (old instanceof Element && desired instanceof Element) {
      const selected = old instanceof HTMLSelectElement ? old.value : undefined;
      const focusedInput =
        old instanceof HTMLInputElement ? old.value : undefined;
      const checked =
        old instanceof HTMLInputElement &&
        old.getAttribute("value") === desired.getAttribute("value")
          ? old.checked
          : undefined;
      const open = old instanceof HTMLDetailsElement ? old.open : undefined;
      for (const attribute of Array.from(old.attributes))
        if (
          !desired.hasAttribute(attribute.name) &&
          !(attribute.name === "open" && open !== undefined)
        )
          old.removeAttribute(attribute.name);
      for (const attribute of Array.from(desired.attributes)) {
        if (old.getAttribute(attribute.name) === attribute.value) continue;
        old.setAttribute(attribute.name, attribute.value);
        if (
          attribute.name === "src" ||
          (attribute.name === "style" && old.classList.contains("portrait"))
        )
          mark(old);
      }
      // Preserve separately maintained content, such as the progress tween.
      if (!desired.hasAttribute("data-ui-static")) children(old, desired);
      if (
        old instanceof HTMLSelectElement &&
        selected !== undefined &&
        Array.from(old.options).some(
          (option) => option.value === selected && !option.disabled,
        )
      )
        old.value = selected;
      if (old instanceof HTMLInputElement) {
        if (old.classList.contains("player-name")) {
          const name = desired.getAttribute("value") ?? "";
          if (focusedInput !== name) mark(old.parentElement);
          old.value = name;
        } else if (focusedInput !== undefined) old.value = focusedInput;
        if (checked !== undefined) old.checked = checked;
      }
      if (old instanceof HTMLDetailsElement && open !== undefined)
        old.open = open;
    } else if (old.nodeValue !== desired.nodeValue) {
      old.nodeValue = desired.nodeValue;
      if (desired.nodeValue?.trim()) mark(old.parentElement);
    }
  };
  const children = (target: Element, source: ParentNode) => {
    const oldNodes = Array.from(target.childNodes);
    const remaining = new Set(oldNodes);
    let cursor = target.firstChild;
    for (const desired of Array.from(source.childNodes)) {
      const identity = key(desired);
      const old = oldNodes.find(
        (candidate) =>
          remaining.has(candidate) &&
          compatible(candidate, desired) &&
          (identity ? key(candidate) === identity : !key(candidate)),
      );
      let actual: Node;
      if (old) {
        remaining.delete(old);
        const wasHidden = old instanceof Element && old.hasAttribute("hidden");
        patch(old, desired);
        actual = old;
        if (wasHidden && old instanceof Element && !old.hasAttribute("hidden"))
          mark(old);
      } else {
        actual = desired;
        if (desired instanceof Element) mark(desired);
      }
      if (actual !== cursor) target.insertBefore(actual, cursor);
      cursor = actual.nextSibling;
    }
    remaining.forEach((node) => target.removeChild(node));
  };
  children(parent, next);
  // Never animate a child twice if its newly inserted parent already animates.
  return [...changed].filter(
    (element) =>
      element.isConnected &&
      !element.closest("[hidden]") &&
      ![...changed].some(
        (ancestor) => ancestor !== element && ancestor.contains(element),
      ),
  );
}
