import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { newElement, newTextElement } from "@excalidraw/element";
import { randomId, viewportCoordsToSceneCoords } from "@excalidraw/common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LockedIcon,
  UnlockedIcon,
} from "@excalidraw/excalidraw/components/icons";

type ElementSize = { width: number; height: number };

// Small icon set drawn specifically for this palette: each one is a
// miniature of the actual shape it drops onto the canvas (a gate for API
// Gateway, a fan-out for Load Balancer, a cylinder for Database, etc.)
// instead of borrowing Excalidraw's generic rectangle/circle tool icons,
// which carried no relation to what each button actually inserts.
const paletteIconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ApiGatewayIcon = (
  <svg {...paletteIconProps}>
    <rect x="2.5" y="7" width="3" height="10" rx="1" />
    <rect x="18.5" y="7" width="3" height="10" rx="1" />
    <path d="M6 12h12" />
    <path d="M14 8.5L18 12l-4 3.5" />
  </svg>
);

const LoadBalancerIcon = (
  <svg {...paletteIconProps}>
    <circle cx="12" cy="4.8" r="2.1" />
    <circle cx="4.8" cy="19.2" r="2.1" />
    <circle cx="12" cy="19.2" r="2.1" />
    <circle cx="19.2" cy="19.2" r="2.1" />
    <path d="M12 7v10M12 7L4.8 17.2M12 7l7.2 10.2" />
  </svg>
);

const ServiceIcon = (
  <svg {...paletteIconProps}>
    <path d="M12 2.5l8 4.4v10.2l-8 4.4-8-4.4V6.9z" />
  </svg>
);

const WorkerIcon = (
  <svg {...paletteIconProps}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" />
  </svg>
);

const QueueIcon = (
  <svg {...paletteIconProps}>
    <rect x="1.8" y="8" width="4.4" height="8" rx="1" />
    <rect x="9.8" y="8" width="4.4" height="8" rx="1" />
    <rect x="17.8" y="8" width="4.4" height="8" rx="1" />
  </svg>
);

const TopicIcon = (
  <svg {...paletteIconProps}>
    <circle cx="12" cy="18.2" r="1.5" fill="currentColor" stroke="none" />
    <path d="M8.4 14.6a5.2 5.2 0 0 1 7.2 0" />
    <path d="M5.2 11.4a9.6 9.6 0 0 1 13.6 0" />
  </svg>
);

const DatabaseIcon = (
  <svg {...paletteIconProps}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12a7.5 3 0 0 0 15 0V6" />
  </svg>
);

