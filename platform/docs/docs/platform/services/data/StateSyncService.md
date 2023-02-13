---
sidebar_position: 4
sidebar_label: State Sync Service
---

# State Sync Service

## Overview
The state sync service is designed to allow short and long term memory of things such as
annotations applied, last annotation state, hanging protocol viewport state,
window level etc.  This allows for better interaction with things like navigation
between hanging protocols, ensuring that the previously displayed layouts
can be redisplayed after returning to a given hanging protocol.

## Events

These are the events that get publish in `StateSyncService`:

| Event        | Description                                                          |
| ------------ | -------------------------------------------------------------------- |
| NEW_ENTRY    | Fires when a new entry is created     |

## Entities

Entities are the objects which are stored in cache.  The have a cache key, a
cache path, a set of storage options and an interface for the instance objects.
THe user of the state sync service determines the entity organization and design,
and registers the entity paths.

| Key          | Description                                                          |
| ------------ | -------------------------------------------------------------------- |
| query        | A history value containing an object with the query parameters       |
| studyUID     | studyUID cache with value the StudyInstanceUID                       |
| hangingProtocol | A value containing the currently applied hanging protocol and stage  |
| hpID         | A cache key under studyUID containing the hanging protocol id key and values |

## API

- `getCache`: returns an object containing the cache key/value pairs
- `putCache`: puts a new cache entry or replaces the current one
- `clear`: clears a given cache or cache entry
- `get`: returns a value as defined by the given path entries
- `putHistory`: puts a new history value
- `putValue`: puts a simple value
- `merge`: updates only the changed values, creating a new value in the key

## Remember Behaviours

### set new Hanging Protocol
To set a new hanging protocol, the remember service must be updated with
the current display information, and then the new hanging protocol be applied.
The new protocol is applied with reference to new and existing display sets
as well as new and existing viewports.  The process is basically:

```javascript
  function setHangingProtocol(newHPName) {
    const displaySets = getDisplaySetsCurrentlyDisplayed();
    rememberService.putCache('studyUID', studyUID, 'hp', oldHpId, 'stage', oldStageId, {
      displaySets,
      viewports: getViewportsCurrentlyShown(),
      layout: getLayoutInfo(),
    });
    rememberService.putCache('studyUID', studyUID, 'hp', newHPName, 'previous', [oldHpId, oldStageId]);
    hangingProtocolService.setHangingProtocol(newHPName, {previousDisplaySets: displaySets, previousViewports: viewports});
  }
```

### ViewportGrid and HPService
General expectation is that new viewports should "match" what was previously displayed so that the same display information is re-used as much as possible, but that if a hanging protocol specifies a match
in a way that isn't a re-use, then all the viewports not matching should get updated to match the hanging protocol.

For example, if a viewport specifies displaying a T2 Thorax, then it shouldn't display the T1 Thorax previously displayed, but should display a new match.

If a viewport was previously displaying the "RCC" view, and the user had navigated to the second RCC set, on the 3rd image instance, then when the RCC view is shown in a new position, it should still
show the same viewport information.  This should occur regardless of how things are moved around.

These goals are described by the following rules:

1. If a viewport matches a previously displayed viewport by viewportId, then redisplay as remembered
2. If the new stage has display sets with the same id's as remembered, AND they follow all required rules, then re-use that display set
3. Allow display set selectors to select the active/dropped/selected display set (eg to toggle on MPR)
4. If a viewport displays a previously displayed display set UID in the same viewport mode, then display it in the same way it was before
5. Use default viewports from the hanging protocol and/or stage
6. Get the viewport display sets and options from the hanging protocol specified viewport

### Query Page
On navigating to the query page, the `query` key should be looked up and used to
augment the redirection.  On performing a query, the current query item should
be replaced when the same query key is edited as the previous query, and should
have a new history entry added when a different query key is edited.  This allows
a history of queries to be made.
