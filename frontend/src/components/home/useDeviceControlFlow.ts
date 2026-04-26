import { useEffect, useMemo, useState } from "react";
import { acceptDeviceControl, fetchDeviceControlResult } from "../../api/deviceControlsApi";
import { fetchDeviceDetail } from "../../api/devicesApi";
import type {
  DeviceControlAcceptedDto,
  DeviceControlResultDto,
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
} from "../../api/types";
import {
  formatControlError,
  getInitialValue,
  makeRequestId,
  normalizeControlValue,
  schemaKey,
} from "./homeDeviceControlModel";

interface UseDeviceControlFlowOptions {
  deviceIds: string[];
  enabled: boolean;
  maxDevices?: number;
  pollAttempts?: number;
  requestPrefix: string;
}

interface SubmitControlOptions {
  detail: DeviceDetailDto;
  schema: DeviceControlSchemaItemDto;
  schemaIndex: number;
  overrideValue?: unknown;
}

export function useDeviceControlFlow({
  deviceIds,
  enabled,
  maxDevices,
  pollAttempts = 5,
  requestPrefix,
}: UseDeviceControlFlowOptions) {
  const [details, setDetails] = useState<DeviceDetailDto[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingByKey, setPendingByKey] = useState<Record<string, boolean>>({});
  const [messageByDeviceId, setMessageByDeviceId] = useState<Record<string, string>>({});
  const [acceptedByDeviceId, setAcceptedByDeviceId] = useState<
    Record<string, DeviceControlAcceptedDto | null>
  >({});
  const [resultByDeviceId, setResultByDeviceId] = useState<
    Record<string, DeviceControlResultDto | null>
  >({});
  const targetDeviceIds = useMemo(
    () => (maxDevices ? deviceIds.slice(0, maxDevices) : deviceIds),
    [deviceIds, maxDevices],
  );
  const targetDeviceKey = targetDeviceIds.join("|");

  function controlKey(
    deviceId: string,
    schema: DeviceControlSchemaItemDto,
    schemaIndex: number,
  ) {
    return `${deviceId}:${schemaKey(schema, schemaIndex)}`;
  }

  function setValue(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!enabled || targetDeviceIds.length === 0) {
      setDetails([]);
      setValues({});
      setPendingByKey({});
      setMessageByDeviceId({});
      setAcceptedByDeviceId({});
      setResultByDeviceId({});
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setDetails([]);
    setValues({});
    setPendingByKey({});
    setMessageByDeviceId({});
    setAcceptedByDeviceId({});
    setResultByDeviceId({});
    setError(null);
    setLoading(true);

    void (async () => {
      const responses = await Promise.allSettled(
        targetDeviceIds.map((deviceId) => fetchDeviceDetail(deviceId)),
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

      if (!loadedDetails.length) {
        const firstError = responses.find(
          (entry): entry is PromiseRejectedResult => entry.status === "rejected",
        );
        setError(formatControlError(firstError?.reason));
      }

      const initialValues: Record<string, unknown> = {};
      loadedDetails.forEach((detail) => {
        detail.control_schema.forEach((schema, index) => {
          initialValues[controlKey(detail.device_id, schema, index)] = getInitialValue(schema);
        });
      });
      setDetails(loadedDetails);
      setValues(initialValues);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [enabled, targetDeviceKey]);

  async function submitControl({
    detail,
    schema,
    schemaIndex,
    overrideValue,
  }: SubmitControlOptions) {
    const key = controlKey(detail.device_id, schema, schemaIndex);
    const nextValue = overrideValue ?? values[key];
    setPendingByKey((current) => ({ ...current, [key]: true }));
    setMessageByDeviceId((current) => ({
      ...current,
      [detail.device_id]: "正在发送控制…",
    }));
    setAcceptedByDeviceId((current) => ({ ...current, [detail.device_id]: null }));
    setResultByDeviceId((current) => ({ ...current, [detail.device_id]: null }));
    setError(null);

    try {
      const accepted = await acceptDeviceControl({
        request_id: makeRequestId(detail.device_id, requestPrefix),
        device_id: detail.device_id,
        action_type: schema.action_type,
        payload: {
          target_scope: schema.target_scope,
          target_key: schema.target_key,
          value: normalizeControlValue(schema, nextValue),
          unit: schema.unit,
        },
        client_ts: new Date().toISOString(),
      });
      setAcceptedByDeviceId((current) => ({ ...current, [detail.device_id]: accepted }));

      for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 320 : 580));
        const nextResult = await fetchDeviceControlResult(accepted.request_id);
        setResultByDeviceId((current) => ({
          ...current,
          [detail.device_id]: nextResult,
        }));
        if (nextResult.execution_status !== "PENDING") {
          setMessageByDeviceId((current) => ({
            ...current,
            [detail.device_id]:
              nextResult.execution_status === "SUCCESS"
                ? "设备已完成控制"
                : (nextResult.error_message ?? "设备尚未返回成功确认"),
          }));
          return nextResult;
        }
      }

      setMessageByDeviceId((current) => ({
        ...current,
        [detail.device_id]: "设备尚未返回成功确认",
      }));
      return null;
    } catch (submitError) {
      const message = formatControlError(submitError);
      setMessageByDeviceId((current) => ({ ...current, [detail.device_id]: message }));
      setError(message);
      return null;
    } finally {
      setPendingByKey((current) => ({ ...current, [key]: false }));
    }
  }

  return {
    acceptedByDeviceId,
    controlKey,
    details,
    error,
    loading,
    messageByDeviceId,
    pendingByKey,
    resultByDeviceId,
    setValue,
    setValues,
    submitControl,
    values,
  };
}
