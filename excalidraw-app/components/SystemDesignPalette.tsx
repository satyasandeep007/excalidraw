import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { newElement, newTextElement, wrapText } from "@excalidraw/element";
import {
  randomId,
  viewportCoordsToSceneCoords,
  getFontString,
  DEFAULT_FONT_FAMILY,
  FONT_SIZES,
} from "@excalidraw/common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LockedIcon,
  UnlockedIcon,
} from "@excalidraw/excalidraw/components/icons";

type ElementSize = { width: number; height: number };

// Each button's icon is a literal miniature of the shape it places: same
// silhouette (wide box, tall box, ellipse, dashed container), same fill and
// stroke color. Glancing at the toolbar shows exactly what you'll get,
// rather than an abstract symbol you have to learn to associate with it.
const paletteIconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
};

type ShapePreviewKind = "wide" | "tall" | "note" | "ellipse" | "container";

const SHAPE_PREVIEW_GEOMETRY: Record<
  Exclude<ShapePreviewKind, "ellipse" | "container">,
  { x: number; y: number; width: number; height: number }
> = {
  wide: { x: 2, y: 6, width: 20, height: 12 },
  tall: { x: 6, y: 2, width: 12, height: 20 },
  note: { x: 2, y: 7, width: 20, height: 10 },
};

const shapePreviewIcon = (
  kind: ShapePreviewKind,
  backgroundColor: string,
  strokeColor: string,
) => {
  if (kind === "ellipse") {
    return (
      <svg {...paletteIconProps} fill={backgroundColor} stroke={strokeColor}>
        <ellipse cx="12" cy="12" rx="9" ry="6.5" strokeWidth="1.6" />
      </svg>
    );
  }

  if (kind === "container") {
    return (
      <svg {...paletteIconProps} fill="none" stroke={strokeColor}>
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="2"
          strokeWidth="1.6"
          strokeDasharray="3 2.5"
        />
      </svg>
    );
  }

  return (
    <svg {...paletteIconProps} fill={backgroundColor} stroke={strokeColor}>
      <rect {...SHAPE_PREVIEW_GEOMETRY[kind]} rx="3" strokeWidth="1.6" />
    </svg>
  );
};

type PaletteItem = {
  id: string;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  insert: (x: number, y: number, size?: ElementSize) => void;
};

const STROKE = "#1f1f1f";
// Below this, a pointer-up reads as a plain click and places nothing.
const DRAG_CLICK_THRESHOLD = 6;
// Smallest shape a drag can produce; prevents degenerate slivers.
const MIN_DRAG_SIZE = 40;

