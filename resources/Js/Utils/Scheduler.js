if (!Promise.allSettled) {
  Promise.allSettled = (promises) =>
    Promise.all(
      promises.map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason }),
        ),
      ),
    );
}

if (!Object.fromEntries) {
  Object.fromEntries = (iterable) => {
    const obj = {};
    for (const [key, value] of iterable) obj[key] = value;
    return obj;
  };
}

if (!Array.prototype.flat) {
  Array.prototype.flat = function (depth) {
    const d = depth === undefined ? 1 : Math.floor(depth);
    if (d < 1) return this.slice();
    return (function flatten(arr, currentDepth) {
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i]) && currentDepth > 0)
          flatten(arr[i], currentDepth - 1).forEach((v) => result.push(v));
        else result.push(arr[i]);
      }
      return result;
    })(this, d);
  };
}

if (!window.requestIdleCallback) {
  window.requestIdleCallback = (cb, options) => {
    const start = Date.now();
    const timeout = options?.timeout ?? 1;
    return setTimeout(() => {
      cb({
        didTimeout: Date.now() - start >= timeout,
        timeRemaining() {
          return Math.max(0, 50 - (Date.now() - start));
        },
      });
    }, 1);
  };
  window.cancelIdleCallback = clearTimeout;
}

const scheduler = (() => {
  function frame(fn) {
    let raf = 0;
    let lastArgs = [];
    const run = (...args) => {
      lastArgs = args;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const queuedArgs = lastArgs;
        lastArgs = [];
        fn(...queuedArgs);
      });
    };
    run.cancel = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastArgs = [];
    };
    return run;
  }

  function delay(fn, ms = 0) {
    let timer = 0;
    let lastArgs = [];
    const run = (...args) => {
      lastArgs = args;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = 0;
        const queuedArgs = lastArgs;
        lastArgs = [];
        fn(...queuedArgs);
      }, ms);
    };
    run.cancel = () => {
      clearTimeout(timer);
      timer = 0;
      lastArgs = [];
    };
    run.flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      const queuedArgs = lastArgs;
      lastArgs = [];
      fn(...queuedArgs);
    };
    return run;
  }

  function idle(fn, timeout = 500) {
    const request = window.requestIdleCallback
      ? (cb) => window.requestIdleCallback(cb, { timeout })
      : (cb) => setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 1);
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = request(fn);
    return () => cancel(handle);
  }

  return { frame, delay, idle };
})();
