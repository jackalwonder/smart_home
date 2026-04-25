import { useEffect, useMemo, useState } from "react";
import { fetchDeviceDetail } from "../../api/devicesApi";
import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceListItemDto,
} from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import {
  controlSchemaKey,
  formatDeviceControlError,
  isPowerControlSchema,
  isRuntimePowerOn,
  submitDeviceControl,
} from "./deviceControlHelpers";
import {
  buildTargetCandidates,
  candidateFromHotspot,
  detailState,
  deviceKind,
  getInitialValue,
  resultMessage,
  type DeviceCandidate,
  type HotspotControlMode,
} from "./homeHotspotControlModel";

interface UseHomeHotspotControlOptions {
  devices: DeviceListItemDto[];
  hotspot: HomeHotspotViewModel | null;
  mode: HotspotControlMode;
  open: boolean;
}

export function useHomeHotspotControl({
  devices,
  hotspot,
  mode,
  open,
}: UseHomeHotspotControlOptions) {
  const [details, setDetails] = useState<DeviceDetailDto[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [optimisticPower, setOptimisticPower] = useState<Record<string, boolean>>({});

  const targetCandidates = useMemo(() => {
    if (!hotspot) {
      return [];
    }

    return buildTargetCandidates(devices, hotspot, mode);
  }, [devices, hotspot, mode]);

  const detailsById = useMemo(() => {
    return new Map(details.map((detail) => [detail.device_id, detail]));
  }, [details]);

  const primaryCandidate =
    targetCandidates[0] ?? (hotspot ? candidateFromHotspot(hotspot) : null);
  const primaryDetail = primaryCandidate
    ? detailsById.get(primaryCandidate.deviceId) ?? null
    : null;
  const anchorKind = primaryCandidate ? deviceKind(primaryCandidate.deviceType) : "device";
  const onlineCount = targetCandidates.filter((device) => !device.isOffline).length;
  const controllableCount =
    mode === "detail"
      ? primaryDetail?.control_schema.length ?? 0
      : targetCandidates.filter((device) => {
          const detail = detailsById.get(device.deviceId);
          return Boolean(detail?.control_schema.some(isPowerControlSchema));
        }).length;

  useEffect(() => {
    if (!open || !hotspot) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setDetails([]);
    setValues({});
    setMessages({});
    setPending({});
    setOptimisticPower({});

    void (async () => {
      const responses = await Promise.allSettled(
        targetCandidates.map((device) => fetchDeviceDetail(device.deviceId)),
      );
      if (!active) {
        return;
      }
      const loadedDetails = responses
        .filter(
          (entry): entry is PromiseFulfilledResult<DeviceDetailDto> =>
            entry.status === "fulfilled",
        )
        .map((entry) => entry.value);
      const initialValues: Record<string, unknown> = {};
      loadedDetails.forEach((detail) => {
        detail.control_schema.forEach((schema, index) => {
          initialValues[`${detail.device_id}:${controlSchemaKey(schema, index)}`] =
            getInitialValue(schema);
        });
      });
      setDetails(loadedDetails);
      setValues(initialValues);
      if (!loadedDetails.length && targetCandidates.length) {
        setError("设备控制能力读取失败");
      }
      setLoading(false);
    })().catch((nextError) => {
      if (!active) {
        return;
      }
      setError(formatDeviceControlError(nextError));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [hotspot, mode, open, targetCandidates]);

  function setControlValue(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submitSchema(
    detail: DeviceDetailDto,
    schema: DeviceControlSchemaItemDto,
    schemaIndex: number,
    overrideValue?: unknown,
  ) {
    const key = `${detail.device_id}:${controlSchemaKey(schema, schemaIndex)}`;
    const nextValue = overrideValue ?? values[key] ?? getInitialValue(schema);

    setPending((current) => ({ ...current, [key]: true }));
    setMessages((current) => ({ ...current, [key]: "发送中" }));

    try {
      const result = await submitDeviceControl({
        deviceId: detail.device_id,
        schema,
        value: nextValue,
        requestPrefix: "hotspot",
      });
      setMessages((current) => ({
        ...current,
        [key]: resultMessage(result?.execution_status, nextValue),
      }));
    } catch (nextError) {
      setMessages((current) => ({
        ...current,
        [key]: formatDeviceControlError(nextError),
      }));
    } finally {
      setPending((current) => ({ ...current, [key]: false }));
    }
  }

  async function toggleDevice(candidate: DeviceCandidate, detail: DeviceDetailDto) {
    const powerIndex = detail.control_schema.findIndex(isPowerControlSchema);
    const powerSchema = detail.control_schema[powerIndex];
    if (!powerSchema) {
      return;
    }

    const currentState =
      candidate.deviceId in optimisticPower
        ? optimisticPower[candidate.deviceId]
        : detailState(detail, candidate);
    const nextValue = !isRuntimePowerOn(
      currentState,
      detail.is_offline || candidate.isOffline,
    );
    const pendingKey = `${detail.device_id}:${controlSchemaKey(powerSchema, powerIndex)}`;

    setPending((current) => ({ ...current, [pendingKey]: true }));
    setMessages((current) => ({ ...current, [candidate.deviceId]: "发送中" }));
    setOptimisticPower((current) => ({
      ...current,
      [candidate.deviceId]: nextValue,
    }));

    try {
      const result = await submitDeviceControl({
        deviceId: detail.device_id,
        schema: powerSchema,
        value: nextValue,
        requestPrefix: "hotspot",
      });
      if (!result || result.execution_status === "SUCCESS") {
        setMessages((current) => ({
          ...current,
          [candidate.deviceId]: nextValue ? "ON" : "OFF",
        }));
        return;
      }

      setOptimisticPower((current) => {
        const next = { ...current };
        delete next[candidate.deviceId];
        return next;
      });
      setMessages((current) => ({
        ...current,
        [candidate.deviceId]: result.error_message ?? result.execution_status,
      }));
    } catch (nextError) {
      setOptimisticPower((current) => {
        const next = { ...current };
        delete next[candidate.deviceId];
        return next;
      });
      setMessages((current) => ({
        ...current,
        [candidate.deviceId]: formatDeviceControlError(nextError),
      }));
    } finally {
      setPending((current) => ({ ...current, [pendingKey]: false }));
    }
  }

  return {
    anchorKind,
    controllableCount,
    detailsById,
    error,
    loading,
    messages,
    onlineCount,
    optimisticPower,
    pending,
    primaryCandidate,
    primaryDetail,
    setControlValue,
    submitSchema,
    targetCandidates,
    toggleDevice,
    values,
  };
}
