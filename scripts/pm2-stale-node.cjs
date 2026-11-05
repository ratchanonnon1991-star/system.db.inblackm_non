// Reads `pm2 jlist` on stdin and prints the names (space separated) of the
// apps in ecosystem.config.cjs that pm2 runs with a different Node than this
// one, or in cluster mode (which runs on the daemon's Node whatever the
// interpreter says). A pm2 restart keeps both, so these have to be deleted and
// started again — only these apps, never the pm2 daemon, which other sites on
// the server share.
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
    .filter((proc) => ours.has(proc.name) && (
      proc.pm2_env?.exec_interpreter !== process.execPath
      || proc.pm2_env?.exec_mode === "cluster_mode"
      || (proc.pm2_env?.node_version && proc.pm2_env.node_version !== process.versions.node)
    ))
    .map((proc) => proc.name);
  process.stdout.write([...new Set(stale)].join(" "));
});
