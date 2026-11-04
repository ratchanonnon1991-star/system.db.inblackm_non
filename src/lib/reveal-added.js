// Brings an item that an "add" button just created into view.
//
// The item marks itself with data-reveal-key={key}. Once it has rendered, the
// page (and any scrolling box it sits in) scrolls to it only when it is not
// already fully visible, the cursor goes to its first field (or the one marked
// data-reveal-focus), and it flashes briefly so the eye finds it.

// Sticky headers cover roughly this much of the top of the window.
const COVERED_TOP = 160;
const WAIT_MS = 1500;
const FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

function scrollParents(element) {
  const parents = [];
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY, overflowX } = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY + overflowX)) parents.push(node);
  }
  return parents;
}

function fullyVisible(element) {
  const rect = element.getBoundingClientRect();
  if (rect.top < COVERED_TOP || rect.bottom > window.innerHeight) {
    // A modal is fixed over the header, so only the window's own edge counts there.
    const inFixedLayer = Boolean(element.closest('[role="dialog"], [aria-modal="true"]'));
    if (!inFixedLayer || rect.top < 0 || rect.bottom > window.innerHeight) return false;
  }
  return scrollParents(element).every((parent) => {
    const box = parent.getBoundingClientRect();
    return rect.top >= box.top && rect.bottom <= box.bottom && rect.left >= box.left && rect.right <= box.right;
  });
}

function flash(element) {
  if (typeof element.animate !== "function") return;
  element.animate(
    [
      { boxShadow: "inset 0 0 0 2px rgba(217, 0, 5, 0.6)" },
      { boxShadow: "inset 0 0 0 2px rgba(217, 0, 5, 0)" },
    ],
    { duration: 1600, easing: "ease-out" }
  );
}

export function revealAdded(key, { focus = true } = {}) {
  if (typeof window === "undefined" || key == null) return;
  const selector = `[data-reveal-key="${window.CSS.escape(String(key))}"]`;
  const startedAt = performance.now();

  const attempt = () => {
    const element = document.querySelector(selector);
    if (!element) {
      if (performance.now() - startedAt < WAIT_MS) window.requestAnimationFrame(attempt);
      return;
    }
    if (!fullyVisible(element)) {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
    if (focus && !element.contains(document.activeElement)) {
      // data-reveal-focus picks the field when the first one is not the one to type in.
      const marked = element.querySelector("[data-reveal-focus]");
      const field = marked?.matches(FIELD_SELECTOR) ? marked : marked?.querySelector(FIELD_SELECTOR) || element.querySelector(FIELD_SELECTOR);
      field?.focus({ preventScroll: true });
    }
    flash(element);
  };

  window.requestAnimationFrame(attempt);
}
