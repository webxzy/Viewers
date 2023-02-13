import { PubSubService } from '../_shared/pubSubServiceInterface';
import sortBy from '../../utils/sortBy';
import ProtocolEngine from './ProtocolEngine';
import StudyMetadata from '../../types/StudyMetadata';
import IDisplaySet from '../DisplaySetService/IDisplaySet';
import { HangingProtocol, CommandsManager, Services } from '../../types';

type Protocol = HangingProtocol.Protocol | HangingProtocol.ProtocolGenerator;

const DEFAULT_VIEWPORT_OPTIONS: HangingProtocol.ViewportOptions = {
  toolGroupId: 'default',
  viewportType: 'stack',
};

class HangingProtocolService extends PubSubService {
  static EVENTS = {
  PROTOCOL_CHANGED: 'event::hanging_protocol_changed',
  NEW_LAYOUT: 'event::hanging_protocol_new_layout',
    STAGE_ACTIVATION: 'event::hanging_protocol_stage_activation',
  CUSTOM_IMAGE_LOAD_PERFORMED:
    'event::hanging_protocol_custom_image_load_performed',
};

  public static REGISTRATION = {
    name: 'hangingProtocolService',
    altName: 'HangingProtocolService',
    create: ({ configuration = {}, commandsManager, servicesManager }) => {
      return new HangingProtocolService(commandsManager, servicesManager);
    },
  };

  public static REGISTRATION = {
    name: 'hangingProtocolService',
    altName: 'HangingProtocolService',
    create: ({ configuration = {}, commandsManager, servicesManager }) => {
      return new HangingProtocolService(commandsManager, servicesManager);
    },
  };

  studies: StudyMetadata[];
  // stores all the protocols (object or function that returns an object) in a map
  protocols: Map<string, Protocol>;
  // Contains the list of currently active keys
  activeProtocolIds: string[];
  // the current protocol that is being applied to the viewports in object format
  protocol: HangingProtocol.Protocol;
  stage: number;
  _commandsManager: CommandsManager;
  _servicesManager: Record<string, unknown>;
  protocolEngine: ProtocolEngine;
  customViewportSettings = [];
  displaySets: IDisplaySet[] = [];
  activeStudy: Record<string, unknown>;
  debugLogging: false;

  customAttributeRetrievalCallbacks = {
    NumberOfStudyRelatedSeries: {
      name: 'The number of series in the study',
      callback: metadata =>
        metadata.NumberOfStudyRelatedSeries ?? metadata.series?.length,
    },
    NumberOfSeriesRelatedInstances: {
      name: 'The number of instances in the display set',
      callback: metadata => metadata.numImageFrames,
    },
    ModalitiesInStudy: {
      name: 'Gets the array of the modalities for the series',
      callback: metadata =>
        metadata.ModalitiesInStudy ??
        (metadata.series || []).reduce((prev, curr) => {
          const { Modality } = curr;
          if (Modality && prev.indexOf(Modality) == -1) prev.push(Modality);
          return prev;
        }, []),
    },
    isReconstructable: {
      name: 'Checks if the display set is reconstructable',
      // we can add more advanced checking here
      callback: displaySet => displaySet.isReconstructable ?? false,
    },
  };
  listeners = {};
  registeredImageLoadStrategies = {};
  activeImageLoadStrategyName = null;
  customImageLoadPerformed = false;

  /**
   * displaySetMatchDetails = <displaySetId, match>
   * DisplaySetId is the id defined in the hangingProtocol object itself
   * and match is an object that contains information about
   */
  displaySetMatchDetails: Map<
    string, // protocol displaySetId in the displayset selector
    HangingProtocol.DisplaySetMatchDetails
  > = new Map();

  /**
   * An array that contains for each viewport (viewportIndex) specified in the
   * hanging protocol, an object of the form
   */
  viewportMatchDetails: Map<
    number, // viewportIndex
    HangingProtocol.ViewportMatchDetails
  > = new Map();

  constructor(commandsManager: CommandsManager, servicesManager) {
    super(HangingProtocolService.EVENTS);
    this._commandsManager = commandsManager;
    this._servicesManager = servicesManager;
    this.protocols = new Map();
    this.protocolEngine = undefined;
    this.protocol = undefined;
    this.stage = undefined;

    this.studies = [];
  }

  public destroy(): void {
    this.reset();
    this.protocols = new Map();
  }

  public reset(): void {
    this.studies = [];
    this.viewportMatchDetails = new Map();
    this.displaySetMatchDetails = new Map();
  }

  /** Leave the hanging protocol in the initialized state */
  public onModeExit(): void {
    this.reset();
  }

  public getActiveProtocol(): {
    protocol: HangingProtocol.Protocol;
    stage: number;
  } {
    return { protocol: this.protocol, stage: this.stage };
  }

  public getDefaultProtocol(): HangingProtocol.Protocol {
    return this.getProtocolById('default');
  }

  public getMatchDetails(): HangingProtocol.HangingProtocolMatchDetails {
    return {
      viewportMatchDetails: this.viewportMatchDetails,
      displaySetMatchDetails: this.displaySetMatchDetails,
    };
  }

  /**
   * It loops over the protocols map object, and checks whether the protocol
   * is a function, if so, it executes it and returns the result as a protocol object
   * otherwise it returns the protocol object itself
   *
   * @returns all the hanging protocol registered in the HangingProtocolService
   */
  public getProtocols(): HangingProtocol.Protocol[] {
    // this.protocols is a map of protocols with the protocol id as the key
    // and the protocol or a function that returns a protocol as the value
    const protocols = [];
    const keys = this.activeProtocolIds || this.protocols.keys();
    // @ts-ignore
    for (const protocolId of keys) {
      const protocol = this.getProtocolById(protocolId);
      if (protocol) {
        protocols.push(protocol);
      }
    }

    return protocols;
  }

