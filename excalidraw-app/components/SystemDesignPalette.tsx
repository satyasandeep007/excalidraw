import { CaptureUpdateAction, useExcalidrawAPI } from "@excalidraw/excalidraw";
import {
  newElement,
  newTextElement,
  wrapText,
  getLineHeightInPx,
} from "@excalidraw/element";
import {
  randomId,
  viewportCoordsToSceneCoords,
  getFontString,
  getLineHeight,
  DEFAULT_FONT_FAMILY,
} from "@excalidraw/common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LockedIcon,
  UnlockedIcon,
} from "@excalidraw/excalidraw/components/icons";

type ElementSize = { width: number; height: number };

// Small icon set drawn specifically for this palette: each one is a
// miniature of the actual shape it drops onto the canvas (a monitor for
// Client, a cylinder for Postgres, a frame for the Kafka container, etc.)
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

const ClientIcon = (
  <svg {...paletteIconProps}>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

const ServiceIcon = (
  <svg {...paletteIconProps}>
    <path d="M12 2.5l8 4.4v10.2l-8 4.4-8-4.4V6.9z" />
  </svg>
);

const InfraIcon = (
  <svg {...paletteIconProps}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.2 2" />
  </svg>
);

const PostgresIcon = (
  <svg {...paletteIconProps}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v12a7.5 3 0 0 0 15 0V6" />
  </svg>
);

const RedisIcon = (
  <svg {...paletteIconProps}>
    <path
      d="M13 2.5L4.8 13.5h5.6l-1 8 8.2-11h-5.6z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);

const ApiGatewayIcon = (
  <svg {...paletteIconProps}>
    <rect x="2.5" y="7" width="3" height="10" rx="1" />
    <rect x="18.5" y="7" width="3" height="10" rx="1" />
    <path d="M6 12h12" />
    <path d="M14 8.5L18 12l-4 3.5" />
  </svg>
);

const NoteIcon = (
  <svg {...paletteIconProps}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
    <path d="M7 8.5h10M7 12h10M7 15.5h6" />
  </svg>
);

const KafkaIcon = (
  <svg {...paletteIconProps}>
    <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
  </svg>
);

const StateMachineIcon = (
  <svg {...paletteIconProps}>
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="12" r="3" />
    <path d="M9 12h6M12.5 9.5L15 12l-2.5 2.5" />
  </svg>
);

const SystemIcon = (
  <svg {...paletteIconProps}>
    <circle cx="12" cy="12" r="8.5" />
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
const MIN_LABEL_FONT_SIZE = 10;
// Below this, a pointer-up reads as a plain click and places nothing.
const DRAG_CLICK_THRESHOLD = 6;
// Smallest shape a drag can produce; prevents degenerate slivers.
const MIN_DRAG_SIZE = 40;

// Labels are plain (unbound) text elements positioned at a shape's center,
// so unlike a container-bound label they don't auto-wrap or auto-shrink to
// fit. Drag-to-size shapes can end up much smaller than the default, so
// wrap the label to the available width and shrink it until the wrapped
// block fits the available height, instead of letting it spill past the
// shape's edges.
const fitLabelText = (
  text: string,
  availableWidth: number,
  availableHeight: number,
) => {
  let fontSize = Math.min(
    FONT_SIZE,
    Math.max(availableHeight, MIN_LABEL_FONT_SIZE),
  );
  let wrapped = text;

  for (let attempt = 0; attempt < 8; attempt++) {
    const font = getFontString({
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize,
    });
    wrapped = wrapText(text, font, Math.max(availableWidth, fontSize));
    const lineCount = wrapped.split("\n").length;
    const blockHeight =
      getLineHeightInPx(fontSize, getLineHeight(DEFAULT_FONT_FAMILY)) *
      lineCount;

    if (blockHeight <= availableHeight || fontSize <= MIN_LABEL_FONT_SIZE) {
      break;
    }

    fontSize = Math.max(MIN_LABEL_FONT_SIZE, fontSize - 2);
  }

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

        const fitted = fitLabelText(label, width - 16, height - 12);
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
        // block stays clear of the curve at roughly 0.7x the full
        // width/height) so the label doesn't run past the outline.
        const fitted = fitLabelText(label, width * 0.7 - 12, height * 0.7 - 8);
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
        icon: ClientIcon,
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
        icon: ServiceIcon,
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
        icon: InfraIcon,
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
        icon: PostgresIcon,
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
        icon: RedisIcon,
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
        icon: ApiGatewayIcon,
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
        icon: NoteIcon,
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
        icon: KafkaIcon,
        insert: (x, y, size) => makeContainer(x, y, "KAFKA", size),
      },
      {
        id: "state-machine",
        label: "State Machine",
        shortcut: "9",
        icon: StateMachineIcon,
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
        icon: SystemIcon,
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
