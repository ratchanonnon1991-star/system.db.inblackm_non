export function buildGameinfoUpdate(draft, dataMode = "uid") {
  const fields = {
    region: draft.region,
    platform: draft.platform,
    server: draft.server,
    botManual: draft.botManual,
  };
  if (dataMode !== "idpass") fields.game = draft.game;
  return fields;
}

export function buildGameinfoStatusUpdate(status) {
  return { enabled: status !== "offline" };
}

function imageFor(images, name) {
  return Object.entries(images).find(([key]) => key.toLocaleLowerCase("th") === name.toLocaleLowerCase("th"))?.[1] || "";
}

export function updateGameinfoImage(images, name, imageUrl) {
  const currentName = Object.keys(images).find((key) => key.toLocaleLowerCase("th") === name.toLocaleLowerCase("th"));
  if (!imageUrl) return Object.fromEntries(Object.entries(images).filter(([key]) => key !== currentName));
  if (currentName && images[currentName] === imageUrl) return images;
  return { ...images, [currentName || name]: imageUrl };
}

export function listChangedGameinfoImages(savedImages, images) {
  const names = new Map([...Object.keys(savedImages), ...Object.keys(images)].map((name) => [name.toLocaleLowerCase("th"), name]));
  return [...names.values()].flatMap((name) => {
    const imageUrl = imageFor(images, name);
    return imageUrl === imageFor(savedImages, name) ? [] : [{ name, imageUrl }];
  });
}
