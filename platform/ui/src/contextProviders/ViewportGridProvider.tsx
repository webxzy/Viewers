import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import PropTypes from 'prop-types';
import isEqual from 'lodash.isequal';
import viewportLabels from '../utils/viewportLabels';
import getPresentationId from './getPresentationId';

const DEFAULT_STATE = {
  activeViewportIndex: 0,
  cachedLayout: {
    // byPosition is a map of position to viewport info
    byPosition: {},
  },
  hpInfo: {
    hangingProtocolId: '',
    stageId: '',
    stageIdx: 0,
  },
  layout: {
    numRows: 0,
    numCols: 0,
    layoutType: 'grid',
  },
  viewports: [
    {
      displaySetInstanceUIDs: [],
      viewportOptions: {},
      displaySetSelectors: [],
      displaySetOptions: [{}],
      x: 0, // left
      y: 0, // top
      width: 100,
      height: 100,
      viewportLabel: null,
    },
  ],
};

export const ViewportGridContext = createContext(DEFAULT_STATE);

const findOrCreate = (index, positionId, cached) => ({
  ...(cached.byPosition?.[positionId] || {}),
});

const reuseViewport = (idSet, viewport, stateViewports) => {
  const oldIds = {};
  for (const oldViewport of stateViewports) {
    const { viewportId: oldId } = oldViewport;
    oldIds[oldId] = true;
    if (!oldId || idSet[oldId]) continue;
    if (
      !isEqual(
        oldViewport.displaySetInstanceUIDs,
        viewport.displaySetInstanceUIDs
      )
    ) {
      continue;
    }
    idSet[oldId] = true;
    // TODO re-use viewports once the flickering/wrong size redraw is fixed
    // return {
    //   ...oldViewport,
    //   ...viewport,
    //   viewportOptions: {
    //     ...oldViewport.viewportOptions,

    //     viewportId: oldViewport.viewportId,
    //   },
    // };
  }
  for (let i = 0; i < 10000; i++) {
    const viewportId = 'viewport-' + i;
    if (idSet[viewportId] || oldIds[viewportId]) continue;
    idSet[viewportId] = true;
    return {
      ...viewport,
      viewportId,
      viewportOptions: { ...viewport.viewportOptions, viewportId },
    };
  }
  throw new Error('No ID found');
};

