import { PropsWithChildren, ReactNode } from "react";

interface PageFrameProps extends PropsWithChildren {
  aside?: ReactNode;
  asidePosition?: "left" | "right";
  footer?: ReactNode;
  className?: string;
}

export function PageFrame({
  aside,
  asidePosition = "right",
  children,
  footer,
  className,
}: PageFrameProps) {
  return (
    <section className={className ? `page-frame ${className}` : "page-frame"}>
      <div className={aside ? `page-frame__grid is-${asidePosition}` : "page-frame__grid"}>
        {asidePosition === "left" ? aside : null}
        <div className="page-frame__main">{children}</div>
        {asidePosition === "right" ? aside : null}
      </div>
      {footer ? <div className="page-frame__footer">{footer}</div> : null}
    </section>
  );
}
