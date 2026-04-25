import { Link } from "react-router-dom";
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
      description="这里负责首页常用设备的排序和启停。添加设备的轻量入口在设备页，复杂规则仍在页面策略和功能策略里配置。"
      eyebrow="首页常用设备"
      title="首页入口管理"
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
                  placeholder="从设备页复制设备 ID"
                  value={favorite.deviceId}
                />
              </label>
              <label className="form-field">
                <span>首页排序</span>
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
                  onChange={(event) =>
                    onUpdateFavorite(index, "selected", event.target.checked)
                  }
                  type="checkbox"
                />
                <span>在首页启用</span>
              </label>
              <button
                className="button button--ghost"
                onClick={() => onRemoveFavorite(index)}
                type="button"
              >
                移出首页
              </button>
            </article>
          ))
        ) : (
          <p className="muted-copy">
            当前还没有加入首页的设备。先去设备页找到设备并确认可加入，再回到这里排序。
          </p>
        )}
        <div className="badge-row">
          <button className="button button--ghost" onClick={onAddFavorite} type="button">
            手动添加设备 ID
          </button>
          <Link className="button button--ghost" to="/devices">
            去设备页添加更多
          </Link>
        </div>
      </div>
    </SettingsModuleCard>
  );
}
