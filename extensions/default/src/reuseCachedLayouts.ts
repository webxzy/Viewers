const reuseCachedLayout = (state, syncService) => {
  const { hpInfo, activeViewportIndex } = state;
  const { hangingProtocolId, stageIdx, custom = false } = hpInfo;
  const storeId = `${hangingProtocolId}:${stageIdx}`;
  const syncState = syncService.getState();
  const cacheId = hpInfo.hangingProtocolId;
  const viewportGridStore = { ...syncState.viewportGridStore };
  const hanging = { ...syncState.hanging };
  const reuseIdMap = { ...syncState.reuseIdMap };

  hanging[cacheId] = hpInfo;

  if (storeId && custom) {
    viewportGridStore[storeId] = { ...state };
  }

  for (let idx = 0; idx < state.viewports.length; idx++) {
    const viewport = state.viewports[idx];
    const { displaySetOptions, displaySetInstanceUIDs } = viewport;
    if (!displaySetOptions) continue;
    for (let i = 0; i < displaySetOptions.length; i++) {
      const displaySetUID = displaySetInstanceUIDs[i];
      if (!displaySetUID) continue;
      if (idx === activeViewportIndex && i === 0) {
        reuseIdMap.activeDisplaySet = displaySetUID;
      }
      const reuseId = displaySetOptions[i]?.reuseId;
      if (reuseId) {
        reuseIdMap[reuseId] = displaySetUID;
      }
    }
  }

  const toReduce = { hanging, viewportGridStore, reuseIdMap };
  return syncService.reduce(toReduce);
};

export default reuseCachedLayout;
