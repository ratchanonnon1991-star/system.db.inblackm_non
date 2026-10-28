// Reads `pm2 jlist` on stdin and prints the names (space separated) of the
// apps in ecosystem.config.cjs that pm2 runs with a different Node than this
// one. A pm2 restart keeps a process's interpreter, so after the deploy Node
// changes these have to be deleted and started again — only these apps, never
// the pm2 daemon, which other sites on the server share.
const { apps } = require("../ecosystem.config.cjs");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  // An out-of-date daemon prints a warning before the JSON.
  const start = input.indexOf("[");
  let running = [];
  try {
    running = start < 0 ? [] : JSON.parse(input.slice(start));
  } catch {
    running = [];
  }
  const ours = new Set(apps.map((app) => app.name));
  const stale = running
    .filter((proc) => ours.has(proc.name) && proc.pm2_env?.exec_interpreter !== process.execPath)
    .map((proc) => proc.name);
  process.stdout.write([...new Set(stale)].join(" "));
});
