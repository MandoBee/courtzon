/** Scroll the window to the top (e.g. after wizard step change). */
export function scrollToTop(behavior: ScrollBehavior = 'smooth'): void {
  window.scrollTo({ top: 0, left: 0, behavior });
}
