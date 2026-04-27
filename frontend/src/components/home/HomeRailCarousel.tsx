import { useState } from "react";
import type { ReactNode } from "react";
import { nextIndex } from "./homeInsightRailModel";

export interface RailSlide {
  key: string;
  label: string;
  content: ReactNode;
}

export function RailCarousel({
  activeIndex,
  ariaLabel,
  onChange,
  slides,
  variant,
}: {
  activeIndex: number;
  ariaLabel: string;
  onChange: (index: number) => void;
  slides: RailSlide[];
  variant: "feature" | "media";
}) {
  const [dragStart, setDragStart] = useState<number | null>(null);

  function commitSwipe(clientX: number) {
    if (dragStart === null) {
      return;
    }
    const delta = clientX - dragStart;
    setDragStart(null);
    if (Math.abs(delta) < 42) {
      return;
    }
    onChange(nextIndex(activeIndex, slides.length, delta < 0 ? 1 : -1));
  }

  return (
    <section
      className={`home-rail-carousel home-rail-carousel--${variant}`}
      aria-label={ariaLabel}
    >
      <div
        className="home-rail-carousel__viewport"
        onPointerCancel={() => setDragStart(null)}
        onPointerDown={(event) => setDragStart(event.clientX)}
        onPointerLeave={(event) => commitSwipe(event.clientX)}
        onPointerUp={(event) => commitSwipe(event.clientX)}
      >
        <div
          className="home-rail-carousel__track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {slides.map((slide) => (
            <div
              key={slide.key}
              className="home-rail-carousel__slide"
              aria-label={slide.label}
            >
              {slide.content}
            </div>
          ))}
        </div>
      </div>
      <div className="home-rail-carousel__dots">
        {slides.map((slide, index) => (
          <button
            key={slide.key}
            aria-label={slide.label}
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => onChange(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}
