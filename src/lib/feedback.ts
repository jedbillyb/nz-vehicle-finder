export const OPEN_FEEDBACK_EVENT = "nzvf:open-feedback";

/** Opens the feedback panel. Used by the footer link, which is the only trigger on phones. */
export function openFeedback() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
}