const CacheIcon = (
  <svg {...paletteIconProps}>
    <path
      d="M13 2.5L4.8 13.5h5.6l-1 8 8.2-11h-5.6z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);

const ProducerIcon = (
  <svg {...paletteIconProps}>
    <circle cx="6.6" cy="12" r="4" />
    <path d="M12.6 12h5.6M15.6 8.6l3.4 3.4-3.4 3.4" />
  </svg>
);

const ConsumerIcon = (
  <svg {...paletteIconProps}>
    <circle cx="17.4" cy="12" r="4" />
    <path d="M11.4 12H5.8M8.8 8.6L5.4 12l3.4 3.4" />
  </svg>
);

type PaletteItem = {
  id: string;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  insert: (x: number, y: number, size?: ElementSize) => void;
};

const STROKE = "#1f1f1f";
const FONT_SIZE = 22;
// Below this, a pointer-up reads as a plain click and places nothing.
const DRAG_CLICK_THRESHOLD = 6;
// Smallest shape a drag can produce; prevents degenerate slivers.
const MIN_DRAG_SIZE = 40;
// Default gap from the right edge when Excalidraw's own right-docked
// sidebar (library/search/stats) isn't open.
const DEFAULT_DOCK_RIGHT = 16;
const DOCK_GAP = 16;

export const SystemDesignPalette = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [dockRight, setDockRight] = useState(DEFAULT_DOCK_RIGHT);
  const [dragPreview, setDragPreview] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const insertElements = useCallback(
    (elementsFactory: () => any[]) => {
      if (!excalidrawAPI) {
        return;
      }

      const nextElements = elementsFactory();
      const currentElements = excalidrawAPI.getSceneElements();

      // Intentionally leave the new elements unselected: selecting them
      // would pop open Excalidraw's own shape-properties panel, mirroring
      // how the native shape tools behave (see App.tsx onPointerUp, which
      // only auto-selects linear elements, not generic shapes).
      excalidrawAPI.updateScene({
        elements: [...currentElements, ...nextElements],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [excalidrawAPI],
  );

  const makeLabeledRect = useCallback(
    (
      x: number,
      y: number,
      label: string,
      opts: {
        width?: number;
        height?: number;
        backgroundColor: string;
        roundness?: { type: 2 } | null;
        fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
      },
    ) => {
      insertElements(() => {
        const width = opts.width ?? 220;
        const height = opts.height ?? 84;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const container = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: STROKE,
          backgroundColor: opts.backgroundColor,
          fillStyle: opts.fillStyle ?? "hachure",
          strokeWidth: 2,
          roughness: 1,
          roundness: opts.roundness ?? { type: 2 },
          groupIds: [groupId],
        });

        const text = newTextElement({
          x,
          y,
          text: label,
          fontSize: FONT_SIZE,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [container, text];
      });
    },
    [insertElements],
  );

  const makeLabeledEllipse = useCallback(
    (
      x: number,
      y: number,
      label: string,
      backgroundColor: string,
      size?: ElementSize,
    ) => {
      insertElements(() => {
        const width = size?.width ?? 180;
        const height = size?.height ?? 180;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const container = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: STROKE,
          backgroundColor,
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });

        const text = newTextElement({
          x,
          y,
          text: label,
          fontSize: FONT_SIZE,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [container, text];
      });
    },
    [insertElements],
  );

  const makeQueue = useCallback(
    (x: number, y: number) => {
      insertElements(() => {
        const width = 320;
        const height = 96;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const outer = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: "#e67700",
          backgroundColor: "#ffe8cc",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          roundness: { type: 2 },
          groupIds: [groupId],
        });

        const item1 = newElement({
          type: "rectangle",
          x: origin.x + 24,
          y: origin.y + 22,
          width: 52,
          height: 52,
          strokeColor: "#e67700",
          backgroundColor: "#fff3bf",
          fillStyle: "cross-hatch",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const item2 = newElement({
          type: "rectangle",
          x: origin.x + 96,
          y: origin.y + 22,
          width: 52,
          height: 52,
          strokeColor: "#e67700",
          backgroundColor: "#fff3bf",
          fillStyle: "cross-hatch",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const item3 = newElement({
          type: "rectangle",
          x: origin.x + 248,
          y: origin.y + 22,
          width: 52,
          height: 52,
          strokeColor: "#e67700",
          backgroundColor: "#fff3bf",
          fillStyle: "cross-hatch",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });

        const label = newTextElement({
          x,
          y: origin.y + height + 28,
          text: "Message Queue",
          fontSize: 20,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [outer, item1, item2, item3, label];
      });
    },
    [insertElements],
  );

  const makeDatabase = useCallback(
    (x: number, y: number) => {
      insertElements(() => {
        const width = 170;
        const bodyHeight = 110;
        const topHeight = 38;
        const groupId = randomId();
        const totalHeight = bodyHeight + topHeight;
        const origin = { x: x - width / 2, y: y - totalHeight / 2 };

        const top = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y,
          width,
          height: topHeight,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const body = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y + topHeight / 2,
          width,
          height: bodyHeight,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const bottom = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y + bodyHeight,
          width,
          height: topHeight,
          strokeColor: "#2b8a3e",
          backgroundColor: "#d3f9d8",
          fillStyle: "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });
        const text = newTextElement({
          x,
          y: origin.y + bodyHeight / 2 + 18,
          text: "DB",
          fontSize: 28,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        return [body, top, bottom, text];
      });
    },
    [insertElements],
  );

  const items: PaletteItem[] = useMemo(
    () => [
      {
        id: "api-gateway",
        label: "API Gateway",
        shortcut: "1",
        icon: ApiGatewayIcon,
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "API Gateway", {
            backgroundColor: "#d0ebff",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "load-balancer",
        label: "Load Balancer",
        shortcut: "2",
        icon: LoadBalancerIcon,
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Load Balancer", {
            backgroundColor: "#ffe8cc",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "service",
        label: "Service",
        shortcut: "3",
        icon: ServiceIcon,
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Service", {
            backgroundColor: "#d3f9d8",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "worker",
        label: "Worker",
        shortcut: "4",
        icon: WorkerIcon,
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Worker", {
            backgroundColor: "#f3d9fa",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "queue",
        label: "Message Queue",
        shortcut: "5",
        icon: QueueIcon,
        insert: (x, y) => makeQueue(x, y),
      },
      {
        id: "topic",
        label: "Topic",
        shortcut: "6",
        icon: TopicIcon,
        insert: (x, y, size) =>
          makeLabeledEllipse(x, y, "Topic", "#fff3bf", size),
      },
      {
        id: "db",
        label: "Database",
        shortcut: "7",
        icon: DatabaseIcon,
        insert: (x, y) => makeDatabase(x, y),
      },
      {
        id: "cache",
        label: "Cache",
        shortcut: "8",
        icon: CacheIcon,
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Cache", {
            backgroundColor: "#e5dbff",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "producer",
        label: "Producer",
        shortcut: "9",
        icon: ProducerIcon,
        insert: (x, y, size) =>
          makeLabeledEllipse(x, y, "Producer", "#ffc9c9", size),
      },
      {
        id: "consumer",
        label: "Consumer",
        shortcut: "0",
        icon: ConsumerIcon,
        insert: (x, y, size) =>
          makeLabeledEllipse(x, y, "Consumer", "#d8f5a2", size),
      },
    ],
    [makeDatabase, makeLabeledEllipse, makeLabeledRect, makeQueue],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    if (activeItemId) {
      excalidrawAPI.setCursor("crosshair");
    } else {
      excalidrawAPI.resetCursor();
    }

    return () => {
      excalidrawAPI.resetCursor();
    };
  }, [activeItemId, excalidrawAPI]);

  // Excalidraw's own right-docked sidebar (library/search/stats) can open
  // in the same corner as this toolbar. Track its width and slide left of
  // it instead of overlapping, similar to how a native sidebar-aware panel
  // would behave.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".excalidraw");
    if (!root) {
      return;
    }

    let sidebarObserver: ResizeObserver | null = null;

    const updateDockRight = () => {
      const sidebar = root.querySelector<HTMLElement>(".sidebar");
      setDockRight(
        sidebar
          ? sidebar.getBoundingClientRect().width + DOCK_GAP
          : DEFAULT_DOCK_RIGHT,
      );
    };

    const attachSidebarObserver = () => {
      sidebarObserver?.disconnect();
      sidebarObserver = null;

      const sidebar = root.querySelector<HTMLElement>(".sidebar");
      if (sidebar) {
        sidebarObserver = new ResizeObserver(updateDockRight);
        sidebarObserver.observe(sidebar);
      }
    };

    updateDockRight();
    attachSidebarObserver();

    // The sidebar mounts/unmounts as the user opens and closes it, so watch
    // for that instead of only its size once it exists.
    const mutationObserver = new MutationObserver(() => {
      updateDockRight();
      attachSidebarObserver();
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      sidebarObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activeItemId || !excalidrawAPI) {
      return;
    }

    const activeInsert =
      items.find((item) => item.id === activeItemId)?.insert ?? null;
    if (!activeInsert) {
      return;
    }

    let dragStart: {
      clientX: number;
      clientY: number;
      sceneX: number;
      sceneY: number;
    } | null = null;

    const toScene = (event: { clientX: number; clientY: number }) =>
      viewportCoordsToSceneCoords(event, excalidrawAPI.getAppState());

    const endDrag = () => {
      dragStart = null;
      setDragPreview(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragStart) {
        return;
      }

      setDragPreview({
        left: Math.min(dragStart.clientX, event.clientX),
        top: Math.min(dragStart.clientY, event.clientY),
        width: Math.abs(event.clientX - dragStart.clientX),
        height: Math.abs(event.clientY - dragStart.clientY),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragStart) {
        return;
      }

      const dragDistance = Math.hypot(
        event.clientX - dragStart.clientX,
        event.clientY - dragStart.clientY,
      );

      if (dragDistance < DRAG_CLICK_THRESHOLD) {
        // A plain click with no drag places nothing, mirroring Excalidraw's
        // own shape tools: a click-only rectangle/ellipse is "invisibly
        // small" and gets discarded (see App.tsx's isInvisiblySmallElement
        // check). Leave the tool armed so the user can just try the drag.
        endDrag();
        return;
      }

      const { x: endX, y: endY } = toScene(event);
      const width = Math.max(MIN_DRAG_SIZE, Math.abs(endX - dragStart.sceneX));
      const height = Math.max(MIN_DRAG_SIZE, Math.abs(endY - dragStart.sceneY));
      const centerX = Math.min(dragStart.sceneX, endX) + width / 2;
      const centerY = Math.min(dragStart.sceneY, endY) + height / 2;
      activeInsert(centerX, centerY, { width, height });

      endDrag();

      // Single-shot by default, mirroring Excalidraw's own shape tools:
      // place one element, then fall back to the selection tool. Locking
      // keeps the tool armed for stamping multiple copies in a row.
      if (!isLocked) {
        setActiveItemId(null);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      // Only arm a placement when the click actually lands on the drawing
      // canvas. Anything else (top toolbar, side panels, our own sidebar,
      // dialogs, etc.) should behave like a normal UI click.
      const target = event.target as HTMLElement;
      if (!target.closest?.(".excalidraw__canvas")) {
        return;
      }

      // Stop this pointerdown from ever reaching Excalidraw's own canvas
      // handlers, otherwise its default tool starts its own rubber-band
      // selection/drag underneath ours at the same time.
      event.preventDefault();
      event.stopPropagation();

      const { x, y } = toScene(event);
      dragStart = {
        clientX: event.clientX,
        clientY: event.clientY,
        sceneX: x,
        sceneY: y,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        endDrag();
        setActiveItemId(null);
      }
    };

    // Capture phase so we can stop the event before Excalidraw's own canvas
    // handlers (attached further down the tree) ever see it.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      endDrag();
    };
  }, [activeItemId, excalidrawAPI, isLocked, items]);

  return (
    <div
      ref={rootRef}
      className="system-design-toolbar"
      aria-label="System design toolbar"
      style={{ right: `${dockRight}px` }}
    >
      <div className="system-design-toolbar__header">
        <span>SD</span>
        <button
          className={`system-design-toolbar__lock${
            isLocked ? " system-design-toolbar__lock--active" : ""
          }`}
          onClick={() => setIsLocked((current) => !current)}
          type="button"
          title={
            isLocked
              ? "Tool stays active after placing (click to disable)"
              : "Tool deactivates after placing (click to keep it active)"
          }
          aria-label="Keep tool active after placing a shape"
          aria-pressed={isLocked}
        >
          {isLocked ? LockedIcon : UnlockedIcon}
        </button>
      </div>
      <div className="system-design-toolbar__items">
        {items.map((item) => (
          <button
            key={item.id}
            className={`system-design-toolbar__item${
              activeItemId === item.id
                ? " system-design-toolbar__item--active"
                : ""
            }`}
            onClick={() =>
              setActiveItemId((current) =>
                current === item.id ? null : item.id,
              )
            }
            type="button"
            title={item.label}
            aria-label={item.label}
          >
            <span className="system-design-toolbar__icon">{item.icon}</span>
            <span className="system-design-toolbar__shortcut">
              {item.shortcut}
            </span>
          </button>
        ))}
      </div>
      {dragPreview && (
        <div
          className="system-design-toolbar__drag-preview"
          style={{
            left: dragPreview.left,
            top: dragPreview.top,
            width: dragPreview.width,
            height: dragPreview.height,
          }}
        />
      )}
    </div>
  );
};
