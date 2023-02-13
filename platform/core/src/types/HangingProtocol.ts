type DisplaySetInfo = {
  displaySetInstanceUID?: string;
  displaySetOptions: DisplaySetOptions;
};

type ViewportMatchDetails = {
  viewportOptions: ViewportOptions;
  displaySetsInfo: DisplaySetInfo[];
};

type DisplaySetMatchDetails = {
  StudyInstanceUID?: string;
  displaySetInstanceUID: string;
  matchDetails?: any;
  matchingScores?: DisplaySetMatchDetails[];
  sortingInfo?: any;
};


type DisplaySetAndViewportOptions = {
  displaySetInstanceUIDs: string[];
  viewportOptions: ViewportOptions;
  displaySetOptions: DisplaySetOptions;
}

type SetProtocolOptions = {
  // Contains a map of reuseId values to display set UIDs
  reuseIdMap?: Record<string, string>;

  // Indicates a stage to apply:
  // The stage can be specified by id or by index
  // TODO - make the stageId a regexp to allow searching for first matching
  stageId?: string;
  stageIndex?: number;
}

type HangingProtocolMatchDetails = {
  displaySetMatchDetails: Map<string, DisplaySetMatchDetails>;
  viewportMatchDetails: Map<number, ViewportMatchDetails>;
};

type MatchingRule = {
  id: string;
  weight: number;
  attribute: string;
  constraint: Record<string, unknown>;
  required: boolean;
};

type ViewportLayoutOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ViewportStructure = {
  layoutType: string;
  properties: {
    rows: number;
    columns: number;
    layoutOptions: ViewportLayoutOptions[];
  };
};

/**
 * Selects the display sets to apply for a given id.
 * This is a set of rules which match the study and display sets
 * and then provides an id for them so that they can re-used in different
 * viewports.
 * The matches are done lazily, so if a stage doesn't need a given match,
 * it won't be selected.
 */
type DisplaySetSelector = {
  // The image matching rule (not currently implemented) selects which image to
  // display initially, only for stack views.
  imageMatchingRules?: MatchingRule[];
  // The matching rules to choose the display sets at the series level
  seriesMatchingRules: MatchingRule[];
  studyMatchingRules?: MatchingRule[];
};

type SyncGroup = {
  type: string;
  id: string;
  source?: boolean
  target?: boolean
}

type initialImageOptions = {
  index?: number;
  preset?: string; // todo: type more
}

type ViewportOptions = {
  toolGroupId: string;
  viewportType: string;
  id?: string;
  orientation?: string;
  viewportId?: string;
  initialImageOptions?: initialImageOptions;
  syncGroups?: SyncGroup[];
  customViewportProps?: Record<string, unknown>;
};

type DisplaySetOptions = {
  // The id is used to choose which display set selector to apply here
  id: string;
  // An offset to allow display secondary series, for example
  // to display the second matching series (displaySetIndex==1)
  // This cannot easily be done with the matching rules directly.
  displaySetIndex?: number;

  // A key to select a display set UID to reuse from the existing sets.
  reuseId?: string;

  // The options to apply to the display set.
  options?: Record<string, unknown>;
};

type Viewport = {
  viewportOptions: ViewportOptions;
  displaySets: DisplaySetOptions[];
  displaySetsByPosition?: Record<string, DisplaySetOptions[]>;
};

/**
 * Defines which viewports are required - either for activating the stage
 * at all, or for being a preferred stage (activated by default)
 */
type ViewportsRequired = number;

type StageEnabled = 'disabled' | 'enabled' | 'passive';

type ProtocolStage = {
  id: string;
  name: string;
  viewportStructure: ViewportStructure;
  viewports: Viewport[];
  enable?: StageEnabled;
  // The set of viewports that is required for this stage to be used
  requiredViewports?: ViewportsRequired;
  // The set of viewports that is preferred for this viewport, to be manually
  // activated
  preferredViewports?: ViewportsRequired;
  defaultViewport?: Viewport;
  createdDate?: string;
};

type Protocol = {
  // Mandatory
  id: string;
  // Selects which display sets are given a specific name.
  displaySetSelectors: Record<string, DisplaySetSelector>;
  defaultViewport?: Viewport;
  stages: ProtocolStage[];
  // Optional
  locked?: boolean;
  hasUpdatedPriorsInformation?: boolean;
  name?: string;
  createdDate?: string;
  modifiedDate?: string;
  availableTo?: Record<string, unknown>;
  editableBy?: Record<string, unknown>;
  toolGroupIds?: string[];
  imageLoadStrategy?: string; // Todo: this should be types specifically
  protocolMatchingRules?: MatchingRule[];
  numberOfPriorsReferenced?: number;
  syncDataForViewports?: boolean;
};

type ProtocolGenerator = ({ servicesManager: any, commandsManager: any }) => {
  protocol: Protocol;
};

export type {
  SetProtocolOptions,
  ViewportOptions,
  ViewportMatchDetails,
  DisplaySetMatchDetails,
  HangingProtocolMatchDetails,
  Protocol,
  ProtocolStage,
  Viewport,
  DisplaySetSelector,
  ViewportStructure,
  ViewportLayoutOptions,
  DisplaySetOptions,
  MatchingRule,
  SyncGroup,
  initialImageOptions,
  DisplaySetInfo,
  DisplaySetAndViewportOptions,
  ProtocolGenerator,
};
