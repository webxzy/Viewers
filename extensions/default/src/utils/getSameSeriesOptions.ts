import { DisplaySetService } from '@ohif/core';

import getNextSRSeriesNumber from './getNextSRSeriesNumber';

export default function getSameSeriesOptions(
  SeriesDescription: string,
  displaySetService: DisplaySetService
): Record<string, unknown> {
  const activeDisplaySets = displaySetService.getActiveDisplaySets();
  const srDisplaySets = activeDisplaySets.filter(ds => ds.Modality === 'SR');
  const sameSeries = srDisplaySets.find(
    ds => ds.SeriesDescription === SeriesDescription
  );
  if (sameSeries) {
    console.log('Storing to same series', sameSeries);
    const { instance } = sameSeries;
    const {
      SeriesInstanceUID,
      SeriesDescription,
      SeriesDate,
      SeriesTime,
      SeriesNumber,
      Modality,
    } = instance;
    return {
      SeriesInstanceUID,
      SeriesDescription,
      SeriesDate,
      SeriesTime,
      SeriesNumber,
      Modality,
      InstanceNumber: sameSeries.others.length + 1,
    };
  }

  const SeriesNumber = getNextSRSeriesNumber(displaySetService);
  return { SeriesDescription, SeriesNumber };
}
