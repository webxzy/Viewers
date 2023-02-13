import { Services } from '@ohif/core';

import DicomTagBrowser from './DicomTagBrowser/DicomTagBrowser';
import reuseCachedLayouts from './reuseCachedLayouts';

const commandsModule = ({ servicesManager, commandsManager }) => {
  const {
    measurementService,
    hangingProtocolService,
    uiNotificationService,
    viewportGridService,
    displaySetService,
    stateSyncService,
  } = servicesManager.services as Services;

  const actions = {
    displayNotification: ({ text, title, type }) => {
      uiNotificationService.show({
        title: title,
        message: text,
        type: type,
      });
    },
    clearMeasurements: () => {
      measurementService.clear();
    },

    /**
     *  Sets the specified protocol
     *    1. Records any existing state using the viewport grid service
     *    2. Finds the destination state - this can be one of:
     *       a. The specified protocol stage
     *       b. An alternate (toggled or restored) protocol stage
     *       c. A restored custom layout
     *    3. Finds the parameters for the specified state
     *       a. Gets the reuseIdMap
     *       b. Gets the map by position
     *       c. Gets any toggle mapping to map position to/from current view
     *    4. If restore, then sets layout
     *       a. Maps viewport position by currently displayed viewport map id
     *       b. Uses toggle information to map display set id
     *    5. Else applies the hanging protocol
     *       a. HP Service is provided reuseIdMap
     *       b. HP Service will ignore any reuseId instances which don't apply
     *       c. HP Service will throw an exception if it isn't applicable
     */
    setHangingProtocol: ({ protocolId, stageId, stageIndex }) => {
      // Stores in the state the reuseID to displaySetUID mapping
      // Pass in viewportId for the active viewport.  This item will get set as
      // the activeViewportId
      const state = viewportGridService.getState();
      const { hpInfo } = state;
      const { reuseIdMap, viewportGridStore } = reuseCachedLayouts(
        state,
        stateSyncService
      );

      const useStageIdx =
        stageIndex ??
        hangingProtocolService.getStageIndex(protocolId, {
          stageId,
          stageIndex,
        });
      const storedHanging = `${protocolId}:${useStageIdx || 0}`;

      if (
        protocolId === hpInfo.hangingProtocolId &&
        useStageIdx === hpInfo.stageIdx
      ) {
        // Clear the HP setting to reset them
        hangingProtocolService.setProtocol(protocolId, {
          stageId,
          stageIndex: useStageIdx,
        });
      } else if (viewportGridStore[storedHanging]) {
        viewportGridService.restoreCachedLayout(
          viewportGridStore[storedHanging]
        );
      } else {
        hangingProtocolService.setProtocol(protocolId, {
          reuseIdMap,
          stageId,
          stageIndex: useStageIdx,
        });
      }
    },

    deltaStage: ({ direction }) => {
      const state = viewportGridService.getState();
      const { hangingProtocolId: protocolId, stageIdx } = state.hpInfo;
      const { protocol } = hangingProtocolService.getActiveProtocol();
      const stageIndex = stageIdx + direction;
      if (stageIndex >= 0 && stageIndex <= protocol.stages.length) {
        actions.setHangingProtocol({ protocolId, stageIndex });
      } else {
        console.log(
          'No stage available at',
          stageIndex,
          protocol.stages.length
        );
      }
    },

    previousStage: () => {
      const state = viewportGridService.getState();
      const { reuseIdMap } = reuseCachedLayouts(state, stateSyncService);
      // next stage in hanging protocols
      hangingProtocolService.previousProtocolStage({ reuseIdMap });
    },

    /**
     * Changes the viewport layout in terms of the MxN layout.
     */
    setViewportLayout: ({ numRows, numCols }) => {
      const state = viewportGridService.getState();
      const { hangingProtocolId, stageIdx } = state.hpInfo;

      const initialInDisplay = [];
      state.viewports.forEach(vp => {
        if (vp.displaySetInstanceUIDs) {
          initialInDisplay.push(...vp.displaySetInstanceUIDs);
        }
      });

      // The find or create viewport fills in missing viewports by first
      // looking for previously used viewports, by position, and secondly
      // by asking the hanging protocol service to provide a viewport.
      const findOrCreateViewport = (
        viewportIdx,
        positionId,
        cached,
        options
      ) => {
        const byPositionViewport = cached.byPosition?.[positionId];
        if (byPositionViewport) return { ...byPositionViewport };
        const missing = hangingProtocolService.getMissingViewport(
          hangingProtocolId,
          stageIdx,
          positionId,
          options
        );
        if (missing) {
          if (!options.inDisplay) {
            options.inDisplay = [...initialInDisplay];
          }
          const displaySetInstanceUIDs = missing.displaySetsInfo.map(
            it => it.displaySetInstanceUID
          );
          options.inDisplay.push(...displaySetInstanceUIDs);
          return {
            displaySetInstanceUIDs,
            displaySetOptions: missing.displaySetsInfo.map(
              it => it.displaySetOptions
            ),
            viewportOptions: {
              ...missing.viewportOptions,
            },
          };
        }
        return {};
      };

      viewportGridService.setLayout({ numRows, numCols, findOrCreateViewport });
    },

    openDICOMTagViewer() {
      const { activeViewportIndex, viewports } = viewportGridService.getState();
      const activeViewportSpecificData = viewports[activeViewportIndex];
      const { displaySetInstanceUIDs } = activeViewportSpecificData;

      const displaySets = displaySetService.activeDisplaySets;
      const { UIModalService } = servicesManager.services;

      const displaySetInstanceUID = displaySetInstanceUIDs[0];
      UIModalService.show({
        content: DicomTagBrowser,
        contentProps: {
          displaySets,
          displaySetInstanceUID,
          onClose: UIModalService.hide,
        },
        title: 'DICOM Tag Browser',
      });
    },
  };

  const definitions = {
    clearMeasurements: {
      commandFn: actions.clearMeasurements,
      storeContexts: [],
      options: {},
    },
    displayNotification: {
      commandFn: actions.displayNotification,
      storeContexts: [],
      options: {},
    },
    setHangingProtocol: {
      commandFn: actions.setHangingProtocol,
      storeContexts: [],
      options: {},
    },
    nextStage: {
      commandFn: actions.deltaStage,
      storeContexts: [],
      options: { direction: 1 },
    },
    previousStage: {
      commandFn: actions.deltaStage,
      storeContexts: [],
      options: { direction: -1 },
    },
    setViewportLayout: {
      commandFn: actions.setViewportLayout,
      storeContexts: [],
      options: {},
    },
    openDICOMTagViewer: {
      commandFn: actions.openDICOMTagViewer,
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'DEFAULT',
  };
};

export default commandsModule;
