window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type === "INBLACKM_SOCIAL_STATUS") {
    chrome.storage.local.get({ lastCheckAt: "", nextCheckAt: 0 }).then((status) => window.postMessage({ type: "INBLACKM_SOCIAL_STATUS_RESULT", status }, location.origin));
  }
  if (event.data?.type === "INBLACKM_SOCIAL_CHECK") {
    window.postMessage({ type: "INBLACKM_SOCIAL_CHECK_STARTED" }, location.origin);
    chrome.runtime.sendMessage({ type: "RUN_SOCIAL_FEED_CHECK" }).then((result) => {
      window.postMessage({ type: "INBLACKM_SOCIAL_CHECK_FINISHED", result }, location.origin);
      chrome.storage.local.get({ lastCheckAt: "", nextCheckAt: 0 }).then((status) => window.postMessage({ type: "INBLACKM_SOCIAL_STATUS_RESULT", status }, location.origin));
    });
  }
  if (event.data?.type === "INBLACKM_SOCIAL_LOGIN") {
    window.postMessage({ type: "INBLACKM_SOCIAL_LOGIN_STARTED" }, location.origin);
    chrome.runtime.sendMessage({ type: "BEGIN_FACEBOOK_LOGIN", label: event.data.label, targetInstanceId: event.data.targetInstanceId }).then((result) => window.postMessage({ type: "INBLACKM_SOCIAL_LOGIN_RESULT", result }, location.origin));
  }
});
