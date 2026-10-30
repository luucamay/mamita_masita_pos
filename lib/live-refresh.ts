export function createLiveRefresh<T>({ load, apply, failed, canRun = () => true, delay = 250, retry = 5000 }: {
  load: (signal: AbortSignal) => Promise<T>; apply: (value: T) => void; failed: (error: unknown) => void;
  canRun?: () => boolean; delay?: number; retry?: number;
}) {
  let dirty = false, running = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null, abort: AbortController | null = null;
  function schedule(wait: number) {
    if (disposed || running || !canRun()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, wait);
  }
  async function run() {
    timer = null;
    if (disposed || running || !canRun()) return;
    dirty = false; running = true; abort = new AbortController();
    let failure = false;
    try { const value = await load(abort.signal); if (!disposed) apply(value); }
    catch (error) { failure = true; if (!disposed) failed(error); }
    finally { running = false; abort = null; if (!disposed && (dirty || failure)) schedule(failure ? retry : 0); }
  }
  return {
    request(immediate = false) { if (disposed) return; dirty = true; if (!timer || immediate) schedule(immediate ? 0 : delay); },
    dispose() { disposed = true; if (timer) clearTimeout(timer); abort?.abort(); },
  };
}
