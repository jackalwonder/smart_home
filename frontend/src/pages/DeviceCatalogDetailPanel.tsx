import { ReactNode } from "react";
import { DeviceDetailDto, DeviceListItemDto } from "../api/types";
import {
  compactJson,
  describeControlSchema,
  formatControlAction,
  formatDeviceStatus,
  formatDeviceTimestamp,
  formatDeviceType,
  formatEntityDomain,
  formatEntityRole,
  formatShortId,
  getEntityLinks,
  getHomeEntryLabel,
} from "./devicesCatalogModel";

interface DeviceCatalogDetailPanelProps {
  detailError: string | null;
  detailLoading: boolean;
  onClose: () => void;
  renderHomeEntryAction: (device: DeviceListItemDto) => ReactNode;
  selectedDevice: DeviceDetailDto | null;
  selectedDeviceCatalog: DeviceListItemDto | null;
}

export function DeviceCatalogDetailPanel({
  detailError,
  detailLoading,
  onClose,
  renderHomeEntryAction,
  selectedDevice,
  selectedDeviceCatalog,
}: DeviceCatalogDetailPanelProps) {
  if (!selectedDevice && !detailLoading && !detailError) {
    return null;
  }

  return (
    <aside className="devices-detail-drawer" aria-label="设备详情">
      <div className="devices-detail-drawer__header">
        <div>
          <span className="card-eyebrow">设备详情</span>
          <h3>{selectedDevice?.display_name ?? "读取中"}</h3>
        </div>
        <button className="button button--ghost" onClick={onClose} type="button">
          关闭
        </button>
      </div>
      {detailError ? <p className="inline-error">{detailError}</p> : null}
      {detailLoading ? <p className="muted-copy">正在读取设备详情...</p> : null}
      {selectedDevice ? (
        <div className="devices-detail-drawer__body">
          {selectedDeviceCatalog ? (
            <section className="devices-home-entry-card">
              <div>
                <span className="card-eyebrow">首页入口</span>
                <strong>{getHomeEntryLabel(selectedDeviceCatalog)}</strong>
                <p className="muted-copy">
                  设备页负责加入或移出首页；排序和显示规则仍在设置里调整。
                </p>
              </div>
              {renderHomeEntryAction(selectedDeviceCatalog)}
            </section>
          ) : null}
          <dl className="field-grid">
            <div>
              <dt>设备标识</dt>
              <dd>{formatShortId(selectedDevice.device_id)}</dd>
            </div>
            <div>
              <dt>房间</dt>
              <dd>{selectedDevice.room_name || "-"}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{formatDeviceType(selectedDevice.device_type)}</dd>
            </div>
            <div>
              <dt>运行状态</dt>
              <dd>{formatDeviceStatus(selectedDevice.status)}</dd>
            </div>
            <div>
              <dt>聚合状态</dt>
              <dd>{formatDeviceStatus(selectedDevice.runtime_state?.aggregated_state)}</dd>
            </div>
            <div>
              <dt>最近更新</dt>
              <dd>
                {formatDeviceTimestamp(selectedDevice.runtime_state?.last_state_update_at)}
              </dd>
            </div>
            <div>
              <dt>户型图热点</dt>
              <dd>
                {selectedDevice.editor_config?.hotspots?.length
                  ? `${selectedDevice.editor_config.hotspots.length} 个`
                  : "未布点"}
              </dd>
            </div>
          </dl>

          <section className="devices-detail-section">
            <h4>现场摘要</h4>
            <dl className="field-grid">
              <div>
                <dt>可控能力</dt>
                <dd>{selectedDevice.control_schema.length} 项</dd>
              </div>
              <div>
                <dt>实体映射</dt>
                <dd>{getEntityLinks(selectedDevice).length} 个</dd>
              </div>
              <div>
                <dt>只读状态</dt>
                <dd>{selectedDeviceCatalog?.is_readonly_device ? "只读" : "可操作"}</dd>
              </div>
              <div>
                <dt>首页候选</dt>
                <dd>
                  {selectedDeviceCatalog ? getHomeEntryLabel(selectedDeviceCatalog) : "-"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="devices-detail-section">
            <h4>可控能力</h4>
            {selectedDevice.control_schema.length ? (
              <div className="devices-detail-list">
                {selectedDevice.control_schema.map((schema, index) => {
                  const described = describeControlSchema(schema);
                  return (
                    <div
                      className="devices-detail-list__item"
                      key={`${schema.action_type}-${schema.target_scope}-${schema.target_key}-${index}`}
                    >
                      <strong>{formatControlAction(schema.action_type)}</strong>
                      <span>{`作用对象：${described.target}`}</span>
                      <span>{`可选值：${described.value}`}</span>
                      <span>
                        {schema.is_quick_action ? "可作为快捷动作" : "在详情中操作"}
                        {schema.requires_detail_entry ? " · 需要详情入口" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted-copy">当前设备没有可用控制项。</p>
            )}
          </section>

          <section className="devices-detail-section">
            <h4>Home Assistant 实体</h4>
            {getEntityLinks(selectedDevice).length ? (
              <div className="devices-detail-list">
                {getEntityLinks(selectedDevice).map((entity) => (
                  <div className="devices-detail-list__item" key={entity.entity_id}>
                    <strong>{formatEntityDomain(entity.domain)}</strong>
                    <span>{`实体标识：${formatShortId(entity.entity_id)}`}</span>
                    <span>{`用途：${formatEntityRole(entity.entity_role)}${entity.is_primary ? " · 主实体" : ""}`}</span>
                    <span>{`状态：${formatDeviceStatus(entity.state)} · ${entity.is_available === false ? "不可用" : "可用"}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-copy">当前设备没有 Home Assistant 实体映射。</p>
            )}
          </section>

          <details className="devices-detail-section devices-detail-section--technical">
            <summary>技术诊断</summary>
            <dl className="field-grid">
              <div>
                <dt>完整设备 ID</dt>
                <dd>{selectedDevice.device_id}</dd>
              </div>
              <div>
                <dt>原始类型</dt>
                <dd>{selectedDevice.device_type}</dd>
              </div>
            </dl>
            <h4>运行遥测</h4>
            <pre>{compactJson(selectedDevice.runtime_state?.telemetry ?? {})}</pre>
            <h4>来源信息</h4>
            <pre>{compactJson(selectedDevice.source_info)}</pre>
          </details>
        </div>
      ) : null}
    </aside>
  );
}
