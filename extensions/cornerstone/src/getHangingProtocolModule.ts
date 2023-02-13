const mpr = {
  locked: true,
  hasUpdatedPriorsInformation: false,
  name: 'mpr',
  createdDate: '2021-02-23T19:22:08.894Z',
  modifiedDate: '2023-01-24',
  availableTo: {},
  editableBy: {},
  protocolMatchingRules: [],
  imageLoadStrategy: 'nth',
  displaySetSelectors: {
    mprDisplaySet: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'isReconstructable',
          constraint: {
            equals: {
              value: true,
            },
          },
          required: true,
        },
      ],
    },
  },
  stages: [
    {
      name: 'MPR 1x3',
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 3,
          layoutOptions: [
            {
              x: 0,
              y: 0,
              width: 1 / 3,
              height: 1,
            },
            {
              x: 1 / 3,
              y: 0,
              width: 1 / 3,
              height: 1,
            },
            {
              x: 2 / 3,
              y: 0,
              width: 1 / 3,
              height: 1,
            },
          ],
        },
      },
      viewports: [
        {
          viewportOptions: {
            toolGroupId: 'mpr',
            viewportType: 'orthographic',
            orientation: 'axial',
            initialImageOptions: {
              preset: 'middle',
            },
            syncGroups: [
              {
                type: 'voi',
                id: 'mpr',
                source: true,
                target: true,
              },
            ],
          },
          displaySets: [
            {
              id: 'mprDisplaySet',
              reuseId: 'activeDisplaySet',
            },
          ],
        },
        {
          viewportOptions: {
            toolGroupId: 'mpr',
            viewportType: 'volume',
            orientation: 'sagittal',
            initialImageOptions: {
              preset: 'middle',
            },
            syncGroups: [
              {
                type: 'voi',
                id: 'mpr',
                source: true,
                target: true,
              },
            ],
          },
          displaySets: [
            {
              id: 'mprDisplaySet',
              reuseId: 'activeDisplaySet',
            },
          ],
        },
        {
          viewportOptions: {
            toolGroupId: 'mpr',
            viewportType: 'volume',
            orientation: 'coronal',
            initialImageOptions: {
              preset: 'middle',
            },
            syncGroups: [
              {
                type: 'voi',
                id: 'mpr',
                source: true,
                target: true,
              },
            ],
          },
          displaySets: [
            {
              id: 'mprDisplaySet',
              reuseId: 'activeDisplaySet',
            },
          ],
        },
      ],
    },
  ],
};

function getHangingProtocolModule() {
  return [
    {
      id: 'mpr',
      protocol: mpr,
    },
  ];
}

export default getHangingProtocolModule;