  /**
   * Returns the protocol with the given id, it will get the protocol from the
   * protocols map object and if it is a function, it will execute it and return
   * the result as a protocol object
   *
   * @param protocolId - the id of the protocol
   * @returns protocol - the protocol with the given id
   */
  public getProtocolById(id: string): HangingProtocol.Protocol {
    if (id === this.protocol?.id) return this.protocol;
    const protocol = this.protocols.get(id);

    if (protocol instanceof Function) {
      try {
        const { protocol: generatedProtocol } = this._getProtocolFromGenerator(
          protocol
        );

        return generatedProtocol;
      } catch (error) {
        console.warn(
          `Error while executing protocol generator for protocol ${id}: ${error}`
        );
      }
    } else {
      return this._validateProtocol(protocol);
    }
  }

  /**
   * It adds a protocol to the protocols map object. If a protocol with the given
   * id already exists, warn the user and overwrite it.  This can be used to
   * set a new "default" protocol.
   *
   * @param {string} protocolId - The id of the protocol.
   * @param {Protocol} protocol - Protocol - This is the protocol that you want to
   * add to the protocol manager.
   */
  public addProtocol(protocolId: string, protocol: Protocol): void {
    if (this.protocols.has(protocolId)) {
      console.warn(
        `A protocol with id ${protocolId} already exists. It will be overwritten.`
      );
    }

    if (!(protocol instanceof Function)) {
      protocol = this._validateProtocol(protocol as HangingProtocol.Protocol);
    }

    this.protocols.set(protocolId, protocol);
  }

  /**
   * Add a given protocol object as active.
   * If active protocols ids is null right now, then the specified
   * protocol will become the only active protocol.
   */
  public addActiveProtocol(id: string): void {
    if (!id) {
      return;
    }
    if (!this.activeProtocolIds) {
      this.activeProtocolIds = [];
    }
    this.activeProtocolIds.push(id);
  }

  /**
   * Sets the active hanging protocols to use, by name.  If the value is empty,
   * then resets the active protocols to all the named items.
   */
  public setActiveProtocols(hangingProtocol?: string[] | string): void {
    if (!hangingProtocol || !hangingProtocol.length) {
      this.activeProtocolIds = null;
      console.log('No active protocols, setting all to active');
      return;
    }
    if (typeof hangingProtocol === 'string') {
      this.setActiveProtocols([hangingProtocol]);
      return;
    }
    this.activeProtocolIds = [...hangingProtocol];
  }

  /**
   * Run the hanging protocol decisions tree on the active study,
   * studies list and display sets, firing a PROTOCOL_CHANGED event when
   * complete to indicate the hanging protocol is ready, and which stage
   * got applied/activated.
   *
   * Also fires a STAGES_ACTIVE event to indicate which stages are able to be
   * activated.
   *
   * @param params is the dataset to run the hanging protocol on.
   * @param params.activeStudy is the "primary" study to hang  This may or may
   *        not be displayed by the actual viewports.
   * @param params.studies is the list of studies to hang
   * @param params.displaySets is the list of display sets associated with
   *        the studies to display in viewports.
   * @param protocol is a specific protocol to apply.
   * @returns
   */
  public run({ studies, displaySets, activeStudy }, protocolId) {
    this.studies = [...studies];
    this.displaySets = displaySets;
    this.activeStudy = activeStudy || studies[0];

    this.protocolEngine = new ProtocolEngine(
      this.getProtocols(),
      this.customAttributeRetrievalCallbacks
    );

    if (protocolId && typeof protocolId === 'string') {
      const protocol = this.getProtocolById(protocolId);
      this._setProtocol(protocol);
      return;
    }

    const matchedProtocol = this.protocolEngine.run({
      studies: this.studies,
      activeStudy,
      displaySets,
    });
    this._setProtocol(matchedProtocol);
  }

  /**
   * Returns true, if the hangingProtocol has a custom loading strategy for the images
   * and its callback has been added to the HangingProtocolService
   * @returns {boolean} true
   */
  public hasCustomImageLoadStrategy(): boolean {
    return (
      this.activeImageLoadStrategyName !== null &&
      this.registeredImageLoadStrategies[
        this.activeImageLoadStrategyName
      ] instanceof Function
    );
  }

  public getCustomImageLoadPerformed(): boolean {
    return this.customImageLoadPerformed;
  }

  /**
   * Set the strategy callback for loading images to the HangingProtocolService
   * @param {string} name strategy name
   * @param {Function} callback image loader callback
   */
  public registerImageLoadStrategy(name, callback): void {
    if (callback instanceof Function && name) {
      this.registeredImageLoadStrategies[name] = callback;
    }
  }

  /**
   * Adds a custom attribute to be used in the HangingProtocol UI and matching rules, including a
   * callback that will be used to calculate the attribute value.
   *
   * @param attributeId The ID used to refer to the attribute (e.g. 'timepointType')
   * @param attributeName The name of the attribute to be displayed (e.g. 'Timepoint Type')
   * @param callback The function used to calculate the attribute value from the other attributes at its level (e.g. study/series/image)
   * @param options to add to the "this" object for the custom attribute retriever
   */
  public addCustomAttribute(
    attributeId: string,
    attributeName: string,
    callback: (metadata: any) => any,
    options: Record<string, any> = {}
  ): void {
    this.customAttributeRetrievalCallbacks[attributeId] = {
      ...options,
      id: attributeId,
      name: attributeName,
      callback,
    };
  }

  /**
   * Switches to the next protocol stage in the display set sequence
   */
  public nextProtocolStage(
    options = null as HangingProtocol.DisplaySetOptions
  ): void {
    console.log('ProtocolEngine::nextProtocolStage');

    if (!this._setCurrentProtocolStage(1, options)) {
      console.log('ProtocolEngine::nextProtocolStage failed');
    }
  }

