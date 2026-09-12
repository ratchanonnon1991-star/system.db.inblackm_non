/* global chrome */
import "./config.js";
import { createConnector } from "./connector.js";
import { PROVIDERS } from "./protocol.js";

const connector = createConnector(chrome, globalThis.RUSSIA_CHECK_CONFIG);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  connector.message(message || {}, sender).then(reply, (error) => reply({ error: error.message }));
  return true;
});
chrome.webRequest.onBeforeRequest.addListener((details) => {
  void connector.capture(details).catch(() => {});
}, { urls: Object.values(PROVIDERS).map((provider) => `${provider.productsUrl}*`), types: ["xmlhttprequest"] }, ["requestBody"]);
chrome.tabs.onRemoved.addListener((id) => { void connector.tabClosed(id).catch(() => {}); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "russia-check-expiry") void connector.tick().catch(() => {});
});
