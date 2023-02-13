const getPresentationId = (viewport, viewports) => {
  if (!viewport) return;
  const { viewportOptions, displaySetInstanceUIDs } = viewport;
  if (!viewportOptions || !displaySetInstanceUIDs?.length) {
    console.log('No viewport type or display sets in', viewport);
    return;
  }

  const viewportType = viewportOptions.viewportType || 'stack';
  const idArr = [viewportType, 0, ...displaySetInstanceUIDs];
  if (viewportOptions.orientation) {
    idArr.splice(2, 0, viewportOptions.orientation);
  }
  // Allow setting a custom presentation prefix - this allows defining new
  // presentation groups to be set automatically when one knows that the
  // same display set will be displayed in different ways.
  if (viewportOptions.presentationPrefix) {
    idArr.push(viewportOptions.presentationPrefix);
  }
  if (!viewports) {
    console.log('viewports not defined', idArr.join(','));
    return idArr.join('&');
  }
  for (let offset = 0; offset < 128; offset++) {
    idArr[1] = offset;
    const testId = idArr.join('&');
    if (!viewports.find(it => it.viewportOptions?.presentationId === testId)) {
      break;
    }
  }
  const id = idArr.join('&');
  return id;
};

export default getPresentationId;
