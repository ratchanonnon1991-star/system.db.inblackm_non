// Production aliases only. Never import tests/register.mjs (it replaces DBs with stubs).
import { register } from "node:module";
register("./app-alias-loader.mjs", import.meta.url);
