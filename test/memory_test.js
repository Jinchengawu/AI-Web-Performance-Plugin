const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const sandbox = {
  console,
  performance: {
    now: () => 0,
    memory: { usedJSHeapSize: 10_000_000, totalJSHeapSize: 20_000_000, jsHeapSizeLimit: 2_000_000_000 },
  },
  document: { getElementsByTagName: () => ({ length: 10 }) },
  PerformanceObserver: class { observe() {} },
  addEventListener() {},
  setInterval() {},
  crossOriginIsolated: false,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("probes/runtime.js", "utf8"), sandbox);

const base = Date.now();
const growing = [0, 10, 20, 30, 40, 50, 60].map((seconds, index) => ({
  at: base + seconds * 1000,
  usedJSHeapSize: 100 * 1024 * 1024 + index * 30 * 1024 * 1024,
}));
const highRisk = sandbox.PerfLensRuntime.analyzeMemorySamples(growing);
assert.equal(highRisk.level, "high");
assert(highRisk.slopeBytesPerMinute > 20 * 1024 * 1024);

const short = growing.slice(0, 2);
assert.equal(sandbox.PerfLensRuntime.analyzeMemorySamples(short).level, "insufficient");
assert.equal(sandbox.PerfLensRuntime.analyzeMemorySamples(short, 1024 * 1024 * 1024).level, "high");
console.log("PerfLens memory trend tests passed");
