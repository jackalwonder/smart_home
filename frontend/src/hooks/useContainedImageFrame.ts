import { RefObject, useEffect, useMemo, useState } from "react";
import { hasImageSize, type ImageSize } from "../types/image";

interface ViewportSize {
  width: number;
  height: number;
}

export interface ContainedImageFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

function measureViewport(element: HTMLElement): ViewportSize {
  return {
    width: element.clientWidth,
    height: element.clientHeight,
  };
}

export function useViewportSize(viewportRef: RefObject<HTMLElement | null>) {
  const [viewportSize, setViewportSize] = useState<ViewportSize>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return undefined;
    }

    const update = () => {
      setViewportSize(measureViewport(element));
    };

    update();

    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [viewportRef]);

  return viewportSize;
}

export function useContainedImageFrame(input: {
  hasBackgroundImage: boolean;
  imageSize: ImageSize | null | undefined;
  viewportSize: ViewportSize;
}) {
  const { hasBackgroundImage, imageSize, viewportSize } = input;

  return useMemo<ContainedImageFrame | null>(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return null;
    }

    if (!hasBackgroundImage) {
      return {
        left: 0,
        top: 0,
        width: viewportSize.width,
        height: viewportSize.height,
      };
    }

    if (!hasImageSize(imageSize)) {
      return null;
    }

    const scale = Math.min(
      viewportSize.width / imageSize.width,
      viewportSize.height / imageSize.height,
    );
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;

    return {
      left: (viewportSize.width - width) / 2,
      top: (viewportSize.height - height) / 2,
      width,
      height,
    };
  }, [hasBackgroundImage, imageSize, viewportSize.height, viewportSize.width]);
}

export function readImageSize(image: HTMLImageElement): ImageSize | null {
  if (
    Number.isFinite(image.naturalWidth) &&
    Number.isFinite(image.naturalHeight) &&
    image.naturalWidth > 0 &&
    image.naturalHeight > 0
  ) {
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  return null;
}
