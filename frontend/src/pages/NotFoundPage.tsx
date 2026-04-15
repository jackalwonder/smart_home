import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="page page--not-found">
      <span className="page__eyebrow">404</span>
      <h2>页面不存在</h2>
      <p>当前前端骨架只提供首页、设置中心和编辑态三个入口。</p>
      <Link className="button-link" to="/">
        返回首页
      </Link>
    </section>
  );
}
