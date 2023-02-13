import { PubSubService } from '../_shared/pubSubServiceInterface';
import { ExtensionManager } from '../../extensions';

const EVENTS = {
  MODIFIED: 'event::StateSyncService:modified',
};

type Obj = Record<string, unknown>;

type StateConfig = {
  isMode?: boolean;
};

type States = {
  [key: string]: Obj;
};

/**
 */
export default class StateSyncService extends PubSubService {
  public static REGISTRATION = {
    name: 'stateSyncService',
    create: ({ configuration = {}, commandsManager }) => {
      return new StateSyncService({ configuration, commandsManager });
    },
  };

  extensionManager: ExtensionManager;
  configuration: Obj;
  registeredStateSets: {
    [x: string]: StateConfig;
  } = {};
  state: States = {};

  constructor({ configuration }) {
    super(EVENTS);
    this.configuration = configuration || {};
  }

  public init(extensionManager: ExtensionManager): void { }

  public register(id: string, config: StateConfig): void {
    this.registeredStateSets[id] = config;
    this.reduce({ [id]: {} });
  }

  public getState(): Record<string, Obj> {
    // TODO - return a proxy to this which is not writable in dev mode
    return this.state;
  }

  public reduce(obj: States): States {
    this.state = { ...this.state, ...obj };
    console.log('reduce', JSON.stringify(obj));
    return obj;
  }

  public onModeExit(): void {
    console.log('************** onModeExit stateSyncService');
    const toReduce = {};
    for (const [key, value] of Object.entries(this.registeredStateSets)) {
      if (value.isMode) {
        toReduce[key] = {};
      }
    }
    this.reduce(toReduce);
  }
}
