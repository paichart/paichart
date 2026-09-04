import { Stage } from "../../types";

export interface TaskNodeData {
  id: string;
  title: string; // Changed from name to title to match Task interface
  stageId: string;
  stageName: string;
  type: string;
  dependencies: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphTransform {
  x: number;
  y: number;
  scale: number;
}

export interface GraphDimensions {
  width: number;
  height: number;
}

export interface MinimapSize {
  width: number;
  height: number;
}

export interface TaskSelection {
  stageId: string;
  taskId: string;
}