  /**
   * Switches to the previous protocol stage in the display set sequence
   */
  public previousProtocolStage(
    options = null as HangingProtocol.DisplaySetOptions
  ): void {
    console.log('ProtocolEngine::previousProtocolStage');

    if (!this._setCurrentProtocolStage(-1, options)) {
      console.log('ProtocolEngine::previousProtocolStage failed');
    }
  }

  /**
   * Executes the callback function for the custom loading strategy for the images
   * if no strategy is set, the default strategy is used
   */
  runImageLoadStrategy(data): void {
    const loader = this.registeredImageLoadStrategies[
      this.activeImageLoadStrategyName
    ];
    const loadedData = loader({
      data,
      displaySetsMatchDetails: this.displaySetMatchDetails,
      viewportMatchDetails: this.viewportMatchDetails,
    });

    // if loader successfully re-arranged the data with the custom strategy
    // and returned the new props, then broadcast them
    if (!loadedData) {
      return;
    }

    this.customImageLoadPerformed = true;
    this._broadcastChange(this.EVENTS.CUSTOM_IMAGE_LOAD_PERFORMED, loadedData);
  }

  _updateActiveStudyWith(list: [], propertyKey: string): void {
    const activeStudyInstanceUIDs = list
      .map(item => item[propertyKey])
      .filter(item => !!item);

    const activeStudyStudyInstanceUID = (activeStudyInstanceUIDs || [])[0];
    if (!activeStudyInstanceUIDs || activeStudyInstanceUIDs.length !== 1) {
      console.log(
        'Update active study: Multi active study not supported yet. Using the first on list'
      );
    }

    const activeStudyIndex = this.studies.findIndex(
      study => study.StudyInstanceUID === activeStudyStudyInstanceUID
    );

    if (activeStudyIndex >= 0) {
      this.activeStudy = this.studies[activeStudyIndex];
    } else {
      console.log('Update active study: Unable to locate study to be activate');
    }
  }

  _validateProtocol(
    protocol: HangingProtocol.Protocol
  ): HangingProtocol.Protocol {
    protocol.id = protocol.id || protocol.name;
    const defaultViewportOptions = {
      toolGroupId: 'default',
      viewportType: 'stack',
    };
    // Automatically compute some number of attributes if they
    // aren't present.  Makes defining new HPs easier.
    protocol.name = protocol.name || protocol.id;
    const { stages } = protocol;

    if (!stages) {
      console.warn('Protocol has not stages:', protocol.id, protocol);
      return;
    }

    // Generate viewports automatically as required.
    stages.forEach(stage => {
      if (!stage.viewports) {
        stage.name = stage.name || stage.id;
        stage.viewports = [];
        const { rows, columns } = stage.viewportStructure.properties;

        for (let i = 0; i < rows * columns; i++) {
          stage.viewports.push({
            viewportOptions: defaultViewportOptions,
            displaySets: [],
          });
        }
      } else {
        stage.viewports.forEach(viewport => {
          viewport.viewportOptions =
            viewport.viewportOptions || defaultViewportOptions;
          if (!viewport.displaySets) {
            viewport.displaySets = [];
          } else {
            viewport.displaySets.forEach(displaySet => {
              displaySet.options = displaySet.options || {};
            });
          }
        });
      }
    });

    return protocol;
  }

  private _getProtocolFromGenerator(
    protocolGenerator: HangingProtocol.ProtocolGenerator
  ): {
    protocol: HangingProtocol.Protocol;
  } {
    const { protocol } = protocolGenerator({
      servicesManager: this._servicesManager,
      commandsManager: this._commandsManager,
    });

    const validatedProtocol = this._validateProtocol(protocol);

    return {
      protocol: validatedProtocol,
    };
  }

