/**
 * Where a pop-up that is rendered "outside" its component (a createPortal) should be attached.
 *
 * Normally that is <body>. But while an element is shown full screen (the Fullscreen API), the
 * browser draws ONLY that element and what is inside it - anything attached to <body> stays
 * hidden behind it, so a dropdown list opened from inside a full-screen view would never appear.
 * Attaching to the full-screen element instead keeps it visible.
 */
export function portalRoot(): HTMLElement {
  const fullscreen = document.fullscreenElement;
  return fullscreen instanceof HTMLElement ? fullscreen : document.body;
}
