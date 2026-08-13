const { spawn } = require("child_process");
const net = require("net");

const server = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], { stdio: "ignore" });

function waitForPort(timeout = 10_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(8765, "127.0.0.1");
      socket.once("connect", () => { socket.end(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeout) reject(new Error("测试服务器启动超时"));
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

(async () => {
  try {
    await waitForPort();
    const test = spawn(process.execPath, ["test/browser_integration.js"], { stdio: "inherit", env: process.env });
    const code = await new Promise((resolve) => test.once("exit", resolve));
    process.exitCode = code || 0;
  } finally {
    server.kill("SIGTERM");
  }
})().catch((error) => { console.error(error); server.kill("SIGTERM"); process.exit(1); });