  getViewportsRequireUpdate(viewportIndex, displaySetInstanceUID) {
    const newDisplaySetInstanceUID = displaySetInstanceUID;
    const protocol = this.protocol;
    const protocolStage = protocol.stages[this.stage];
    const protocolViewports = protocolStage.viewports;
    const protocolViewport = protocolViewports[viewportIndex];

    const defaultReturn = [
      {
        viewportIndex,
        displaySetInstanceUIDs: [newDisplaySetInstanceUID],
      },
    ];

    // if no viewport, then we can assume there is no predefined set of
    // rules that should be applied to this viewport while matching
    if (!protocolViewport) {
      return defaultReturn;
    }

    // no support for drag and drop into fusion viewports yet
    // Todo: smart drag and drop would look at the displaySets and
    // replace the same modality type, but later
    if (protocolViewport.displaySets.length > 1) {
      throw new Error('Cannot update viewport with multiple displaySets yet');
    }

    // If there is no displaySet, then we can assume that the viewport
    // is empty and we can just add the new displaySet to it
    if (protocolViewport.displaySets.length === 0) {
      return defaultReturn;
    }

    // If the viewport options says to allow any instance, then we can assume
    // it just updates this viewport
    if (protocolViewport.viewportOptions.allowUnmatchedView) {
      return defaultReturn;
    }

    // if the viewport is not empty, then we check the displaySets it is showing
    // currently, which means we need to check if the requested updated displaySet
    // follow the same rules as the current displaySets
    const displaySetSelectorId = protocolViewport.displaySets[0].id;
    const displaySetSelector =
      protocol.displaySetSelectors[displaySetSelectorId];

    if (!displaySetSelector) {
      return defaultReturn;
    }

    // so let's check if the new displaySetInstanceUIDs follow the same rules
    this._validateViewportSpecificMatch(
      {
        displaySetInstanceUIDs: [newDisplaySetInstanceUID],
        viewportOptions: {},
        displaySetOptions: [],
      },
      protocolViewport,
      protocol.displaySetSelectors
    );
    // if we reach here, it means there are some rules that should be applied

    // if we don't have any match details for the displaySetSelector the viewport
    // is currently showing, then we can assume that the new displaySetInstanceUID
    // does not
    if (!this.displaySetMatchDetails.get(displaySetSelectorId)) {
      return defaultReturn;
    }

    // if we reach here, it means that the displaySetInstanceUIDs to be dropped
    // in the viewportIndex are valid, and we can proceed with the update. However
    // we need to check if the displaySets that the viewport were showing
    // was also referenced by other viewports, and if so, we need to update those
    // viewports as well

    // check if displaySetSelectors are used by other viewports, and
    // store the viewportIndex and displaySetInstanceUIDs that need to be updated

    const viewportsToUpdate = [];
    protocolViewports.forEach((viewport, index) => {
      let viewportNeedsUpdate;
      for (const displaySet of viewport.displaySets) {
        if (displaySet.id === displaySetSelectorId) {
          viewportNeedsUpdate = true;
          break;
        }
      }

      if (viewportNeedsUpdate) {
        // we can then loop over the displaySets and choose all of them,
        // but for the one that matches the oldDisplaySetInstanceUID we need to
        // replace it with the newDisplaySetInstanceUID
        const {
          displaySetInstanceUIDs,
          displaySetOptions,
        } = viewport.displaySets.reduce(
          (acc, displaySet) => {
            const { id, options } = displaySet;

            let {
              displaySetInstanceUID: displaySetInstanceUIDToUse,
            } = this.displaySetMatchDetails.get(id);

            if (displaySet.id === displaySetSelectorId) {
              displaySetInstanceUIDToUse = newDisplaySetInstanceUID;
            }

            acc.displaySetInstanceUIDs.push(displaySetInstanceUIDToUse);
            acc.displaySetOptions.push(options);

            return acc;
          },
          { displaySetInstanceUIDs: [], displaySetOptions: [] }
        );

        viewportsToUpdate.push({
          viewportIndex: index,
          displaySetInstanceUIDs,
          viewportOptions: viewport.viewportOptions,
          displaySetOptions,
        });
      }
    });

    return viewportsToUpdate;
  }

  /**
   * It applied the protocol to the current studies and display sets based on the
   * protocolId that is provided.
   * @param protocolId - name of the registered protocol to be set
   * @param options - options to be passed to the protocol, this is either an array
   * of the displaySetInstanceUIDs to be set on ALL VIEWPORTS OF THE PROTOCOL or an object
   * that contains viewportIndex as the key and displaySetInstanceUIDs as the value
   * for each viewport that needs to be set.
   * @param errorCallback - callback to be called if there is an error
   * during the protocol application
   *
   * @returns boolean - true if the protocol was applied and no errors were found
   */
  public setProtocol(
    protocolId: string,
    options = {} as HangingProtocol.SetProtocolOptions,
    errorCallback = null
  ): void {
    const foundProtocol = this.protocols.get(protocolId);

    if (!foundProtocol) {
      console.warn(
        `ProtocolEngine::setProtocol - Protocol with id ${protocolId} not found - you should register it first via addProtocol`
      );
      return;
    }

    const protocol = this._validateProtocol(foundProtocol);

    if (options) {
      this._validateOptions(options);
    }

    try {
      this._setProtocol(protocol, options);
    } catch (error) {
      console.log(error);

      if (errorCallback) {
        errorCallback(error);
      }

      throw new Error(error);
    }
  }

  /**
   * Updates the stage activation, setting the stageActivation values to
   * 'disabled', 'active', 'passive' where:
   * * disabled means there are insufficient viewports filled to show this
   * * passive means there aren't enough preferred viewports filled to show
   * this stage by default, but it can be manually selected
   * * enabled means there are enough viewports to select this viewport by default
   *
   * The logic is currently simple, just count how many viewports would be
   * filled, and compare to the required/preferred count, but the intent is
   * to allow more complex rules in the future as required.
   *
   * @returns the stage number to apply initially, given the options.
   */
  private _updateStageActivation(
    options = null as HangingProtocol.SetProtocolOptions
  ) {
    const stages = this.protocol.stages;
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (
        stage.requiredViewports === undefined &&
        stage.preferredViewports === undefined
      ) {
        stage.enable = 'enabled';
        continue;
      }
      const { matchedViewports } = this._matchAllViewports(
        stage,
        options,
        new Map()
      );
      stage.enable =
        (matchedViewports >= stage.preferredViewports && 'enabled') ||
        (matchedViewports >= stage.requiredViewports && 'passive') ||
        'disabled';
    }

