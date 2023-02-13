/** Store presentation data for either stack viewports or volume viewports */
import { vec2 } from 'gl-matrix';

export type Voi = {
  lower: number;
  upper: number;
};

export interface BasePresentation {
  id: string;
  properties: Record<string, unknown>;
  initialImageIndex?: number;
}

export interface StackPresentation extends BasePresentation {
  viewportType: 'stack';
  zoom?: number;
  pan?: vec2;
}

export interface VolumePresentation extends BasePresentation {
  viewportType: 'volume' | 'orthographic';
  camera?: Record<string, unknown>;
}

export type Presentation = StackPresentation | VolumePresentation;

export default Presentation;
