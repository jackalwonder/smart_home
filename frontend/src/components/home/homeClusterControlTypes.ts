import type { HomeClusterDevice } from "./homeClusterControlModel";
import type { useDeviceControlFlow } from "./useDeviceControlFlow";

export type DeviceControlFlow = ReturnType<typeof useDeviceControlFlow>;
export type ClusterDeviceDetail = DeviceControlFlow["details"][number];
export type ClusterControlSchema = ClusterDeviceDetail["control_schema"][number];
export type ClusterDeviceItem = ClusterDeviceDetail | HomeClusterDevice;