    this._broadcastChange(this.EVENTS.STAGE_ACTIVATION, {
      protocol: this.protocol,
      stages: this.protocol.stages,
    });
  }

  private _findStage(
    options = null as HangingProtocol.SetProtocolOptions
  ): number {
    const stageId = options?.stageId;
    const protocol = this.protocol;
    const stages = protocol.stages;

    if (stageId) {
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.id === stageId && stage.enable !== 'disabled') return i;
      }
      return 0;
    }

    const stageIndex = options?.stageIndex;
    if (stageIndex !== undefined && stages[stageIndex]?.enable !== 'disabled') {
      return stageIndex;
    }

    let firstNotDisabled: number;

    for (let i = 0; i < stages.length; i++) {
      if (stages[i].enable === 'enabled') return i;
      if (firstNotDisabled === undefined && stages[i].enable !== 'disabled') {
        firstNotDisabled = i;
      }
    }

    return firstNotDisabled ?? 0;
  }

  private _setProtocol(
    protocol: HangingProtocol.Protocol,
    options = null as HangingProtocol.SetProtocolOptions
  ): void {
    const oldProtocol = this.protocol;
    const oldStage = this.stage;
    if (!this.protocol || this.protocol.id !== protocol.id) {
      this.stage = options?.stageIndex || 0;
    this.protocol = this._copyProtocol(protocol);

    const { imageLoadStrategy } = protocol;
    if (imageLoadStrategy) {
      // check if the imageLoadStrategy is a valid strategy
      if (
        this.registeredImageLoadStrategies[imageLoadStrategy] instanceof
        Function
      ) {
        this.activeImageLoadStrategyName = imageLoadStrategy;
      }
    }

      this._updateStageActivation(options);
    }

    this.stage = this._findStage(options);

    try {
      this._updateViewports(options);
    } catch (error) {
      console.log('Caught error', error);
      this.protocol = oldProtocol;
      this.stage = oldStage;
      throw new Error(error);
    }

    this._broadcastChange(this.EVENTS.PROTOCOL_CHANGED, {
      viewportMatchDetails: this.viewportMatchDetails,
      displaySetMatchDetails: this.displaySetMatchDetails,
      protocol: this.protocol,
      stageIdx: this.stage,
      stage: this.protocol.stages[this.stage],
    });
  }

  public getStageIndex(hpId: string, options): number {
    const protocol = this.getProtocolById(hpId);
    const { stageId, stageIndex } = options;
    if (stageId !== undefined) {
      return protocol.stages.findIndex(it => it.id === stageId);
    }
    if (stageIndex !== undefined) return stageIndex;
    return 0;
  }

  /**
   * Retrieves the number of Stages in the current Protocol or
   * undefined if no protocol or stages are set
   */
  _getNumProtocolStages() {
    if (
      !this.protocol ||
      !this.protocol.stages ||
      !this.protocol.stages.length
    ) {
      return;
    }

    return this.protocol.stages.length;
  }

  /**
   * Retrieves the current Stage from the current Protocol and stage index
   *
   * @returns {*} The Stage model for the currently displayed Stage
   */
  _getCurrentStageModel() {
    return this.protocol.stages[this.stage];
  }

  /**
   * Gets a new viewport object for missing viewports.  Used to fill
   * new viewports.
   * Looks first for the stage, to see if there is a missingViewport defined,
   * and secondly looks to the overall protocol.
   *
   * Returns a matchInfo object, which can be used to create the actual
   * viewport object (which this class knows nothing about).
   */
  public getMissingViewport(
    hangingProtocolId: string,
    stageIdx: number,
    positionId: string,
    options
  ): HangingProtocol.ViewportMatchDetails {
    if (this.protocol.id !== hangingProtocolId) {
      throw new Error(
        `Currently applied protocol ${this.protocol.id} is different from ${hangingProtocolId}`
      );
    }
    const protocol = this.protocol;
    const stage = protocol.stages[stageIdx];
    const defaultViewport = stage.defaultViewport || protocol.defaultViewport;
    if (!defaultViewport) return;

    const useViewport = { ...defaultViewport };
    if (useViewport.displaySetsByPosition) {
      useViewport.displaySets =
        useViewport.displaySetsByPosition[positionId] ||
        defaultViewport.displaySets;
      if (!useViewport.displaySets) {
        console.warn('No display sets defined by position');
        return;
      }
    }

    return this._matchViewport(useViewport, options);
  }

  /**
   * Updates the viewports with the selected protocol stage.
   */
  _updateViewports(options = null as HangingProtocol.SetProtocolOptions): void {
    // Make sure we have an active protocol with a non-empty array of display sets
    if (!this._getNumProtocolStages()) {
      throw new Error('No protocol or stages found');
    }

    // each time we are updating the viewports, we need to reset the
    // matching applied
    this.viewportMatchDetails = new Map();
    this.displaySetMatchDetails = new Map();
    this.customImageLoadPerformed = false;

    // Retrieve the current stage
    const stageModel = this._getCurrentStageModel();

    // If the current stage does not fulfill the requirements to be displayed,
    // stop here.
    if (
      !stageModel ||
      !stageModel.viewportStructure ||
      !stageModel.viewports ||
      !stageModel.viewports.length
    ) {
      console.log('Stage cannot be applied', stageModel);
      return;
    }

    const { layoutType } = stageModel.viewportStructure;
    // Retrieve the properties associated with the current display set's viewport structure template
    // If no such layout properties exist, stop here.
    const layoutProps = stageModel.viewportStructure.properties;
    if (!layoutProps) {
      console.log('No viewportStructure.properties in', stageModel);
      return;
    }

    const { columns: numCols, rows: numRows, layoutOptions = [] } = layoutProps;

    this._broadcastChange(this.EVENTS.NEW_LAYOUT, {
      layoutType,
      numRows,
      numCols,
      layoutOptions,
    });

    // Loop through each viewport
    this._matchAllViewports(this.protocol.stages[this.stage], options);
  }

  private _matchAllViewports(
    stageModel: HangingProtocol.ProtocolStage,
    options?: HangingProtocol.SetProtocolOptions,
    viewportMatchDetails = this.viewportMatchDetails,
    displaySetMatchDetails = this.displaySetMatchDetails
  ): {
    matchedViewports: number;
    viewportMatchDetails: Map<string, HangingProtocol.ViewportMatchDetails>;
    displaySetMatchDetails: Map<string, HangingProtocol.DisplaySetMatchDetails>;
  } {
    let matchedViewports = 0;
    stageModel.viewports.forEach((viewport, viewportIndex) => {
      const matchDetails = this._matchViewport(
        viewport,
        options,
        viewportMatchDetails,
        displaySetMatchDetails
      );
      if (matchDetails) {
        if (
          matchDetails.displaySetsInfo?.length &&
          matchDetails.displaySetsInfo[0].displaySetInstanceUID
    ) {
          matchedViewports++;
        } else {
          console.log(
            'Adding an empty set of display sets for mapping purposes'
          );
          matchDetails.displaySetsInfo = viewport.displaySets.map(it => ({
            displaySetOptions: it,
          }));
      }
        viewportMatchDetails.set(viewportIndex, matchDetails);
      }
    });
    return { matchedViewports, viewportMatchDetails, displaySetMatchDetails };
  }

  private findDeduplicatedMatchDetails(
    matchDetails: HangingProtocol.DisplaySetMatchDetails,
    offset: number,
    options
  ): HangingProtocol.DisplaySetMatchDetails {
    if (!matchDetails) return;
    if (offset === 0) return matchDetails;
    if (offset === -1) {
      const { inDisplay } = options;
      if (!inDisplay) return matchDetails;
      for (let i = 0; i < matchDetails.matchingScores.length; i++) {
        if (
          inDisplay.indexOf(
            matchDetails.matchingScores[i].displaySetInstanceUID
          ) === -1
        ) {
          return matchDetails.matchingScores[i];
        }
      }
      return;
    }
    return matchDetails.matchingScores[offset];
  }

  private _matchViewport(
    viewport: HangingProtocol.Viewport,
    options: HangingProtocol.SetProtocolOptions,
    viewportMatchDetails = this.viewportMatchDetails,
    displaySetMatchDetails = this.displaySetMatchDetails
  ): HangingProtocol.ViewportMatchDetails {
    const reuseIdMap = options?.reuseIdMap || {};
    const { displaySetSelectors = {} } = this.protocol;

    // Matching the displaySets
      for (const displaySet of viewport.displaySets) {
        const { id: displaySetId } = displaySet;

        const displaySetSelector = displaySetSelectors[displaySetId];

        if (!displaySetSelector) {
          console.warn('No display set selector for', displaySetId);
          continue;
        }
        const { bestMatch, matchingScores } = this._matchImages(
          displaySetSelector
        );
      displaySetMatchDetails.set(displaySetId, bestMatch);

        if (bestMatch) {
          bestMatch.matchingScores = matchingScores;
        }
      }

    // Loop through each viewport
    const { viewportOptions = DEFAULT_VIEWPORT_OPTIONS } = viewport;
      // DisplaySets for the viewport, Note: this is not the actual displaySet,
      // but it is a info to locate the displaySet from the displaySetService
      const displaySetsInfo = [];
    viewport.displaySets.forEach(displaySetOptions => {
      const { id, displaySetIndex = 0, reuseId } = displaySetOptions;
      const reuseDisplaySetUID = reuseId && reuseIdMap[reuseId];
          const viewportDisplaySetMain = this.displaySetMatchDetails.get(id);

      // Use the display set provided instead
      if (reuseDisplaySetUID) {
        const displaySetInfo: HangingProtocol.DisplaySetInfo = {
          displaySetInstanceUID: reuseDisplaySetUID,
          displaySetOptions,
        };

        displaySetsInfo.push(displaySetInfo);
        return;
      }

          // Use the display set index to allow getting the "next" match, eg
          // matching all display sets, and get the displaySetIndex'th item

      const viewportDisplaySet = this.findDeduplicatedMatchDetails(
        viewportDisplaySetMain,
        displaySetIndex,
        options
      );

          if (viewportDisplaySet) {
        const { displaySetInstanceUID } = viewportDisplaySet;

            const displaySetInfo: HangingProtocol.DisplaySetInfo = {
              displaySetInstanceUID,
              displaySetOptions,
            };

            displaySetsInfo.push(displaySetInfo);
          } else {
            console.warn(
              `
             The hanging protocol viewport is requesting to display ${id} displaySet that is not
             matched based on the provided criteria (e.g. matching rules).
            `
            );
          }
    });
    return {
        viewportOptions,
        displaySetsInfo,
        };
          }

  private _validateViewportSpecificMatch(
    displaySetAndViewportOptions: HangingProtocol.DisplaySetAndViewportOptions,
    protocolViewport: HangingProtocol.Viewport,
    displaySetSelectors: Record<string, HangingProtocol.DisplaySetSelector>
  ): void {
    const { DisplaySetService } = this._servicesManager.services;
    const protocolViewportDisplaySets = protocolViewport.displaySets;
    const numDisplaySetsToSet =
      displaySetAndViewportOptions.displaySetInstanceUIDs.length;

    if (
      protocolViewportDisplaySets.length > 0 &&
      numDisplaySetsToSet !== protocolViewportDisplaySets.length
    ) {
      throw new Error(
        `The number of displaySets to set ${numDisplaySetsToSet} does not match the number of displaySets in the protocol ${protocolViewportDisplaySets} - not currently implemented`
      );
    }

    displaySetAndViewportOptions.displaySetInstanceUIDs.forEach(
      displaySetInstanceUID => {
        const displaySet = DisplaySetService.getDisplaySetByUID(
          displaySetInstanceUID
        );

        const { displaySets: displaySetsInfo } = protocolViewport;

        for (const displaySetInfo of displaySetsInfo) {
          const displaySetSelector = displaySetSelectors[displaySetInfo.id];

          if (!displaySetSelector) {
            continue;
          }
          this._validateRequiredSelectors(displaySetSelector, displaySet);
        }
      }
    );
  }

  private _validateRequiredSelectors(
    displaySetSelector: HangingProtocol.DisplaySetSelector,
    displaySet: any
  ) {
    const { seriesMatchingRules } = displaySetSelector;

    // only match the required rules
    const requiredRules = seriesMatchingRules.filter(rule => rule.required);
    if (requiredRules.length) {
      const matched = this.protocolEngine.findMatch(displaySet, requiredRules);

      if (!matched || matched.score === 0) {
        throw new Error(
          `The displaySetInstanceUID ${displaySet.displaySetInstanceUID} does not satisfy the required seriesMatching criteria for the protocol`
        );
      }
    }
  }

  _validateOptions(options: HangingProtocol.SetProtocolOptions): void {
    const { DisplaySetService } = this._servicesManager.services as Services;
    const { reuseIdMap } = options;
    if (reuseIdMap) {
      Object.entries(reuseIdMap).forEach(([key, displaySetInstanceUID]) => {
        const displaySet = DisplaySetService.getDisplaySetByUID(
          displaySetInstanceUID
        );

        if (!displaySet) {
          throw new Error(
            `The displaySetInstanceUID ${displaySetInstanceUID} is not found in the displaySetService`
          );
        }
      });
    }
  }

  // Match images given a list of Studies and a Viewport's image matching reqs
  _matchImages(displaySetRules) {
    // TODO: matching is applied on study and series level, instance
    // level matching needs to be added in future

    // Todo: handle fusion viewports by not taking the first displaySet rule for the viewport
    const { studyMatchingRules = [], seriesMatchingRules } = displaySetRules;

    const matchingScores = [];
    let highestSeriesMatchingScore = 0;

    console.log(
      'ProtocolEngine::matchImages',
      studyMatchingRules,
      seriesMatchingRules
    );
    this.studies.forEach(study => {
      const studyDisplaySets = this.displaySets.filter(
        it => it.StudyInstanceUID === study.StudyInstanceUID
      );
      const studyMatchDetails = this.protocolEngine.findMatch(
        study,
        studyMatchingRules,
        { studies: this.studies, displaySets: studyDisplaySets }
      );

      // Prevent bestMatch from being updated if the matchDetails' required attribute check has failed
      if (studyMatchDetails.requiredFailed === true) {
        return;
      }

      this.debug(
        'study',
        study.StudyInstanceUID,
        'display sets #',
        this.displaySets.length
      );
      this.displaySets.forEach(displaySet => {
        const {
          StudyInstanceUID,
          SeriesInstanceUID,
          displaySetInstanceUID,
        } = displaySet;
        if (StudyInstanceUID !== study.StudyInstanceUID) return;
        const seriesMatchDetails = this.protocolEngine.findMatch(
          displaySet,
          seriesMatchingRules,
          // Todo: why we have images here since the matching type does not have it
          { studies: this.studies, instance: displaySet.images?.[0] }
        );

        // Prevent bestMatch from being updated if the matchDetails' required attribute check has failed
        if (seriesMatchDetails.requiredFailed === true) {
          this.debug(
            'Display set required failed',
            displaySet,
            seriesMatchingRules
          );
          return;
        }

        this.debug('Found displaySet for rules', displaySet);
        highestSeriesMatchingScore = Math.max(
          seriesMatchDetails.score,
          highestSeriesMatchingScore
        );

        const matchDetails = {
          passed: [],
          failed: [],
        };

        matchDetails.passed = matchDetails.passed.concat(
          seriesMatchDetails.details.passed
        );
        matchDetails.passed = matchDetails.passed.concat(
          studyMatchDetails.details.passed
        );

        matchDetails.failed = matchDetails.failed.concat(
          seriesMatchDetails.details.failed
        );
        matchDetails.failed = matchDetails.failed.concat(
          studyMatchDetails.details.failed
        );

        const totalMatchScore =
          seriesMatchDetails.score + studyMatchDetails.score;

        const imageDetails = {
          StudyInstanceUID,
          SeriesInstanceUID,
          displaySetInstanceUID,
          matchingScore: totalMatchScore,
          matchDetails: matchDetails,
          sortingInfo: {
            score: totalMatchScore,
            study: study.StudyInstanceUID,
            series: parseInt(displaySet.SeriesNumber),
          },
        };

        this.debug('Adding display set', displaySet, imageDetails);
        matchingScores.push(imageDetails);
      });
    });

    if (matchingScores.length === 0) {
      console.log('No match found');
    }

    // Sort the matchingScores
    const sortingFunction = sortBy(
      {
        name: 'score',
        reverse: true,
      },
      {
        name: 'study',
        reverse: true,
      },
      {
        name: 'series',
      }
    );
    matchingScores.sort((a, b) =>
      sortingFunction(a.sortingInfo, b.sortingInfo)
    );

    const bestMatch = matchingScores[0];

    console.log(
      'ProtocolEngine::matchImages bestMatch',
      bestMatch,
      matchingScores
    );

    return {
      bestMatch,
      matchingScores,
    };
  }

  /**
   * Check if the next stage is available
   * @return {Boolean} True if next stage is available or false otherwise
   */
  _isNextStageAvailable() {
    const numberOfStages = this._getNumProtocolStages();

    return this.stage + 1 < numberOfStages;
  }

  /**
   * Check if the previous stage is available
   * @return {Boolean} True if previous stage is available or false otherwise
   */
  _isPreviousStageAvailable(): boolean {
    return this.stage - 1 >= 0;
  }

  /**
   * Changes the current stage to a new stage index in the display set sequence.
   * It checks if the next stage exists.
   *
   * @param {Integer} stageAction An integer value specifying whether next (1) or previous (-1) stage
   * @return {Boolean} True if new stage has set or false, otherwise
   */
  _setCurrentProtocolStage(
    stageAction: number,
    options: HangingProtocol.SetProtocolOptions
  ): boolean {
    // Check if previous or next stage is available
    let i;
    for (
      i = this.stage + stageAction;
      i >= 0 && i < this.protocol.stages.length;
      i += stageAction
    ) {
      if (this.protocol.stages[i].enable !== 'disabled') {
        break;
      }
    }
    if (i < 0 || i >= this.protocol.stages.length) {
      return false;
    }

    // Sets the new stage
    this.stage = i;

    // Log the new stage
    this.debug(`ProtocolEngine::setCurrentProtocolStage stage = ${this.stage}`);

    // Since stage has changed, we need to update the viewports
    // and redo matchings
    this._updateViewports(options);

    // Everything went well, broadcast the update, exactly identical to
    // HP applied.
    this._broadcastChange(this.EVENTS.PROTOCOL_CHANGED, {
      viewportMatchDetails: this.viewportMatchDetails,
      displaySetMatchDetails: this.displaySetMatchDetails,
      protocol: this.protocol,
      stageIdx: this.stage,
      stage: this.protocol.stages[this.stage],
    });
    return true;
  }

  /** Set this.debugLogging to true to show debug level logging - needed
   * to be able to figure out why hanging protocols are or are not applying.
   */
  debug(...args): void {
    if (this.debugLogging) {
      console.log(...args);
    }
  }

  /**
   * Broadcasts hanging protocols changes.
   *
   * @param {string} eventName The event name.add
   * @param {object} eventData.source The measurement source.
   * @param {object} eventData.measurement The measurement.
   * @param {boolean} eventData.notYetUpdatedAtSource True if the measurement was edited
   *      within the measurement service and the source needs to update.
   * @return void
   */
  // Todo: why do we have a separate broadcastChange function here?
  _broadcastChange(eventName, eventData) {
    const hasListeners = Object.keys(this.listeners).length > 0;
    const hasCallbacks = Array.isArray(this.listeners[eventName]);

    if (hasListeners && hasCallbacks) {
      this.listeners[eventName].forEach(listener => {
        listener.callback(eventData);
      });
    }
  }

  _copyProtocol(protocol: Protocol) {
    return JSON.parse(JSON.stringify(protocol));
  }

  /**
  _setProtocolLayoutOptions(protocol: Protocol, { numRows, numCols }) {
    const layoutOptions = [];
    const protocolStage = protocol.stages[this.stage];
    const numViewports = protocolStage.viewports.length;

    for (let i = 0; i < numViewports; i++) {
      const { row, col } = unravelIndex(i, numRows, numCols);
      const w = 1 / numCols;
      const h = 1 / numRows;
      const xPos = col * w;
      const yPos = row * h;

      layoutOptions[i] = {
        width: w,
        height: h,
        x: xPos,
        y: yPos,
      };
    }

    // Todo: handle the case where the viewportStructure is not a grid
    protocolStage.viewportStructure.properties.rows = numRows;
    protocolStage.viewportStructure.properties.columns = numCols;
    protocolStage.viewportStructure.properties.layoutOptions = {
      ...layoutOptions,
    };
  }

  _getUpdatedProtocol({
    numRows,
    numCols,
    protocol: oldProtocol,
  }: {
    numRows: number;
    numCols: number;
    protocol: Protocol;
  }): Protocol {
    let newProtocol = this._copyProtocol(oldProtocol);

    const protocolStage = newProtocol.stages[this.stage];

     // The following commented code is a potential improvements to the
     // hanging protocols to intelligently switch between number of rows
     // and columns based on the old state of the protocol. For instance,
     // changing from 2x2 to 2x3 (adding a column) right now reorders the viewports
     // as well, however, it should just add one empty column to the right
     // and leave the rest of the viewports in place. This sounds amazing,
     // but comes at a cost (which we need to tackle later). The cost is that
     // the viewportIndex will change during this smart change of layout. In
     // the example above the viewport at index (2) bottom left, will now be
     // at index (3) bottom left, and since react will re-render the viewport
     // it will reset the viewport's state such as (zoom, pan, windowLevel, imageIndex)
     // and the user will lose their current state. In addition, all our viewportIds
     // are dependent on the viewportIndex, so we will need to update all the viewportIds
     // as well, and you can see how this can get out of hand. Later, we should
     // tackle this problem and make the smart change of layout work.

    // const { rows: oldNumRows, columns: oldNumCols } = newProtocol.stages[
    //   this.stage
    // ].viewportStructure.properties;

    // const oldToNewViewportIndices = getGridMapping(
    //   {
    //     numRows: oldNumRows,
    //     numCols: oldNumCols,
    //   },
    //   {
    //     numRows,
    //     numCols,
    //   }
    // );

    const protocolViewports = protocolStage.viewports;

    if (protocolViewports.length < numRows * numCols) {
      const newViewports = [];

      for (let i = protocolViewports.length; i < numRows * numCols; i++) {
        newViewports.push({
          viewportOptions: {
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: getViewportId(i),
            },
          ],
        });
      }

      protocolStage.viewports = [...protocolViewports, ...newViewports];
    } else if (protocolViewports.length > numRows * numCols) {
      // remove viewports that are not needed
      protocolStage.viewports = protocolViewports.slice(0, numRows * numCols);
    }

    // update the displaySetMatchDetails to reflect the new viewports
    const toRemove = [];
    this.displaySetMatchDetails.forEach(
      (displaySetMatchDetail, displaySetId) => {
        // if the displaySetId is not referenced in the protocolStage viewports
        // we can remove it
        const found = protocolStage.viewports.find(viewport => {
          return viewport.displaySets.find(displaySet => {
            return displaySet.id === displaySetId;
          });
        });

        if (!found) {
          toRemove.push(displaySetId);
        }
      }
    );

    toRemove.forEach(displaySetId => {
      this.displaySetMatchDetails.delete(displaySetId);
    });

    this._setProtocolLayoutOptions(newProtocol, { numRows, numCols });
    newProtocol = this._validateProtocol(newProtocol);

    // Todo: not sure if we need to reset here, or we can smartly update the
    // viewportMatchDetails map
    this.viewportMatchDetails = new Map();

    return newProtocol;
  }
  */
}

export default HangingProtocolService;
