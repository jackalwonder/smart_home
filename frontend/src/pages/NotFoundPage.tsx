import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="page page--not-found">
      <span className="card-eyebrow">404</span>
      <h2>页面不存在</h2>
      <p className="muted-copy">当前中控台只提供总览、设置中心和编辑态三个入口。</p>
      <Link className="button button--primary" to="/">
        返回首页
      </Link>
    </section>
  );
}
