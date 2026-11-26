/** Keyboard lifecycle for an application modal. Call cleanup before removing it.
 * No global listeners remain after dismissal; restores the initiating focus.
 */
export function trapModalFocus(overlay, close, initialSelector) {
  const previousFocus = document.activeElement;
  const dialog = overlay.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('Expected an accessible modal dialog.');
  const focusable = () => [...dialog.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((node) => !node.hidden && node.getClientRects().length > 0);
  function handleKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === items[0] || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        items.at(-1).focus();
      } else if (!event.shiftKey && (document.activeElement === items.at(-1) || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        items[0].focus();
      }
    }
  }
  overlay.addEventListener('keydown', handleKey);
  const focusTarget = initialSelector ? overlay.querySelector(initialSelector) : null;
  (focusTarget || focusable()[0] || dialog).focus();
  return () => {
    overlay.removeEventListener('keydown', handleKey);
    if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
  };
}
