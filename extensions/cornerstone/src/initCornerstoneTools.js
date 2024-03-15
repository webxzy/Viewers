import {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  VolumeRotateMouseWheelTool,
  MIPJumpToClickTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  ArrowAnnotateTool,
  DragProbeTool,
  ProbeTool,
  AngleTool,
  CobbAngleTool,
  PlanarFreehandROITool,
  MagnifyTool,
  CrosshairsTool,
  SegmentationDisplayTool,
  init,
  addTool,
  annotation,
  ReferenceLinesTool,
  TrackballRotateTool,
  CircleScissorsTool,
  RectangleScissorsTool,
  SphereScissorsTool,
} from '@cornerstonejs/tools';

import CalibrationLineTool from './tools/CalibrationLineTool';
import ImageOverlayViewerTool from './tools/ImageOverlayViewerTool';

export default function initCornerstoneTools(configuration = {}) {
  CrosshairsTool.isAnnotation = false;
  ReferenceLinesTool.isAnnotation = false;

  init(configuration);
  addTool(PanTool);
  addTool(WindowLevelTool);
  addTool(StackScrollMouseWheelTool);
  addTool(StackScrollTool);
  addTool(ZoomTool);
  addTool(ProbeTool);
  addTool(VolumeRotateMouseWheelTool);
  addTool(MIPJumpToClickTool);
  addTool(LengthTool);
  addTool(RectangleROITool);
  addTool(EllipticalROITool);
  addTool(CircleROITool);
  addTool(BidirectionalTool);
  addTool(ArrowAnnotateTool);
  addTool(DragProbeTool);
  addTool(AngleTool);
  addTool(CobbAngleTool);
  addTool(PlanarFreehandROITool);
  addTool(MagnifyTool);
  addTool(CrosshairsTool);
  addTool(SegmentationDisplayTool);
  addTool(ReferenceLinesTool);
  addTool(CalibrationLineTool);
  addTool(TrackballRotateTool);
  addTool(CircleScissorsTool);
  addTool(RectangleScissorsTool);
  addTool(SphereScissorsTool);
  addTool(ImageOverlayViewerTool);

  // Modify annotation tools to use dashed lines on SR
  const annotationStyle = {
    textBoxFontSize: '15px',
    lineWidth: '1.5',
  };

<<<<<<< HEAD
  // Set the tool font and font size
  // context.font = "[style] [variant] [weight] [size]/[line height] [font family]";
  const fontFamily =
    'Roboto, OpenSans, HelveticaNeue-Light, Helvetica Neue Light, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif';
  cornerstoneTools.textStyle.setFont(`16px ${fontFamily}`);

  // Tool styles/colors
  cornerstoneTools.toolStyle.setToolWidth(2);
  cornerstoneTools.toolColors.setToolColor('rgb(255, 255, 0)');
  cornerstoneTools.toolColors.setActiveColor('rgb(0, 255, 0)');

  cornerstoneTools.store.state.touchProximity = 40;

  // Configure stack prefetch
  cornerstoneTools.stackPrefetch.setConfiguration({
    maxImagesToPrefetch: configuration.maxImagesToPrefetch,
    preserveExistingPool: configuration.preserveExistingPool,
    maxSimultaneousRequests: configuration.maxSimultaneousRequests,
=======
  const defaultStyles = annotation.config.style.getDefaultToolStyles();
  annotation.config.style.setDefaultToolStyles({
    global: {
      ...defaultStyles.global,
      ...annotationStyle,
    },
>>>>>>> 9fbdf37f44a6829a130e9d5bda388f2a4d856556
  });
}

const toolNames = {
  Pan: PanTool.toolName,
  ArrowAnnotate: ArrowAnnotateTool.toolName,
  WindowLevel: WindowLevelTool.toolName,
  StackScroll: StackScrollTool.toolName,
  StackScrollMouseWheel: StackScrollMouseWheelTool.toolName,
  Zoom: ZoomTool.toolName,
  VolumeRotateMouseWheel: VolumeRotateMouseWheelTool.toolName,
  MipJumpToClick: MIPJumpToClickTool.toolName,
  Length: LengthTool.toolName,
  DragProbe: DragProbeTool.toolName,
  Probe: ProbeTool.toolName,
  RectangleROI: RectangleROITool.toolName,
  EllipticalROI: EllipticalROITool.toolName,
  CircleROI: CircleROITool.toolName,
  Bidirectional: BidirectionalTool.toolName,
  Angle: AngleTool.toolName,
  CobbAngle: CobbAngleTool.toolName,
  PlanarFreehandROI: PlanarFreehandROITool.toolName,
  Magnify: MagnifyTool.toolName,
  Crosshairs: CrosshairsTool.toolName,
  SegmentationDisplay: SegmentationDisplayTool.toolName,
  ReferenceLines: ReferenceLinesTool.toolName,
  CalibrationLine: CalibrationLineTool.toolName,
  TrackballRotateTool: TrackballRotateTool.toolName,
  CircleScissors: CircleScissorsTool.toolName,
  RectangleScissors: RectangleScissorsTool.toolName,
  SphereScissors: SphereScissorsTool.toolName,
  ImageOverlayViewer: ImageOverlayViewerTool.toolName,
};

export { toolNames };
