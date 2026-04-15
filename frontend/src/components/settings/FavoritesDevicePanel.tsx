import { SettingsModuleCard } from "./SettingsModuleCard";

interface FavoritesDevicePanelProps {
  favorites: Array<{
    deviceId: string;
    selected: boolean;
    favoriteOrder: string;
  }>;
  onAddFavorite: () => void;
  onRemoveFavorite: (index: number) => void;
  onUpdateFavorite: (
    index: number,
    field: "deviceId" | "selected" | "favoriteOrder",
    value: string | boolean,
  ) => void;
}

export function FavoritesDevicePanel({
  favorites,
  onAddFavorite,
  onRemoveFavorite,
  onUpdateFavorite,
}: FavoritesDevicePanelProps) {
  return (
    <SettingsModuleCard
      description="这里的常用设备会进入首页右侧的快捷区和收藏入口。"
      eyebrow="常用设备"
      title="固定设备"
    >
      <div className="favorite-editor">
        {favorites.length ? (
          favorites.map((favorite, index) => (
            <article key={`favorite-${index}`} className="favorite-editor__row">
              <label className="form-field">
                <span>设备 ID</span>
                <input
                  className="control-input"
                  onChange={(event) => onUpdateFavorite(index, "deviceId", event.target.value)}
                  placeholder="device.xxx"
                  value={favorite.deviceId}
                />
              </label>
              <label className="form-field">
                <span>排序</span>
                <input
                  className="control-input"
                  min="0"
                  onChange={(event) =>
                    onUpdateFavorite(index, "favoriteOrder", event.target.value)
                  }
                  type="number"
                  value={favorite.favoriteOrder}
                />
              </label>
              <label className="toggle-field">
                <input
                  checked={favorite.selected}
                  onChange={(event) => onUpdateFavorite(index, "selected", event.target.checked)}
                  type="checkbox"
                />
                <span>启用</span>
              </label>
              <button
                className="button button--ghost"
                onClick={() => onRemoveFavorite(index)}
                type="button"
              >
                删除
              </button>
            </article>
          ))
        ) : (
          <p className="muted-copy">当前还没有固定设备，新增后保存即可生效。</p>
        )}
        <button className="button button--ghost" onClick={onAddFavorite} type="button">
          新增设备
        </button>
      </div>
    </SettingsModuleCard>
  );
}