// All labels stay at Excalidraw's own "M" preset size (the same one the
// font-size buttons in the properties panel use) rather than shrinking
// per-shape, so a diagram reads consistently regardless of how each box
// was sized. Labels are plain (unbound) text elements, so they don't
// auto-wrap the way a container-bound label would; wrap to the available
// width ourselves so text doesn't spill past a narrow shape's edges.
const fitLabelText = (text: string, availableWidth: number) => {
  const fontSize: number = FONT_SIZES.md;
  const font = getFontString({ fontFamily: DEFAULT_FONT_FAMILY, fontSize });
  const wrapped = wrapText(text, font, Math.max(availableWidth, fontSize));

  return { fontSize, text: wrapped };
};

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
        strokeColor?: string;
        roundness?: { type: 2 } | null;
        fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
        caption?: string;
      },
    ) => {
      insertElements(() => {
        const width = opts.width ?? 220;
        const height = opts.height ?? 84;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };
        const strokeColor = opts.strokeColor ?? STROKE;

        const container = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor,
          backgroundColor: opts.backgroundColor,
          fillStyle: opts.fillStyle ?? "hachure",
          strokeWidth: 2,
          roughness: 1,
          roundness: opts.roundness ?? { type: 2 },
          groupIds: [groupId],
        });

        const fitted = fitLabelText(label, width - 16);
        const text = newTextElement({
          x,
          y,
          text: fitted.text,
          fontSize: fitted.fontSize,
          fontFamily: DEFAULT_FONT_FAMILY,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        const elements = [container, text];

        if (opts.caption) {
          elements.push(
            newTextElement({
              x,
              y: origin.y + height + 10,
              text: opts.caption,
              fontSize: 14,
              fontFamily: DEFAULT_FONT_FAMILY,
              strokeColor: "#495057",
              backgroundColor: "transparent",
              textAlign: "center",
              verticalAlign: "top",
              groupIds: [groupId],
            }),
          );
        }

        return elements;
      });
    },
    [insertElements],
  );

  const makeLabeledEllipse = useCallback(
    (
      x: number,
      y: number,
      label: string,
      opts: {
        backgroundColor: string;
        strokeColor?: string;
        fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
        caption?: string;
        size?: ElementSize;
      },
    ) => {
      insertElements(() => {
        const width = opts.size?.width ?? 160;
        const height = opts.size?.height ?? 110;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };
        const strokeColor = opts.strokeColor ?? STROKE;

        const container = newElement({
          type: "ellipse",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor,
          backgroundColor: opts.backgroundColor,
          fillStyle: opts.fillStyle ?? "hachure",
          strokeWidth: 2,
          roughness: 1,
          groupIds: [groupId],
        });

        // Approximate the rectangle inscribed in the ellipse (a centered
        // block stays clear of the curve at roughly 0.7x the full width)
        // so the label doesn't run past the outline.
        const fitted = fitLabelText(label, width * 0.7 - 12);
        const text = newTextElement({
          x,
          y,
          text: fitted.text,
          fontSize: fitted.fontSize,
          fontFamily: DEFAULT_FONT_FAMILY,
          strokeColor: STROKE,
          backgroundColor: "transparent",
          textAlign: "center",
          verticalAlign: "middle",
          groupIds: [groupId],
        });

        const elements = [container, text];

        if (opts.caption) {
          elements.push(
            newTextElement({
              x,
              y: origin.y + height + 10,
              text: opts.caption,
              fontSize: 14,
              fontFamily: DEFAULT_FONT_FAMILY,
              strokeColor: "#495057",
              backgroundColor: "transparent",
              textAlign: "center",
              verticalAlign: "top",
              groupIds: [groupId],
            }),
          );
        }

        return elements;
      });
    },
    [insertElements],
  );

  // A large bounding box with a small top-left label, matching the "KAFKA"
  // grouping box used to visually cluster producer/consumer/topic shapes.
  // It's a plain rectangle rather than an Excalidraw frame, so it doesn't
  // auto-capture or clip whatever gets placed on top of it.
  const makeContainer = useCallback(
    (x: number, y: number, label: string, size?: ElementSize) => {
      insertElements(() => {
        const width = size?.width ?? 480;
        const height = size?.height ?? 360;
        const groupId = randomId();
        const origin = { x: x - width / 2, y: y - height / 2 };

        const container = newElement({
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width,
          height,
          strokeColor: "#868e96",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1.5,
          roughness: 1,
          roundness: { type: 2 },
          groupIds: [groupId],
        });

        const text = newTextElement({
          x: origin.x + 14,
          y: origin.y + 10,
          text: label,
          fontSize: 14,
          fontFamily: DEFAULT_FONT_FAMILY,
          strokeColor: "#868e96",
          backgroundColor: "transparent",
          textAlign: "left",
          verticalAlign: "top",
          groupIds: [groupId],
        });

        return [container, text];
      });
    },
    [insertElements],
  );

  const items: PaletteItem[] = useMemo(
    () => [
      {
        id: "client",
        label: "Client",
        shortcut: "1",
        icon: shapePreviewIcon("wide", "#a5d8ff", "#1971c2"),
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Client", {
            backgroundColor: "#a5d8ff",
            strokeColor: "#1971c2",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "service",
        label: "Service",
        shortcut: "2",
        icon: shapePreviewIcon("wide", "#ffc9c9", "#e03131"),
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Service", {
            backgroundColor: "#ffc9c9",
            strokeColor: "#e03131",
            width: size?.width ?? 150,
            height: size?.height ?? 64,
          }),
      },
      {
        id: "infra",
        label: "Infra / Cron",
        shortcut: "3",
        icon: shapePreviewIcon("wide", "#ffec99", "#f08c00"),
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Infra / Cron", {
            backgroundColor: "#ffec99",
            strokeColor: "#f08c00",
            fillStyle: "solid",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "postgres",
        label: "Postgres",
        shortcut: "4",
        icon: shapePreviewIcon("ellipse", "#b2f2bb", "#2f9e44"),
        insert: (x, y, size) =>
          makeLabeledEllipse(x, y, "Postgres", {
            backgroundColor: "#b2f2bb",
            strokeColor: "#2f9e44",
            size,
          }),
      },
      {
        id: "redis",
        label: "Redis",
        shortcut: "5",
        icon: shapePreviewIcon("ellipse", "#99e9f2", "#0c8599"),
        insert: (x, y, size) =>
          makeLabeledEllipse(x, y, "Redis", {
            backgroundColor: "#99e9f2",
            strokeColor: "#0c8599",
            fillStyle: "solid",
            caption: "Cache",
            size,
          }),
      },
      {
        id: "api-gateway",
        label: "API Gateway",
        shortcut: "6",
        icon: shapePreviewIcon("wide", "#ffc9c9", "#e03131"),
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "API Gateway", {
            backgroundColor: "#ffc9c9",
            strokeColor: "#e03131",
            caption: "Auth + Rate Limiter",
            width: size?.width,
            height: size?.height,
          }),
      },
      {
        id: "note",
        label: "Notes",
        shortcut: "7",
        icon: shapePreviewIcon("note", "#fff9db", "#868e96"),
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "Notes", {
            backgroundColor: "#fff9db",
            strokeColor: "#868e96",
            width: size?.width ?? 240,
            height: size?.height ?? 120,
          }),
      },
      {
        id: "kafka",
        label: "Kafka",
        shortcut: "8",
        icon: shapePreviewIcon("container", "transparent", "#868e96"),
        insert: (x, y, size) => makeContainer(x, y, "KAFKA", size),
      },
      {
        id: "state-machine",
        label: "State Machine",
        shortcut: "9",
        icon: shapePreviewIcon("tall", "#ffec99", "#f08c00"),
        insert: (x, y, size) =>
          makeLabeledRect(x, y, "State Machine", {
            backgroundColor: "#ffec99",
            strokeColor: "#f08c00",
            fillStyle: "solid",
            width: size?.width ?? 220,
            height: size?.height ?? 260,
          }),
      },
      {
        id: "system",
        label: "System",
        shortcut: "0",
        icon: shapePreviewIcon("ellipse", "#ffec99", "#f08c00"),
        insert: (x, y, size) =>
          makeLabeledEllipse(x, y, "System", {
            backgroundColor: "#ffec99",
            strokeColor: "#f08c00",
            fillStyle: "solid",
            size,
          }),
      },
    ],
    [makeContainer, makeLabeledEllipse, makeLabeledRect],
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
