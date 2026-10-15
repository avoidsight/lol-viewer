// Optional metadata must not hold a healthy history hostage. The underlying
// transport retains its own deadline; cancellation here only stops this waiter.
export function optionalWithin<T>(request: Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value?: T) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish();
    request.then(value => finish(value), () => finish());
    if (signal?.aborted) { finish(); return; }
    timer = setTimeout(abort, 1500);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