export function ViewportGridProvider({ children, service }) {
  const viewportGridReducer = (state, action) => {
    switch (action.type) {
      case 'SET_ACTIVE_VIEWPORT_INDEX': {
        return { ...state, ...{ activeViewportIndex: action.payload } };
      }
      case 'SET_DISPLAYSET_FOR_VIEWPORT': {
        const payload = action.payload;
        const { viewportIndex, displaySetInstanceUIDs } = payload;

        // Note: there should be no inheritance happening at this level,
        // we can't assume the new displaySet can inherit the previous
        // displaySet's or viewportOptions at all. For instance, dragging
        // and dropping a SEG/RT displaySet without any viewportOptions
        // or displaySetOptions should not inherit the previous displaySet's
        // which might have been a PDF Viewport. The viewport itself
        // will deal with inheritance if required. Here is just a simple
        // provider.
        const viewport = state.viewports[viewportIndex] || {};
        const viewportOptions = {
          ...viewport.viewportOptions,
          ...payload.viewportOptions,
        };

        // There can be display set options inheritance, since that is used
        // to store reuseIds and other keys
        const displaySetOptions = payload.displaySetOptions || [];
        if (displaySetOptions.length === 0) {
          // Only copy index 0, as that is all that is currently supported by this
          // method call.
          displaySetOptions.push({ ...viewport.displaySetOptions?.[0] });
        }

        const viewports = state.viewports.slice();

        const newView = {
          ...viewport,
          displaySetInstanceUIDs,
          viewportOptions,
          displaySetOptions,
          viewportLabel: viewportLabels[viewportIndex],
        };
        viewportOptions.presentationId = getPresentationId(newView, viewports);

        // merge the displaySetOptions and viewportOptions and displaySetInstanceUIDs
        // into the viewport object at the given index
        // TODO - perform a deep copy of viewportOptions and displaySetOptions
        viewports[viewportIndex] = newView;

        return { ...state, viewports };
      }
      case 'SET_LAYOUT': {
        const {
          numCols,
          numRows,
          layoutOptions,
          hpInfo,
          layoutType = 'grid',
          findOrCreateViewport,
        } = action.payload;

        // If empty viewportOptions, we use numRow and numCols to calculate number of viewports
        const hasOptions = layoutOptions?.length;
        const viewports = [];
        const byPosition = { ...(state.cachedLayout.byPosition || {}) };
        const cachedLayout = { ...state.cachedLayout, byPosition };

        // Options is a cache of values allowing for findOrCreate to store
        // information on progress, reset on every state update
        const options = {};

        for (const viewport of state.viewports) {
          if (viewport.positionId) {
            const storedViewport = {
              ...viewport,
              viewportOptions: { ...viewport.viewportOptions },
            };
            byPosition[viewport.positionId] = storedViewport;
            // The cache doesn't store the viewport options - it is only useful
            // for remembering the type of viewport and UIDs
            delete storedViewport.viewportId;
            delete storedViewport.viewportOptions.viewportId;
          }
        }

        let activeViewportIndex;
        for (let row = 0; row < numRows; row++) {
          for (let col = 0; col < numCols; col++) {
            const pos = col + row * numCols;
            const layoutOption = layoutOptions[pos];
            const positionId = layoutOption?.positionId || `${col}-${row}`;
            if ((hasOptions && pos < layoutOptions.length) || !hasOptions) {
              if (
                !activeViewportIndex ||
                state.viewports[pos]?.positionId === positionId
              ) {
                activeViewportIndex = pos;
              }
              const viewport = findOrCreateViewport(
                pos,
                positionId,
                cachedLayout,
                options
              );
              if (!viewport) continue;
              viewport.positionId = positionId;
              // Create a new viewport object as it is getting updated here
              // and it is part of the read only state
              viewports.push(viewport);
              let xPos, yPos, w, h;

              if (layoutOptions && layoutOptions[pos]) {
                ({ x: xPos, y: yPos, width: w, height: h } = layoutOptions[
                  pos
                ]);
              } else {
                w = 1 / numCols;
                h = 1 / numRows;
                xPos = col * w;
                yPos = row * h;
              }

              viewport.width = w;
              viewport.height = h;
              viewport.x = xPos;
              viewport.y = yPos;
            }
          }
        }

        const viewportIdSet = {};
        for (
          let viewportIndex = 0;
          viewportIndex < viewports.length;
          viewportIndex++
        ) {
          const viewport = reuseViewport(
            viewportIdSet,
            viewports[viewportIndex],
            state.viewports
          );
          if (!viewport.viewportOptions.presentationId) {
            viewport.viewportOptions.presentationId = getPresentationId(
              viewport,
              viewports
            );
          }
          viewport.viewportIndex = viewportIndex;
          viewport.viewportLabel = viewportLabels[viewportIndex];
          viewports[viewportIndex] = viewport;
        }

        const ret = {
          ...state,
          activeViewportIndex,
          layout: {
            ...state.layout,
            numCols,
            numRows,
            layoutType,
          },
          hpInfo: hpInfo || { ...state.hpInfo, custom: true },
          viewports,
          cachedLayout,
        };
        return ret;
      }
      case 'RESET': {
        return DEFAULT_STATE;
      }

      // Restore a previously cached layout.
      case 'RESTORE_CACHED_LAYOUT': {
        const restoreState = action.payload;

        if (!restoreState) {
          console.warn(
            `No cached layout found for cacheId: ${cacheId}. Ignoring...`
          );
          return state;
        }

        return { ...state, ...restoreState };
      }

      case 'SET': {
        return {
          ...state,
          ...action.payload,
        };
      }

      default:
        return action.payload;
    }
  };

  const [viewportGridState, dispatch] = useReducer(
    viewportGridReducer,
    DEFAULT_STATE
  );

  const getState = useCallback(() => {
    return viewportGridState;
  }, [viewportGridState]);

  const setActiveViewportIndex = useCallback(
    index => dispatch({ type: 'SET_ACTIVE_VIEWPORT_INDEX', payload: index }),
    [dispatch]
  );

  const setDisplaySetsForViewport = useCallback(
    ({
      viewportIndex,
      displaySetInstanceUIDs,
      viewportOptions,
      displaySetSelectors,
      displaySetOptions,
    }) =>
      dispatch({
        type: 'SET_DISPLAYSET_FOR_VIEWPORT',
        payload: {
          viewportIndex,
          displaySetInstanceUIDs,
          viewportOptions,
          displaySetSelectors,
          displaySetOptions,
        },
      }),
    [dispatch]
  );

  const setDisplaySetsForViewports = useCallback(
    viewports => {
      viewports.forEach(data => {
        setDisplaySetsForViewport(data);
      });
    },
    [setDisplaySetsForViewport]
  );

  const setLayout = useCallback(
    ({
      layoutType,
      numRows,
      numCols,
      hpInfo,
      layoutOptions = [],
      findOrCreateViewport = findOrCreate,
    }) =>
      dispatch({
        type: 'SET_LAYOUT',
        payload: {
          layoutType,
          numRows,
          numCols,
          hpInfo,
          layoutOptions,
          findOrCreateViewport,
        },
      }),
    [dispatch]
  );

  const reset = useCallback(
    () =>
      dispatch({
        type: 'RESET',
        payload: {},
      }),
    [dispatch]
  );

  const setCachedLayout = useCallback(
    payload =>
      dispatch({
        type: 'SET_CACHED_LAYOUT',
        payload,
      }),
    [dispatch]
  );

  const restoreCachedLayout = useCallback(
    cacheId => {
      dispatch({
        type: 'RESTORE_CACHED_LAYOUT',
        payload: cacheId,
      });
    },
    [dispatch]
  );

  const set = useCallback(
    payload =>
      dispatch({
        type: 'SET',
        payload,
      }),
    [dispatch]
  );

  /**
   * Sets the implementation of ViewportGridService that can be used by extensions.
   *
   * @returns void
   */
  useEffect(() => {
    if (service) {
      service.setServiceImplementation({
        getState,
        setActiveViewportIndex,
        setDisplaySetsForViewport,
        setDisplaySetsForViewports,
        setLayout,
        reset,
        onModeExit: reset,
        setCachedLayout,
        restoreCachedLayout,
        set,
      });
    }
  }, [
    getState,
    service,
    setActiveViewportIndex,
    setDisplaySetsForViewport,
    setDisplaySetsForViewports,
    setLayout,
    reset,
    setCachedLayout,
    restoreCachedLayout,
    set,
  ]);

  const api = {
    getState,
    setActiveViewportIndex: index => service.setActiveViewportIndex(index), // run it through the service itself since we want to publish events
    setDisplaySetsForViewport,
    setDisplaySetsForViewports,
    setLayout,
    setCachedLayout,
    restoreCachedLayout,
    reset,
    set,
  };

  return (
    <ViewportGridContext.Provider value={[viewportGridState, api]}>
      {children}
    </ViewportGridContext.Provider>
  );
}

ViewportGridProvider.propTypes = {
  children: PropTypes.any,
  service: PropTypes.shape({
    setServiceImplementation: PropTypes.func,
  }).isRequired,
};

export const useViewportGrid = () => useContext(ViewportGridContext);
