// Fixed scenes for screenshots: ?shot=editor shows the page with a sample photo; ?shot=cover shows the cover alone.
// `photo` picks the sample (samples/<photo>.jpg) and `caption` the words. window.__shotReady is set once painted.
// The flag is set on the next paint via requestAnimationFrame, with a setTimeout fallback so hidden or
// throttled tabs (where RAF never fires) still signal readiness to a screenshot harness.
export async function runShot(shot, query, load) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  await load(`samples/${query.get('photo') ?? 'pier'}.jpg`, query.get('caption') ?? 'Sunset Heist');
  let fired = false;
  const mark = () => {
    if (fired) return;
    fired = true;
    window.__shotReady = true;
  };
  requestAnimationFrame(() => requestAnimationFrame(mark));
  setTimeout(mark, 300);
}
