import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import { Link } from "react-router-dom";
import { FavoritesDevicePanel } from "./FavoritesDevicePanel";
import { FunctionSettingsPanel } from "./FunctionSettingsPanel";
import { PageSettingsPanel } from "./PageSettingsPanel";
import { SettingsTaskModule } from "./SettingsTaskModule";

const LazyEditorWorkbenchWorkspace = lazy(() =>
  import("../../pages/EditorWorkbenchWorkspace").then((module) => ({
    default: module.EditorWorkbenchWorkspace,
  })),
);

interface SettingsHomeSectionProps {
  addFavoriteDraft: ComponentProps<typeof FavoritesDevicePanel>["onAddFavorite"];
  addPolicyDraft: ComponentProps<typeof PageSettingsPanel>["onAddPolicyEntry"];
  removeFavoriteDraft: ComponentProps<typeof FavoritesDevicePanel>["onRemoveFavorite"];
  removePolicyDraft: ComponentProps<typeof PageSettingsPanel>["onRemovePolicyEntry"];
  saveMessage: string | null;
  selectedFavoriteCount: number;
  settingsDraft: {
    favorites: ComponentProps<typeof FavoritesDevicePanel>["favorites"];
    function: ComponentProps<typeof FunctionSettingsPanel>["draft"];
    page: ComponentProps<typeof PageSettingsPanel>["draft"];
  };
  showAdvancedEditor: boolean;
  setShowAdvancedEditor: (updater: (current: boolean) => boolean) => void;
  updateFavoriteDraft: ComponentProps<typeof FavoritesDevicePanel>["onUpdateFavorite"];
  updateFunctionDraft: ComponentProps<typeof FunctionSettingsPanel>["onChange"];
  updatePageDraft: (field: "roomLabelMode", value: string) => void;
  updatePolicyDraft: ComponentProps<typeof PageSettingsPanel>["onChangePolicyEntry"];
  upsertPolicyDraft: ComponentProps<typeof PageSettingsPanel>["onSetPolicyValue"];
}

export function SettingsHomeSection({
  addFavoriteDraft,
  addPolicyDraft,
  removeFavoriteDraft,
  removePolicyDraft,
  saveMessage,
  selectedFavoriteCount,
  settingsDraft,
  showAdvancedEditor,
  setShowAdvancedEditor,
  updateFavoriteDraft,
  updateFunctionDraft,
  updatePageDraft,
  updatePolicyDraft,
  upsertPolicyDraft,
}: SettingsHomeSectionProps) {
  return (
    <section className="settings-home-shell">
      <section className="panel settings-home-shell__summary">
        <div className="settings-home-shell__summary-copy">
          <span className="card-eyebrow">草稿保存</span>
          <h3>首页治理字段修改后统一点“保存首页设置”</h3>
          <p className="muted-copy">
            这一页的常用设备、显示策略和功能策略都是设置草稿；接入、终端和备份动作则会直接调用各自
            API。
          </p>
        </div>
        <div className="badge-row settings-home-shell__summary-actions">
          <span className="state-chip">{saveMessage ? "刚刚保存" : "草稿模式"}</span>
          <Link className="button button--primary" to="/?edit=1">
            进入总览轻编辑
          </Link>
        </div>
      </section>

      <SettingsTaskModule
        defaultOpen
        description="管理首页常用设备的启停、排序和基础入口；设备发现仍在设备页处理。"
        eyebrow="首页治理"
        status={`${selectedFavoriteCount}/${settingsDraft.favorites.length} 启用`}
        statusTone="neutral"
        title="常用设备"
      >
        <FavoritesDevicePanel
          favorites={settingsDraft.favorites}
          onAddFavorite={addFavoriteDraft}
          onRemoveFavorite={removeFavoriteDraft}
          onUpdateFavorite={updateFavoriteDraft}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        defaultOpen
        description="集中维护首页展示、图标、布局、阈值和自动返回等规则。"
        eyebrow="首页治理"
        status={`${settingsDraft.page.homepageDisplayPolicy.length} 项显示策略`}
        statusTone="neutral"
        title="显示策略与行为规则"
      >
        <PageSettingsPanel
          draft={settingsDraft.page}
          onAddPolicyEntry={addPolicyDraft}
          onChangePolicyEntry={updatePolicyDraft}
          onChangeRoomLabelMode={(value) => updatePageDraft("roomLabelMode", value)}
          onRemovePolicyEntry={removePolicyDraft}
          onSetPolicyValue={upsertPolicyDraft}
        />
        <FunctionSettingsPanel draft={settingsDraft.function} onChange={updateFunctionDraft} />
      </SettingsTaskModule>

      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            onClick={() => setShowAdvancedEditor((current) => !current)}
            type="button"
          >
            {showAdvancedEditor ? "收起编辑器" : "展开编辑器"}
          </button>
        }
        description="高频调整去总览轻编辑；资源、热点高级配置和发布治理留在这里按需展开。"
        eyebrow="首页治理"
        status={showAdvancedEditor ? "编辑器已展开" : "默认收起"}
        statusTone="neutral"
        title="布局与发布"
      >
        {showAdvancedEditor ? (
          <Suspense
            fallback={
              <div className="utility-card editor-loading" role="status">
                编辑器加载中...
              </div>
            }
          >
            <LazyEditorWorkbenchWorkspace embedded />
          </Suspense>
        ) : (
          <div className="settings-empty-detail">
            <p className="muted-copy">
              高级编辑器会加载完整首页工作台，默认收起以避免干扰常规设置。
            </p>
            <Link className="button button--ghost" to="/?edit=1">
              去总览轻编辑
            </Link>
          </div>
        )}
      </SettingsTaskModule>
    </section>
  );
}
